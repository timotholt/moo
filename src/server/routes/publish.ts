import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { publishSelectedTakes } from '../../services/publishing.js';
import type { ReleaseRecord } from '../../types/index.js';
import { readJsonl } from '../../utils/jsonl.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerPublishRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/releases', async (_request: FastifyRequest, reply: FastifyReply) => {
    const context = getProjectContext();
    if (!context) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const releases = await readJsonl<ReleaseRecord>(context.paths.catalog.releases);
    return { releases: releases.sort((a, b) => b.created_at.localeCompare(a.created_at)) };
  });

  fastify.post('/api/publish', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getProjectContext();
    if (!context) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    try {
      const body = request.body as { release_id?: string } | null;
      return await publishSelectedTakes(context.projectRoot, body?.release_id);
    } catch (error) {
      reply.code(400);
      return { error: (error as Error).message };
    }
  });
}
