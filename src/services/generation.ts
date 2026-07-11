import fs from 'fs-extra';
import { join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl, appendJsonl, ensureJsonlFile } from '../utils/jsonl.js';
import { generateId } from '../utils/ids.js';
import { getAudioProvider } from './provider-factory.js';
import { probeAudio } from './audio/ffprobe.js';
import { hashFile } from './audio/hash.js';
import { writeMetadata, buildMetadataFromTake } from './audio/metadata.js';
import type { Actor, Media, Take, GenerationJob, GenerationJobItemSummary, Bin } from '../types/index.js';

const DEBUG_BATCH_GENERATION = false;

export interface BatchGenerationOptions {
    actorId?: string;
    contentType?: 'dialogue' | 'music' | 'sfx';
    mediaType?: 'dialogue' | 'music' | 'sfx';
    dryRun?: boolean;
}

export interface BatchGenerationResult {
    job: GenerationJob;
}

export async function runBatchGeneration(
    projectRoot: string,
    options: BatchGenerationOptions = {}
): Promise<BatchGenerationResult> {
    const paths = getProjectPaths(projectRoot);

    await ensureJsonlFile(paths.catalog.takes);

    const [actors, mediaItems, existingTakes, bins] = await Promise.all([
        readJsonl<Actor>(paths.catalog.actors),
        readJsonl<Media>(paths.catalog.media),
        readJsonl<Take>(paths.catalog.takes),
        readJsonl<Bin>(paths.catalog.bins),
    ]);

    const actorsById = new Map<string, Actor>(actors.map((a) => [a.id, a]));
    const binsById = new Map<string, Bin>(bins.map((b) => [b.id, b]));

    const provider = await getAudioProvider(projectRoot);

    const startedAt = new Date().toISOString();
    const job: GenerationJob = {
        id: generateId(),
        started_at: startedAt,
        status: 'running',
        total_media: 0,
        total_takes_created: 0,
        items: [],
    };

    const items: GenerationJobItemSummary[] = [];

    // Filter media: incomplete only, optional actor/mediaType filters
    const requestedType = options.contentType ?? options.mediaType;
    const filteredMedia = mediaItems.filter((m) => {
        if (m.all_approved) return false;
        if (options.actorId && m.owner_id !== options.actorId) return false;
        if (requestedType && m.media_type !== requestedType) return false;
        return true;
    });

    for (const media of filteredMedia) {
        const itemSummary: GenerationJobItemSummary = {
            media_id: media.id,
            generated_takes: 0,
        };

        const actor = actorsById.get(media.owner_id || '');
        if (!actor && media.owner_type === 'actor') {
            itemSummary.error = 'actor_not_found';
            items.push(itemSummary);
            continue;
        }

        // Use the standard block resolver to determine needed counts
        const { resolveDefaultBlock } = await import('../utils/defaultBlockResolver.js');
        const bin = binsById.get(media.bin_id);

        if (!bin) {
            itemSummary.error = 'bin_not_found';
            items.push(itemSummary);
            continue;
        }

        // Load global defaults if needed for resolution
        const defaultsPath = join(paths.root, 'defaults.json');
        let globalDefaults: any = null;
        if (await fs.pathExists(defaultsPath)) {
            globalDefaults = await fs.readJson(defaultsPath);
        }

        const resolved = resolveDefaultBlock(media.media_type, media, bin, actor, globalDefaults);
        const settings = resolved.settings;

        // For now we only support dialogue generation
        if (media.media_type !== 'dialogue') {
            items.push(itemSummary);
            continue;
        }

        const targetApprovals = settings.approval_count_default ?? 1;
        const minCandidates = settings.min_candidates ?? 1;

        const takesForMedia = existingTakes.filter((t) => t.media_id === media.id);
        const approvedCount = takesForMedia.filter((t) => t.status === 'approved').length;
        const undecidedCount = takesForMedia.filter((t) => t.status === 'new').length;

        // Don't backfill if we already have enough approved takes
        let needed = 0;
        if (approvedCount < targetApprovals) {
            needed = Math.max(0, minCandidates - undecidedCount);
        }

        if (needed <= 0) {
            items.push(itemSummary);
            continue;
        }

        if (options.dryRun) {
            itemSummary.generated_takes = needed;
            items.push(itemSummary);
            continue;
        }

        const baseTakeNumber = takesForMedia.reduce((max, t) => Math.max(max, t.take_number), 0);

        for (let i = 1; i <= needed; i++) {
            try {
                const buffer = await provider.generateDialogue(media.prompt || media.name, settings.voice_id ?? '', {
                    stability: settings.stability,
                    similarity_boost: settings.similarity_boost,
                }, settings.model_id);

                const takeNumber = baseTakeNumber + i;

                // Construct path using common utility
                const { constructTakePath } = await import('../utils/pathConstruction.js');
                const relativePath = constructTakePath(media, bin, takeNumber, actor?.base_filename);
                const fullFilePath = join(paths.root, relativePath);
                const folderPath = join(projectRoot, join(paths.root, relativePath), '..');

                await fs.ensureDir(folderPath);
                await fs.writeFile(fullFilePath, buffer);

                const probeResult = await probeAudio(fullFilePath);
                const hash = await hashFile(fullFilePath);

                const primaryStream = probeResult.streams[0];
                const durationSec = probeResult.format.duration;

                const now = new Date().toISOString();
                const take: Take = {
                    id: generateId(),
                    media_id: media.id,
                    take_number: takeNumber,
                    filename: join(relativePath).split(/[/\\]/).pop() || 'file.mp3',
                    path: relativePath,
                    status: 'new',
                    format: 'wav',
                    size_bytes: buffer.length,
                    duration_sec: durationSec || 0,
                    hash_sha256: hash,
                    sample_rate: (primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 41000) as any,
                    channels: (primaryStream?.channels || 1) as any,
                    bit_depth: 16,
                    lufs_integrated: 0,
                    peak_dbfs: 0,
                    generation_params: {
                        provider: settings.provider as any,
                        resolved_from: resolved.resolvedFrom as any,
                        full_settings: settings as any,
                        prompt: media.prompt || media.name,
                        owner_type: media.owner_type,
                        owner_id: media.owner_id ?? null,
                        owner_name: actor ? actor.display_name : 'Global',
                        bin_name: bin.name,
                        generated_at: now
                    },
                    created_at: now,
                    updated_at: now,
                };

                await appendJsonl(paths.catalog.takes, take);

                // Embed metadata
                try {
                    const metadata = buildMetadataFromTake(take, media, {
                        actor_name: actor?.display_name || 'Global',
                        bin_name: bin.name,
                    });
                    await writeMetadata(fullFilePath, fullFilePath, metadata);
                } catch (metaErr) {
                    console.warn('[batch-generation] failed to write metadata:', (metaErr as Error).message);
                }

                existingTakes.push(take);
                itemSummary.generated_takes += 1;
            } catch (err) {
                itemSummary.error = (err as Error).message;
                break;
            }
        }

        items.push(itemSummary);
    }

    job.total_media = filteredMedia.length;
    job.items = items;
    job.total_takes_created = items.reduce((sum, item) => sum + item.generated_takes, 0);
    job.status = 'completed';
    job.completed_at = new Date().toISOString();

    return { job };
}
