import fs from 'fs-extra';
import { dirname, join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../utils/jsonl.js';
import { generateId } from '../utils/ids.js';
import { getAudioProvider } from './provider-factory.js';
import { probeAudio } from './audio/ffprobe.js';
import { hashFile } from './audio/hash.js';
import { writeMetadata, buildMetadataFromTake } from './audio/metadata.js';
import type { Actor, Defaults, Media, Take, GenerationJob, GenerationJobItemSummary, Bin, Scene } from '../types/index.js';
import { getExtensionForType } from '../utils/pathConstruction.js';
import { calculateCueLifecycle } from './cue-lifecycle.js';

export interface BatchGenerationOptions {
    actorId?: string;
    binId?: string;
    mediaId?: string;
    contentType?: 'dialogue' | 'music' | 'sfx' | 'image' | 'video';
    mediaType?: 'dialogue' | 'music' | 'sfx' | 'image' | 'video';
    /** Explicit candidate count for a single-media "Generate More" request. */
    count?: number;
    dryRun?: boolean;
}

export interface BatchGenerationResult {
    job: GenerationJob;
}

export async function requestGenerationCancellation(projectRoot: string, jobId: string): Promise<GenerationJob> {
    const paths = getProjectPaths(projectRoot);
    const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
    const index = jobs.findIndex((job) => job.id === jobId);
    if (index < 0) throw new Error('Generation job not found');
    if (jobs[index].status !== 'running') throw new Error('Only running generation jobs can be cancelled');

    const updated = { ...jobs[index], cancel_requested_at: jobs[index].cancel_requested_at ?? new Date().toISOString() };
    jobs[index] = updated;
    await writeJsonlAll(paths.catalog.generationJobs, jobs);
    return updated;
}

async function isCancellationRequested(paths: ReturnType<typeof getProjectPaths>, jobId: string): Promise<boolean> {
    const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
    return jobs.some((job) => job.id === jobId && Boolean(job.cancel_requested_at));
}

const activeBatchRuns = new Map<string, Promise<BatchGenerationResult>>();

function batchRequestKey(projectRoot: string, options: BatchGenerationOptions): string {
    return JSON.stringify({
        projectRoot,
        actorId: options.actorId ?? null,
        binId: options.binId ?? null,
        mediaId: options.mediaId ?? null,
        contentType: options.contentType ?? options.mediaType ?? null,
        count: options.count ?? null,
        dryRun: !!options.dryRun,
    });
}

export function runBatchGeneration(
    projectRoot: string,
    options: BatchGenerationOptions = {},
): Promise<BatchGenerationResult> {
    const key = batchRequestKey(projectRoot, options);
    const active = activeBatchRuns.get(key);
    if (active) return active;

    const run = executeBatchGeneration(projectRoot, options).finally(() => activeBatchRuns.delete(key));
    activeBatchRuns.set(key, run);
    return run;
}

async function executeBatchGeneration(
    projectRoot: string,
    options: BatchGenerationOptions = {}
): Promise<BatchGenerationResult> {
    const paths = getProjectPaths(projectRoot);

    await Promise.all([
        ensureJsonlFile(paths.catalog.takes),
        ensureJsonlFile(paths.catalog.generationJobs),
    ]);

    const [actors, scenes, mediaItems, existingTakes, bins] = await Promise.all([
        readJsonl<Actor>(paths.catalog.actors),
        readJsonl<Scene>(paths.catalog.scenes),
        readJsonl<Media>(paths.catalog.media),
        readJsonl<Take>(paths.catalog.takes),
        readJsonl<Bin>(paths.catalog.bins),
    ]);

    const actorsById = new Map<string, Actor>(actors.map((a) => [a.id, a]));
    const scenesById = new Map<string, Scene>(scenes.map((s) => [s.id, s]));
    const binsById = new Map<string, Bin>(bins.map((b) => [b.id, b]));

    const startedAt = new Date().toISOString();
    const job: GenerationJob = {
        id: generateId(),
        started_at: startedAt,
        status: 'running',
        total_media: 0,
        total_takes_created: 0,
        items: [],
        request: {
            actor_id: options.actorId,
            bin_id: options.binId,
            media_id: options.mediaId,
            media_type: options.contentType ?? options.mediaType,
            count: options.count,
            dry_run: !!options.dryRun,
        },
    };

    const items: GenerationJobItemSummary[] = [];
    await appendJsonl(paths.catalog.generationJobs, job);

    let provider: Awaited<ReturnType<typeof getAudioProvider>> | null = null;
    try {
      provider = options.dryRun ? null : await getAudioProvider(projectRoot);

    // Filter media by requested scope. Completion is evaluated from the
    // canonical lifecycle below, after each cue's settings are resolved.
    const requestedType = options.contentType ?? options.mediaType;
    const filteredMedia = mediaItems.filter((m) => {
        if (options.actorId && m.owner_id !== options.actorId) return false;
        if (options.binId && m.bin_id !== options.binId) return false;
        if (options.mediaId && m.id !== options.mediaId) return false;
        if (requestedType && m.media_type !== requestedType) return false;
        return true;
    });

    let cancelled = false;
    for (const media of filteredMedia) {
        if (await isCancellationRequested(paths, job.id)) {
            cancelled = true;
            break;
        }
        const itemSummary: GenerationJobItemSummary = {
            media_id: media.id,
            generated_takes: 0,
            take_ids: [],
        };

        const owner = media.owner_type === 'actor'
            ? actorsById.get(media.owner_id || '') ?? null
            : media.owner_type === 'scene'
                ? scenesById.get(media.owner_id || '') ?? null
                : null;
        if (!owner && media.owner_type !== 'global') {
            itemSummary.error = 'owner_not_found';
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
        let globalDefaults: Defaults | null = null;
        if (await fs.pathExists(defaultsPath)) {
            globalDefaults = await fs.readJson(defaultsPath);
        }

        const resolved = resolveDefaultBlock(media.media_type, media, bin, owner, globalDefaults);
        const settings = resolved.settings;

        const targetApprovals = settings.approval_count_default ?? 1;
        const minCandidates = settings.min_candidates ?? 1;

        const takesForMedia = existingTakes.filter((t) => t.media_id === media.id);
        const approvedCount = takesForMedia.filter((t) => t.status === 'approved').length;
        const undecidedCount = takesForMedia.filter((t) => t.status === 'new').length;
        const lifecycle = calculateCueLifecycle(media, existingTakes, targetApprovals);

        if (lifecycle.is_complete) {
            continue;
        }

        // Don't backfill if we already have enough approved takes
        // Approval is the budget stop condition. Once the cue has enough good
        // takes, do not spend more tokens merely to satisfy a larger candidate
        // pool setting. Until then, maintain the review pool and ensure enough
        // candidates exist to make the remaining approvals possible.
        const explicitCount = options.mediaId && options.count !== undefined
            ? Math.max(0, Math.floor(options.count))
            : null;
        const needed = lifecycle.is_complete
            ? 0
            : explicitCount ?? Math.max(0, Math.max(minCandidates, targetApprovals - approvedCount) - undecidedCount);

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
            // Deliberately check only between provider calls. An in-flight
            // ElevenLabs request is allowed to complete and is saved as a take.
            if (await isCancellationRequested(paths, job.id)) {
                cancelled = true;
                break;
            }
            try {
                if (!provider) throw new Error('Audio provider unavailable');
                const prompt = media.prompt || media.name;
                let buffer: Buffer;
                if (media.media_type === 'dialogue') {
                    if (!settings.voice_id) throw new Error('No voice_id resolved for dialogue');
                    buffer = await provider.generateDialogue(prompt, settings.voice_id, {
                        stability: settings.stability,
                        similarity_boost: settings.similarity_boost,
                    }, settings.model_id);
                } else if (media.media_type === 'music') {
                    buffer = await provider.generateMusic(prompt, { duration_seconds: settings.duration_seconds });
                } else if (media.media_type === 'sfx') {
                    buffer = await provider.generateSFX(prompt, { duration_seconds: settings.duration_seconds });
                } else {
                    throw new Error(`Generation not supported for ${media.media_type}`);
                }

                const takeNumber = baseTakeNumber + i;

                // Construct path using common utility
                const { constructTakePath } = await import('../utils/pathConstruction.js');
                const actorBaseFilename = owner && 'base_filename' in owner ? owner.base_filename : undefined;
                const relativePath = constructTakePath(media, bin, takeNumber, actorBaseFilename);
                const fullFilePath = join(paths.root, relativePath);
                const folderPath = dirname(fullFilePath);

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
                    format: getExtensionForType(media.media_type),
                    size_bytes: buffer.length,
                    duration_sec: durationSec || 0,
                    hash_sha256: hash,
                    sample_rate: primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 41000,
                    channels: primaryStream?.channels || 1,
                    bit_depth: 16,
                    lufs_integrated: 0,
                    peak_dbfs: 0,
                    generation_params: {
                        provider: settings.provider,
                        resolved_from: resolved.resolvedFrom,
                        full_settings: settings,
                        prompt,
                        owner_type: media.owner_type,
                        owner_id: media.owner_id ?? null,
                        owner_name: owner ? ('display_name' in owner ? owner.display_name : owner.name) : 'Global',
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
                        actor_name: owner && 'display_name' in owner ? owner.display_name : 'Global',
                        bin_name: bin.name,
                    });
                    await writeMetadata(fullFilePath, fullFilePath, metadata);
                } catch (metaErr) {
                    console.warn('[batch-generation] failed to write metadata:', (metaErr as Error).message);
                }

                existingTakes.push(take);
                itemSummary.generated_takes += 1;
                itemSummary.take_ids?.push(take.id);
            } catch (err) {
                itemSummary.error = (err as Error).message;
                break;
            }
        }

        items.push(itemSummary);
        if (cancelled) break;
    }

    job.total_media = items.length;
    job.items = items;
    job.total_takes_created = items.reduce((sum, item) => sum + item.generated_takes, 0);
      job.status = cancelled ? 'cancelled' : items.some((item) => item.error) ? 'failed' : 'completed';
      job.completed_at = new Date().toISOString();
      return { job };
    } catch (error) {
      job.status = 'failed';
      job.completed_at = new Date().toISOString();
      job.items = items;
      throw error;
    } finally {
      const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
      const jobIndex = jobs.findIndex((candidate) => candidate.id === job.id);
      if (jobIndex >= 0) {
        const cancelRequestedAt = jobs[jobIndex].cancel_requested_at;
        if (cancelRequestedAt) {
          job.cancel_requested_at = cancelRequestedAt;
          if (job.status === 'running') job.status = 'cancelled';
        }
        jobs[jobIndex] = job;
      }
      else jobs.push(job);
      await writeJsonlAll(paths.catalog.generationJobs, jobs);
    }
}
