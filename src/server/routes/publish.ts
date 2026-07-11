import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { publishSelectedTakes } from '../../services/publishing.js';

type ProjectContext = { projectRoot: string };

export function registerPublishRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
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
