import fs from 'fs-extra';
import { join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../utils/jsonl.js';
import { generateId } from '../utils/ids.js';
import type { Actor, Defaults, Media, Take, GenerationJob, GenerationJobItemSummary, Bin, Scene } from '../types/index.js';
import { getExtensionForType } from '../utils/pathConstruction.js';
import { calculateCueLifecycle } from './cue-lifecycle.js';
import { createDefaultGeneratorRegistry } from './generators/factory.js';
import type {
    AssetGenerator,
    AssetKind,
    DeliveryRequirements,
    GenerationRequest,
    ProviderOperation,
    VideoAspectRatio,
} from './generators/types.js';
import { GenerationOperationStore } from './generation-operation-store.js';
import type { RequestedDeliveryProfile } from '../shared/schemas/generation-operation.schema.js';
import { writeCandidate } from './candidate-writer.js';

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

function asAssetKind(mediaType: Media['media_type']): AssetKind {
    if (mediaType === 'text') throw new Error('Generation not supported for text');
    return mediaType;
}

function asVideoAspectRatio(value: unknown): VideoAspectRatio | undefined {
    return value === '16:9' || value === '9:16' ? value : undefined;
}

function buildDeliveryRequirements(settings: Record<string, unknown>, mediaType: Media['media_type']): DeliveryRequirements {
    return {
        format: getExtensionForType(mediaType),
        width: typeof settings.width === 'number' ? settings.width : undefined,
        height: typeof settings.height === 'number' ? settings.height : undefined,
        aspectRatio: asVideoAspectRatio(settings.aspect_ratio),
        durationSeconds: typeof settings.duration_seconds === 'number' ? settings.duration_seconds : undefined,
        frameRate: typeof settings.fps === 'number' ? settings.fps : undefined,
        transparency: typeof settings.transparency === 'boolean' ? settings.transparency : undefined,
    };
}

function toRequestedDeliveryProfile(delivery: DeliveryRequirements): RequestedDeliveryProfile {
    return {
        width: delivery.width,
        height: delivery.height,
        duration_sec: delivery.durationSeconds,
        fps: delivery.frameRate,
        format: delivery.format,
        video_aspect_ratio: delivery.aspectRatio,
    };
}

async function waitForProviderCompletion(
    generator: AssetGenerator,
    initial: ProviderOperation,
    onTransition: (operation: ProviderOperation) => Promise<void>,
): Promise<ProviderOperation> {
    let operation = initial;
    while (operation.status === 'submitted' || operation.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        operation = await generator.poll(operation);
        await onTransition(operation);
    }
    return operation;
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

    let registry: Awaited<ReturnType<typeof createDefaultGeneratorRegistry>> | null = null;
    try {
      registry = options.dryRun ? null : await createDefaultGeneratorRegistry(projectRoot);
      const operationStore = new GenerationOperationStore(projectRoot);

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
                if (!registry) throw new Error('Generator registry unavailable');
                const prompt = media.prompt || media.name;
                const assetKind = asAssetKind(media.media_type);
                const providerId = settings.provider === 'inherit' ? 'elevenlabs' : settings.provider;
                const generator = registry.get(providerId);
                if (!generator || !registry.supports(providerId, assetKind)) {
                    throw new Error(`${providerId} does not support ${assetKind} generation`);
                }
                if (assetKind === 'dialogue' && !settings.voice_id) {
                    throw new Error('No voice_id resolved for dialogue');
                }

                const delivery = buildDeliveryRequirements(settings, media.media_type);
                const generationRequest: GenerationRequest = {
                    id: generateId(),
                    assetKind,
                    prompt,
                    delivery,
                    settings: {
                        voiceId: settings.voice_id,
                        voice: {
                            stability: settings.stability,
                            similarity_boost: settings.similarity_boost,
                        },
                        modelId: settings.model_id,
                        music: { duration_seconds: settings.duration_seconds },
                        sfx: { duration_seconds: settings.duration_seconds },
                    },
                    metadata: {
                        generationJobId: job.id,
                        mediaId: media.id,
                    },
                };

                let providerOperation = await generator.submit(generationRequest);
                const persistedOperation = await operationStore.create({
                    generation_job_id: job.id,
                    media_id: media.id,
                    asset_kind: assetKind,
                    request_id: generationRequest.id,
                    provider: providerOperation.providerId,
                    provider_operation_id: providerOperation.operationId,
                    provider_metadata: providerOperation.providerMetadata,
                    requested_delivery_profile: toRequestedDeliveryProfile(delivery),
                    status: providerOperation.status,
                    error: providerOperation.error,
                });
                providerOperation = await waitForProviderCompletion(
                    generator,
                    providerOperation,
                    async next => {
                        await operationStore.update(persistedOperation.id, {
                            status: next.status,
                            provider_metadata: next.providerMetadata,
                            error: next.error,
                            last_polled_at: new Date().toISOString(),
                        });
                    },
                );
                if (providerOperation.status === 'failed') {
                    throw new Error(providerOperation.error || `${providerId} generation failed`);
                }
                const generatedAsset = await generator.download(providerOperation);
                const takeNumber = baseTakeNumber + i;
                const { take } = await writeCandidate({
                    projectRoot,
                    paths,
                    media,
                    bin,
                    owner: owner ?? undefined,
                    takeNumber,
                    generatedAsset,
                    providerOperation,
                    settings,
                    resolvedFrom: resolved.resolvedFrom,
                    delivery,
                });
                await operationStore.update(persistedOperation.id, { downloaded_take_id: take.id });

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
