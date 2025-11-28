import fs from 'fs-extra';
import { join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl, appendJsonl, ensureJsonlFile } from '../utils/jsonl.js';
import { generateId } from '../utils/ids.js';
import { getAudioProvider } from './provider-factory.js';
import { probeAudio } from './audio/ffprobe.js';
import { hashFile } from './audio/hash.js';
import type { Actor, Content, Take, GenerationJob, GenerationJobItemSummary } from '../types/index.js';

const DEBUG_BATCH_GENERATION = false;

export interface BatchGenerationOptions {
    actorId?: string;
    contentType?: 'dialogue' | 'music' | 'sfx';
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
    await ensureJsonlFile(paths.catalog.generationJobs);

    const [actors, contentItems, existingTakes] = await Promise.all([
        readJsonl<Actor>(paths.catalog.actors),
        readJsonl<Content>(paths.catalog.content),
        readJsonl<Take>(paths.catalog.takes),
    ]);

    const actorsById = new Map<string, Actor>(actors.map((a) => [a.id, a]));

    const provider = await getAudioProvider(projectRoot);

    const startedAt = new Date().toISOString();
    const job: GenerationJob = {
        id: generateId(),
        started_at: startedAt,
        status: 'running',
        total_content: 0,
        total_takes_created: 0,
        items: [],
    };

    const items: GenerationJobItemSummary[] = [];

    // Filter content: incomplete only, optional actor/content_type filters
    const filteredContent = contentItems.filter((c) => {
        if (c.complete) return false;
        if (options.actorId && c.actor_id !== options.actorId) return false;
        if (options.contentType && c.content_type !== options.contentType) return false;
        return true;
    });

    for (const content of filteredContent) {
        const itemSummary: GenerationJobItemSummary = {
            content_id: content.id,
            generated_takes: 0,
        };

        const actor = actorsById.get(content.actor_id);
        if (!actor) {
            itemSummary.error = 'actor_not_found';
            items.push(itemSummary);
            continue;
        }

        // For now we only support dialogue generation
        const providerSettings = actor.provider_settings?.dialogue;
        if (!providerSettings || providerSettings.provider !== 'elevenlabs') {
            items.push(itemSummary);
            continue;
        }

        // Only support dialogue generation for now
        if (content.content_type !== 'dialogue') {
            items.push(itemSummary);
            continue;
        }

        const targetApprovals = providerSettings.approval_count_default ?? 0;
        if (targetApprovals <= 0) {
            items.push(itemSummary);
            continue;
        }

        const takesForContent = existingTakes.filter((t) => t.content_id === content.id);
        const approvedCount = takesForContent.filter((t) => t.status === 'approved').length;
        const needed = targetApprovals - approvedCount;
        if (needed <= 0) {
            items.push(itemSummary);
            continue;
        }

        if (options.dryRun) {
            itemSummary.generated_takes = needed;
            items.push(itemSummary);
            continue;
        }

        const baseTakeNumber = takesForContent.reduce((max, t) => Math.max(max, t.take_number), 0);

        for (let i = 1; i <= needed; i++) {
            try {
                const stability = providerSettings.stability;
                const similarity_boost = providerSettings.similarity_boost;

                const buffer = await provider.generateDialogue(content.prompt, providerSettings.voice_id ?? '', {
                    stability,
                    similarity_boost,
                });

                const takeNumber = baseTakeNumber + i;
                const filename = `${actor.base_filename}${content.cue_id}_take${takeNumber}.wav`;
                const mediaDir = join(paths.media, 'actors', actor.id, 'dialogue', content.id, 'raw');
                const filePath = join(mediaDir, filename);

                await fs.ensureDir(mediaDir);
                await fs.writeFile(filePath, buffer);

                if (DEBUG_BATCH_GENERATION) {
                    console.log('[batch-generation] wrote raw file', filePath);
                }

                const probeResult = await probeAudio(filePath);
                const hash = await hashFile(filePath);

                const primaryStream = probeResult.streams[0];
                const durationSec = probeResult.format.duration;
                const rawSampleRate = primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 44100;
                const rawChannels = primaryStream?.channels ?? 1;

                const sampleRate = rawSampleRate === 48000 ? 48000 : 44100;
                const channels = rawChannels === 2 ? 2 : 1;

                const now = new Date().toISOString();
                const take: Take = {
                    id: generateId(),
                    content_id: content.id,
                    take_number: takeNumber,
                    filename,
                    status: 'new',
                    path: filePath,
                    hash_sha256: hash,
                    duration_sec: durationSec,
                    format: 'wav',
                    sample_rate: sampleRate,
                    bit_depth: 16,
                    channels,
                    lufs_integrated: 0,
                    peak_dbfs: 0,
                    generated_by: 'elevenlabs',
                    generation_params: {
                        provider: 'elevenlabs',
                    },
                    created_at: now,
                    updated_at: now,
                };

                await appendJsonl(paths.catalog.takes, take);
                existingTakes.push(take);
                itemSummary.generated_takes += 1;
            } catch (err) {
                itemSummary.error = (err as Error).message;
                break;
            }
        }

        items.push(itemSummary);
    }

    job.total_content = filteredContent.length;
    job.items = items;
    job.total_takes_created = items.reduce((sum, item) => sum + item.generated_takes, 0);
    job.status = 'completed';
    job.completed_at = new Date().toISOString();

    await appendJsonl(paths.catalog.generationJobs, job);

    return { job };
}
