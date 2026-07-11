import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { runBatchGeneration } from '../../services/generation.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerBatchRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  /**
   * POST /api/batch/backfill-takes
   * 
   * For each media item whose derived lifecycle is not complete:
   * - Count undecided takes (status = 'new')
   * - If undecided < min_candidates, generate (min_candidates - undecided) new takes
   * 
   * Query params:
   * - actor_id: optional, limit to specific actor
   * - bin_id: optional, limit to specific bin
   * - media_id: optional, limit to specific media item
   * - dry_run: if true, just return what would be generated without generating
   */
  fastify.post('/api/batch/backfill-takes', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const query = request.query as {
      actor_id?: string;
      bin_id?: string;
      media_id?: string;
      dry_run?: string;
    };
    const filterActorId = query.actor_id;
    const filterBinId = query.bin_id;
    const filterMediaId = query.media_id;
    const dryRun = query.dry_run === 'true';

    const { job } = await runBatchGeneration(ctx.projectRoot, {
      actorId: filterActorId,
      binId: filterBinId,
      mediaId: filterMediaId,
      dryRun,
    });
    const jobErrors = job.items.filter((item) => item.error).map((item) => `${item.media_id}: ${item.error}`);
    return {
      success: jobErrors.length === 0,
      total_generated: job.total_takes_created,
      items: job.items.map((item) => ({ media_id: item.media_id, generated: item.generated_takes, error: item.error })),
      errors: jobErrors,
      job,
    };
  });

  fastify.get('/api/batch/backfill-takes/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }

    const query = request.query as {
      actor_id?: string;
      bin_id?: string;
      media_id?: string;
    };

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/batch/backfill-takes',
      query: { ...query, dry_run: 'true' },
    });

    reply.code(response.statusCode);
    return JSON.parse(response.body);
  });
}
