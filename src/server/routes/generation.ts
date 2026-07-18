import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GenerationJob } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';
import { requestGenerationCancellation, runBatchGeneration } from '../../services/generation.js';
import fs from 'fs-extra';
import { readCatalog } from './snapshots.js';
import { resolveDefaultBlock } from '../../utils/defaultBlockResolver.js';
import { hasCommand } from '../../services/generation-preflight.js';
import { calculateCueLifecycle } from '../../services/cue-lifecycle.js';
import { createDefaultGeneratorRegistry } from '../../services/generators/factory.js';
import type {
  AssetKind,
  DeliveryRequirements,
  GenerationRequest,
  ProviderCapabilities,
  VideoAspectRatio,
} from '../../services/generators/types.js';
import { evaluateMultimediaPreflight, type PreflightCheck } from '../../services/multimedia-preflight.js';
import {
  getGenerationProviderSettings,
  listGenerationProviderSettings,
  type GenerationProviderSettings,
} from '../../services/global-config.js';
import {
  estimateProviderOperationCost,
  PROVIDER_COST_CURRENCY,
  PROVIDER_COST_SOURCE_AS_OF,
} from '../../services/provider-costs.js';
import { getExtensionForType } from '../../utils/pathConstruction.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerGenerationRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/generation/preflight', async (request: FastifyRequest<{ Querystring: { media_id?: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const mediaId = request.query.media_id;
    if (!mediaId) {
      reply.code(400);
      return { error: 'media_id is required' };
    }

    const catalog = await readCatalog(ctx.paths);
    const media = catalog.media.find((item) => item.id === mediaId);
    if (!media) {
      reply.code(404);
      return { error: 'Media not found' };
    }
    if (media.media_type === 'text') {
      reply.code(400);
      return { error: 'Generation is not supported for text media' };
    }
    const bin = catalog.bins.find((item) => item.id === media.bin_id) ?? null;
    if (!bin) {
      reply.code(404);
      return { error: 'Media bin not found' };
    }
    const owner = media.owner_type === 'actor'
      ? catalog.actors.find((item) => item.id === media.owner_id) ?? null
      : media.owner_type === 'scene'
        ? catalog.scenes.find((item) => item.id === media.owner_id) ?? null
        : media.owner_type === 'card'
          ? catalog.cards.find((item) => item.id === media.owner_id) ?? null
        : null;
    if (media.owner_type !== 'global' && !owner) {
      reply.code(404);
      return { error: 'Media owner not found' };
    }
    const defaults = await fs.pathExists(ctx.paths.moo.defaults) ? await fs.readJson(ctx.paths.moo.defaults) : null;
    const resolved = resolveDefaultBlock(media.media_type, media, bin, owner, defaults);
    const settings = resolved.settings;
    const assetKind = media.media_type as AssetKind;
    const providerId = settings.provider === 'inherit' ? 'elevenlabs' : settings.provider;
    const [registry, providerSettingsById, backgroundRemovalSettings] = await Promise.all([
      createDefaultGeneratorRegistry(ctx.projectRoot),
      listGenerationProviderSettings(),
      getGenerationProviderSettings('background-removal'),
    ]);
    const generator = registry.get(providerId);
    const providerSettings = providerSettingsById[providerId];
    const effectiveModel = resolveEffectiveModel(providerId, assetKind, settings, providerSettings);
    const delivery = buildDeliveryRequirements(settings, media.media_type);
    const requestSettings = buildRequestSettings(settings, effectiveModel, providerId, assetKind, delivery);
    const generationRequest: GenerationRequest = {
      id: `preflight:${media.id}`,
      assetKind,
      prompt: media.prompt || media.name,
      delivery,
      settings: requestSettings,
      metadata: {
        mediaId: media.id,
        binId: bin.id,
        ownerType: media.owner_type,
        ownerId: media.owner_id,
        resolvedFrom: resolved.resolvedFrom,
      },
    };

    const approvalTarget = settings.approval_count_default ?? 1;
    const minCandidates = settings.min_candidates ?? 1;
    const lifecycle = calculateCueLifecycle(media, catalog.takes, approvalTarget);
    const nextCandidateCount = lifecycle.is_complete
      ? 0
      : Math.max(
          0,
          Math.max(minCandidates, approvalTarget - lifecycle.approved_take_count)
            - lifecycle.new_take_count,
        );

    const backgroundRemovalConfigured = backgroundRemovalSettings?.enabled === true;
    const backgroundRemovalExecutable = stringConfig(
      backgroundRemovalSettings?.config,
      'executable',
    ) ?? 'rembg';
    const [ffprobeAvailable, ffmpegAvailable, backgroundRemovalAvailable] = await Promise.all([
      hasCommand('ffprobe'),
      hasCommand('ffmpeg'),
      backgroundRemovalConfigured
        ? hasCommand(backgroundRemovalExecutable)
        : Promise.resolve(false),
    ]);

    const capabilities: ProviderCapabilities = generator?.capabilities() ?? {
      providerId,
      media: {},
    };
    const cost = estimateProviderOperationCost({
      providerId,
      assetKind,
      model: effectiveModel,
      quality: stringSetting(requestSettings.quality),
      width: delivery.width,
      height: delivery.height,
      imageSize: stringSetting(requestSettings.imageSize),
      durationSeconds: delivery.durationSeconds,
      resolution: resolveCostResolution(providerId, assetKind, delivery, requestSettings),
      profile: stringSetting(requestSettings.profile),
    });
    const evaluated = evaluateMultimediaPreflight({
      request: generationRequest,
      providerId,
      capabilities,
      credentialConfigured: Boolean(generator) && providerSettings?.enabled !== false,
      tools: {
        ffprobe: ffprobeAvailable,
        ffmpeg: ffmpegAvailable,
        backgroundRemoval: backgroundRemovalAvailable,
      },
      candidateCount: nextCandidateCount > 0 ? nextCandidateCount : 1,
      perOperationCost: cost.perOperation,
      currency: cost.known ? cost.currency : undefined,
      jobBudget: finiteSetting(settings.job_budget_usd)
        ?? finiteSetting(providerSettings?.config?.job_budget_usd),
      transparencyPostprocessConfigured: backgroundRemovalConfigured,
    });
    const normalizedChecks = nextCandidateCount === 0
      ? evaluated.checks.filter((check) => check.code !== 'candidate-count-invalid')
      : evaluated.checks;
    const status = summarizeMultimediaStatus(normalizedChecks);
    const checks = normalizedChecks.map(toBackwardCompatibleCheck);
    const estimatedCharacters = assetKind === 'dialogue'
      ? generationRequest.prompt.trim().length * nextCandidateCount
      : null;

    return {
      ready: status !== 'blocked',
      checks,
      estimate: {
        ...evaluated.estimate,
        providerRequests: nextCandidateCount,
        maximumExposure: cost.known
          ? roundUsd((cost.perOperation ?? 0) * nextCandidateCount)
          : undefined,
        currency: PROVIDER_COST_CURRENCY,
        sourceAsOf: PROVIDER_COST_SOURCE_AS_OF,
        model: cost.model,
        profile: cost.profile,
        unit: cost.unit,
        rate: cost.rate,
        takes_to_generate: nextCandidateCount,
        provider_requests: nextCandidateCount,
        estimated_characters: estimatedCharacters,
        quota_remaining_characters: null,
        note: cost.known
          ? `Maximum exposure uses the documented ${cost.model ?? providerId} rate dated ${cost.sourceAsOf}; actual billing can vary.`
          : assetKind === 'dialogue'
            ? 'Character estimate is prompt length × the next required dialogue takes; ElevenLabs pricing is plan/model dependent.'
            : `No documented cost table matches this provider, model, and delivery profile as of ${cost.sourceAsOf}.`,
      },
      status,
      provider: {
        id: providerId,
        configured: Boolean(generator),
        credentialConfigured: Boolean(providerSettings?.api_key?.trim()) || Boolean(generator),
        enabled: providerSettings?.enabled !== false,
        model: effectiveModel,
        settingsResolvedFrom: resolved.resolvedFrom,
      },
      capabilities,
      request: generationRequest,
      lifecycle,
      tools: {
        ffprobe: ffprobeAvailable,
        ffmpeg: ffmpegAvailable,
        rembg: backgroundRemovalAvailable,
      },
      postprocessing: {
        backgroundRemoval: {
          configured: backgroundRemovalConfigured,
          executable: backgroundRemovalExecutable,
          available: backgroundRemovalAvailable,
        },
      },
    };
  });

  fastify.get('/api/jobs', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
    return { jobs };
  });

  fastify.post('/api/generation/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { projectRoot } = ctx;
    const body = request.body as {
      actorId?: string;
      contentType?: 'dialogue' | 'music' | 'sfx';
      dryRun?: boolean;
    } | undefined;

    try {
      const { job } = await runBatchGeneration(projectRoot, {
        actorId: body?.actorId,
        contentType: body?.contentType,
        dryRun: !!body?.dryRun,
      });

      return { job };
    } catch (err) {
      request.log.error(err);
      reply.code(500);
      return { error: (err as Error).message };
    }
  });

  fastify.post('/api/jobs/:id/retry', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const jobs = await readJsonl<GenerationJob>(ctx.paths.catalog.generationJobs);
    const previous = jobs.find((job) => job.id === request.params.id);
    if (!previous) {
      reply.code(404);
      return { error: 'Generation job not found' };
    }
    if (previous.status !== 'failed') {
      reply.code(400);
      return { error: 'Only failed generation jobs can be retried' };
    }
    const requestOptions = previous.request || { dry_run: false };
    const { job } = await runBatchGeneration(ctx.projectRoot, {
      actorId: requestOptions.actor_id,
      binId: requestOptions.bin_id,
      mediaId: requestOptions.media_id,
      mediaType: requestOptions.media_type,
      dryRun: false,
    });
    return { job, retried_job_id: previous.id };
  });

  fastify.post('/api/jobs/:id/cancel', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    try {
      const job = await requestGenerationCancellation(ctx.projectRoot, request.params.id);
      return { job, message: 'Cancellation requested. The current provider request will finish; no further requests will be sent.' };
    } catch (error) {
      reply.code((error as Error).message === 'Generation job not found' ? 404 : 400);
      return { error: (error as Error).message };
    }
  });
}

