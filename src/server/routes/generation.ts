import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GenerationJob } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';
import { requestGenerationCancellation, runBatchGeneration } from '../../services/generation.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerGenerationRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
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
