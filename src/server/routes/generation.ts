import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { GenerationJob } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';
import { runBatchGeneration } from '../../services/generation.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerGenerationRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext) {
  fastify.get('/api/jobs', async () => {
    const { paths } = getProjectContext();
    const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
    return { jobs };
  });

  fastify.post('/api/generation/batch', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectRoot } = getProjectContext();
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
}