type ResolvedSettings = ReturnType<typeof resolveDefaultBlock>['settings'];

function buildDeliveryRequirements(
  settings: ResolvedSettings,
  mediaType: Exclude<AssetKind | 'text', 'text'>,
): DeliveryRequirements {
  const configuredSize = typeof settings.size === 'string'
    ? /^(\d+)x(\d+)$/.exec(settings.size.trim())
    : null;
  return {
    format: getExtensionForType(mediaType),
    width: finiteSetting(settings.width) ?? (configuredSize ? Number(configuredSize[1]) : undefined),
    height: finiteSetting(settings.height) ?? (configuredSize ? Number(configuredSize[2]) : undefined),
    aspectRatio: videoAspectRatio(settings.aspect_ratio),
    durationSeconds: finiteSetting(settings.duration_seconds),
    frameRate: finiteSetting(settings.fps),
    transparency: typeof settings.transparency === 'boolean' ? settings.transparency : undefined,
  };
}

function buildRequestSettings(
  settings: ResolvedSettings,
  effectiveModel: string | undefined,
  providerId: string,
  assetKind: AssetKind,
  delivery: DeliveryRequirements,
): NonNullable<GenerationRequest['settings']> {
  const configuredImageSize = stringSetting(settings.image_size);
  const configuredResolution = stringSetting(settings.resolution)
    ?? (assetKind === 'video' ? videoResolutionFromDimensions(delivery) : undefined)
    ?? (assetKind === 'video' && (providerId === 'openai' || providerId === 'google') ? '720p' : undefined);
  return {
    ...settings,
    ...(effectiveModel ? { model: effectiveModel } : {}),
    voiceId: settings.voice_id,
    voice: {
      stability: settings.stability,
      similarity_boost: settings.similarity_boost,
    },
    modelId: settings.model_id,
    imageSize: configuredImageSize,
    resolution: configuredResolution,
    music: { duration_seconds: settings.duration_seconds },
    sfx: { duration_seconds: settings.duration_seconds },
  };
}

