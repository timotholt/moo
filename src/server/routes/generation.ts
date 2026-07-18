import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GenerationJob } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';
import { requestGenerationCancellation, runBatchGeneration } from '../../services/generation.js';
import fs from 'fs-extra';
import type { Take } from '../../types/index.js';
import { TakeSchema } from '../../shared/schemas/index.js';
import { readCatalog } from './snapshots.js';
import { resolveDefaultBlock } from '../../utils/defaultBlockResolver.js';
import { estimateGenerationSpend, hasCommand, summarizePreflight, type PreflightCheck } from '../../services/generation-preflight.js';
import { getAudioProvider } from '../../services/provider-factory.js';

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

    const [catalog, takes] = await Promise.all([
      readCatalog(ctx.paths),
      readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema),
    ]);
    const media = catalog.media.find((item) => item.id === mediaId);
    if (!media) {
      reply.code(404);
      return { error: 'Media not found' };
    }
    const bin = catalog.bins.find((item) => item.id === media.bin_id) ?? null;
    const owner = media.owner_type === 'actor'
      ? catalog.actors.find((item) => item.id === media.owner_id) ?? null
      : media.owner_type === 'scene'
        ? catalog.scenes.find((item) => item.id === media.owner_id) ?? null
        : media.owner_type === 'card'
          ? catalog.cards.find((item) => item.id === media.owner_id) ?? null
        : null;
    const defaults = await fs.pathExists(ctx.paths.moo.defaults) ? await fs.readJson(ctx.paths.moo.defaults) : null;
    const settings = resolveDefaultBlock(media.media_type, media, bin, owner, defaults).settings;
    const checks: PreflightCheck[] = [];

    let provider: Awaited<ReturnType<typeof getAudioProvider>> | null = null;
    try {
      provider = await getAudioProvider(ctx.projectRoot);
      checks.push({ id: 'provider', status: 'ready', message: 'ElevenLabs provider configured' });
    } catch (error) {
      checks.push({ id: 'provider', status: 'blocked', message: (error as Error).message });
    }
    if (media.media_type === 'dialogue' && !settings.voice_id) {
      checks.push({ id: 'voice', status: 'blocked', message: 'Dialogue needs a resolved ElevenLabs voice before generation.' });
    } else {
      checks.push({ id: 'voice', status: 'ready', message: media.media_type === 'dialogue' ? 'Dialogue voice resolved' : 'No voice required for this media type' });
    }
    const [hasFfprobe, hasFfmpeg] = await Promise.all([hasCommand('ffprobe'), hasCommand('ffmpeg')]);
    checks.push(hasFfprobe
      ? { id: 'ffprobe', status: 'ready', message: 'ffprobe is available for audio metadata' }
      : { id: 'ffprobe', status: 'blocked', message: 'ffprobe is required to read generated audio metadata. Install ffmpeg.' });
    checks.push(hasFfmpeg
      ? { id: 'ffmpeg', status: 'ready', message: 'ffmpeg is available for embedded audio metadata' }
      : { id: 'ffmpeg', status: 'warning', message: 'ffmpeg is unavailable; generation can continue, but embedded file metadata will be skipped.' });
    const estimate = estimateGenerationSpend({
      mediaType: media.media_type as 'dialogue' | 'music' | 'sfx',
      prompt: media.prompt || media.name,
      approvalTarget: settings.approval_count_default ?? 1,
      minCandidates: settings.min_candidates ?? 1,
      takes: takes.filter((take) => take.media_id === media.id),
      completionOverride: media.completion_override,
    });
    let quotaRemainingCharacters: number | null = null;
    if (provider && media.media_type === 'dialogue') {
      try {
        const quota = await provider.getQuota();
        quotaRemainingCharacters = Math.max(0, quota.character_limit - quota.character_count);
        if (estimate.estimated_characters !== null && estimate.estimated_characters > quotaRemainingCharacters) {
          checks.push({ id: 'quota', status: 'blocked', message: `This cue needs about ${estimate.estimated_characters} characters; only ${quotaRemainingCharacters} remain.` });
        } else {
          checks.push({ id: 'quota', status: 'ready', message: `${quotaRemainingCharacters} ElevenLabs characters remain after this estimate.` });
        }
      } catch {
        checks.push({ id: 'quota', status: 'warning', message: 'Could not read ElevenLabs quota; character estimate is still shown.' });
      }
    }
    const summary = summarizePreflight(checks);
    return {
      ...summary,
      estimate: {
        ...estimate,
        quota_remaining_characters: quotaRemainingCharacters,
        note: estimate.estimated_characters === null
          ? 'MOO can estimate requests for this media type, but ElevenLabs pricing is plan/model dependent.'
          : 'Character estimate is prompt length × the next required dialogue takes; actual billed characters can vary by provider behavior.',
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
