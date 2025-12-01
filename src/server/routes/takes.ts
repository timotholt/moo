import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Take, Content } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';
import { readCatalog, saveSnapshot } from './snapshots.js';
import { describeChanges } from '../../utils/diffDescriber.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerTakeRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/takes', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const takes = await readJsonl<Take>(paths.catalog.takes);

    const query = request.query as { contentId?: string };
    const contentId = query.contentId;

    const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

    return { takes: filtered };
  });

  fastify.put('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const { id } = request.params as { id: string };
    const body = request.body as Partial<Take>;
    
    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    // Read catalog for snapshot
    const catalog = await readCatalog(paths);
    const takes = await readJsonl<Take>(paths.catalog.takes);
    const takeIndex = takes.findIndex(t => t.id === id);
    
    if (takeIndex === -1) {
      reply.code(404);
      return { error: 'Take not found' };
    }

    const currentTake = takes[takeIndex];
    const updatedTake: Take = {
      ...currentTake,
      ...body,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    // Find the content and actor for this take to build descriptive message
    const content = catalog.content.find(c => c.id === currentTake.content_id);
    const actor = content ? catalog.actors.find(a => a.id === content.actor_id) : null;
    const section = content ? catalog.sections.find(s => s.id === content.section_id) : null;
    
    // Build descriptive message with diff
    const diff = describeChanges(
      currentTake as unknown as Record<string, unknown>,
      updatedTake as unknown as Record<string, unknown>
    );
    
    // Format the change description
    let changeDesc = diff.changes.length > 0 ? diff.changes[0] : 'updated';
    
    let snapshotMessage = '';
    if (actor && content) {
      const sectionName = section?.name || content.content_type;
      snapshotMessage = `${actor.display_name} → ${sectionName} → ${content.cue_id} → ${currentTake.filename}: ${changeDesc}`;
    } else {
      snapshotMessage = `Take ${currentTake.filename || id}: ${changeDesc}`;
    }
    
    await saveSnapshot(paths, snapshotMessage, catalog);

    const validation = validate('take', updatedTake);
    if (!validation.valid) {
      reply.code(400);
      return { error: 'Invalid take data', details: validation.errors };
    }

    takes[takeIndex] = updatedTake;
    await ensureJsonlFile(paths.catalog.takes);
    await writeJsonlAll(paths.catalog.takes, takes);

    return { take: updatedTake };
  });

  // Delete a take
  fastify.delete('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
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
