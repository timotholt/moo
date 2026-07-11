import fs from 'fs-extra';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Take } from '../../types/index.js';
import { TakeSchema } from '../../shared/schemas/index.js';
import { readJsonl } from '../../utils/jsonl.js';
import { buildReviewQueue } from '../../services/review-queue.js';
import { readCatalog } from './snapshots.js';

type ProjectContext = { paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerReviewRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/review-queue', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }

    const [catalog, takes, defaults] = await Promise.all([
      readCatalog(ctx.paths),
      readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema),
      fs.pathExists(ctx.paths.moo.defaults)
        .then((exists) => exists ? fs.readJson(ctx.paths.moo.defaults) : null),
    ]);
    return { items: buildReviewQueue(catalog, takes, defaults) };
  });
}
