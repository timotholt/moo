import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Take } from '../../types/index.js';
import { readJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerTakeRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext) {
  fastify.get('/api/takes', async (request: FastifyRequest) => {
    const { paths } = getProjectContext();
    const takes = await readJsonl<Take>(paths.catalog.takes);

    const query = request.query as { contentId?: string };
    const contentId = query.contentId;

    const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

    return { takes: filtered };
  });

  fastify.put('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { paths } = getProjectContext();
    
    const { id } = request.params as { id: string };
    const body = request.body as Partial<Take>;
    
    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const takes = await readJsonl<Take>(paths.catalog.takes);
    const takeIndex = takes.findIndex(t => t.id === id);
    
    if (takeIndex === -1) {
      reply.code(404);
      return { error: 'Take not found' };
    }

    // Update the take with new data
    const now = new Date().toISOString();
    const updatedTake: Take = {
      ...takes[takeIndex],
      ...body,
      id, // Ensure ID doesn't change
      // Track when status changed
      status_changed_at: body.status && body.status !== takes[takeIndex].status ? now : takes[takeIndex].status_changed_at,
      updated_at: now,
    };

    // Replace the take in the array
    takes[takeIndex] = updatedTake;

    // Write back to file
    await writeJsonlAll(paths.catalog.takes, takes);

    return { take: updatedTake };
  });

  // Delete a take
  fastify.delete('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { paths } = getProjectContext();
    
    const { id } = request.params as { id: string };

    const takes = await readJsonl<Take>(paths.catalog.takes);
    const takeIndex = takes.findIndex(t => t.id === id);
    
    if (takeIndex === -1) {
      reply.code(404);
      return { error: 'Take not found' };
    }

    const deletedTake = takes[takeIndex];
    
    // Remove the take from the array
    takes.splice(takeIndex, 1);

    // Write back to file
    await ensureJsonlFile(paths.catalog.takes);
    await writeJsonlAll(paths.catalog.takes, takes);

    const fsMod = await import('fs-extra');
    const fs = fsMod.default;

    // Optionally delete the audio file
    try {
      const filePath = join(paths.media, deletedTake.path);
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (err) {
      // Log but don't fail if file deletion fails
      console.error('Failed to delete audio file:', err);
    }

    reply.code(204);
    return;
  });
}