function resolveEffectiveModel(
  providerId: string,
  assetKind: AssetKind,
  settings: ResolvedSettings,
  providerSettings: GenerationProviderSettings | undefined,
): string | undefined {
  const configKey = assetKind === 'image'
    ? 'image_model'
    : assetKind === 'video' ? 'video_model' : 'audio_model';
  const configured = stringConfig(providerSettings?.config, configKey);
  if (configured) return configured;

  const genericProviderModel = providerSettings?.model?.trim();
  if (genericProviderModel && modelMatchesKind(genericProviderModel, providerId, assetKind)) {
    return genericProviderModel;
  }
  if (assetKind === 'dialogue' || assetKind === 'music' || assetKind === 'sfx') {
    return stringSetting(settings.model_id);
  }
  return stringSetting(settings.model);
}

function modelMatchesKind(model: string, providerId: string, assetKind: AssetKind): boolean {
  if (providerId === 'openai') {
    return assetKind === 'image' ? model.startsWith('gpt-image') : assetKind === 'video' && model.startsWith('sora');
  }
  if (providerId === 'google') {
    return assetKind === 'image' ? model.startsWith('gemini') : assetKind === 'video' && model.startsWith('veo');
  }
  return true;
}

function videoAspectRatio(value: unknown): VideoAspectRatio | undefined {
  return value === '16:9' || value === '9:16' ? value : undefined;
}

function videoResolutionFromDimensions(delivery: DeliveryRequirements): string | undefined {
  const longest = Math.max(delivery.width ?? 0, delivery.height ?? 0);
  const shortest = Math.min(
    delivery.width ?? Number.POSITIVE_INFINITY,
    delivery.height ?? Number.POSITIVE_INFINITY,
  );
  if (longest === 1920 && shortest === 1080) return '1080p';
  if (longest === 1280 && shortest === 720) return '720p';
  return undefined;
}

function resolveCostResolution(
  providerId: string,
  assetKind: AssetKind,
  delivery: DeliveryRequirements,
  requestSettings: NonNullable<GenerationRequest['settings']>,
): string | undefined {
  if (assetKind !== 'video') return undefined;
  return stringSetting(requestSettings.resolution)
    ?? videoResolutionFromDimensions(delivery)
    ?? (providerId === 'openai' || providerId === 'google' ? '720p' : undefined);
}

function stringConfig(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  return stringSetting(config?.[key]);
}

function stringSetting(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteSetting(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function summarizeMultimediaStatus(checks: PreflightCheck[]): 'ready' | 'warning' | 'blocked' {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'warning')) return 'warning';
  return 'ready';
}

function toBackwardCompatibleCheck(check: PreflightCheck) {
  return { ...check, id: check.code };
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
