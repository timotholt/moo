import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Take, Media } from '../../types/index.js';
import { TakeSchema } from '../../shared/schemas/index.js';
import { MediaSchema } from '../../shared/schemas/index.js';
import { readJsonl, writeJsonlAll } from '../../utils/jsonl.js';
import { validateReferences } from '../../utils/validation.js';
import { readCatalog, saveSnapshot } from './snapshots.js';
import { describeChanges } from '../../utils/diffDescriber.js';
import { updateMetadata } from '../../services/audio/metadata.js';
import { buildMediaPath } from '../../utils/pathBuilder.js';
import { resolveDefaultBlock } from '../../utils/defaultBlockResolver.js';
import { calculateCueLifecycle } from '../../services/cue-lifecycle.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerTakeRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/takes', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);

    const query = request.query as { mediaId?: string };
    const mediaId = query.mediaId;

    const filtered = mediaId ? takes.filter((t) => t.media_id === mediaId) : takes;

    return { takes: filtered };
  });

  fastify.put('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const { id } = request.params;
    const body = request.body as Partial<Take>;

    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const catalog = await readCatalog(paths);

    // Validate Referential Integrity (RI)
    const ri = validateReferences(body, catalog);
    if (!ri.valid) {
      reply.code(400);
      return { error: 'Referential integrity failure', details: ri.errors };
    }

    const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);
    const takeIndex = takes.findIndex(t => t.id === id);

    if (takeIndex === -1) {
      reply.code(404);
      return { error: 'Take not found' };
    }

    const currentTake = takes[takeIndex];
    const now = new Date().toISOString();
    const statusChanged = body.status !== undefined && body.status !== currentTake.status;
    const updatedTake: Take = {
      ...currentTake,
      ...body,
      id,
      status_changed_at: statusChanged ? now : currentTake.status_changed_at,
      reviewed_at: statusChanged && body.status !== 'new' ? now : currentTake.reviewed_at,
      updated_at: now,
    };

    // Find context for snapshot message
    const mediaItem = catalog.media.find(m => m.id === currentTake.media_id);
    let snapshotMessage = '';

    if (mediaItem) {
      const displayPath = buildMediaPath(mediaItem.owner_type, mediaItem.owner_id || null, mediaItem.bin_id, mediaItem.name, catalog);
      const diff = describeChanges(currentTake as any, updatedTake as any);
      const changeDesc = diff.changes.length > 0 ? diff.changes[0] : 'updated';
      snapshotMessage = `${displayPath} → Take ${currentTake.take_number}: ${changeDesc}`;
    } else {
      snapshotMessage = `Take ${currentTake.id}: updated`;
    }

    await saveSnapshot(paths, snapshotMessage, catalog);

    // Zod validation
    const validation = TakeSchema.safeParse(updatedTake);
    if (!validation.success) {
      reply.code(400);
      return { error: 'Invalid take data', details: validation.error.format() };
    }

    takes[takeIndex] = updatedTake;
    await writeJsonlAll(paths.catalog.takes, takes, TakeSchema);

    // Keep the legacy completion flag a derived compatibility projection until
    // consumers move fully to the lifecycle read model.
    let lifecycle = null;
    if (mediaItem) {
      const bin = catalog.bins.find((item) => item.id === mediaItem.bin_id);
      const owner = mediaItem.owner_type === 'actor'
        ? catalog.actors.find((item) => item.id === mediaItem.owner_id) ?? null
        : mediaItem.owner_type === 'scene'
          ? catalog.scenes.find((item) => item.id === mediaItem.owner_id) ?? null
          : null;
      if (bin) {
        const defaults = await fs.pathExists(paths.moo.defaults) ? await fs.readJson(paths.moo.defaults) : null;
        const settings = resolveDefaultBlock(mediaItem.media_type, mediaItem, bin, owner, defaults).settings;
        lifecycle = calculateCueLifecycle(mediaItem, takes, settings.approval_count_default ?? 1);
        const mediaIndex = catalog.media.findIndex((item) => item.id === mediaItem.id);
        catalog.media[mediaIndex] = {
          ...mediaItem,
          all_approved: lifecycle.is_complete,
          updated_at: new Date().toISOString(),
        };
        await writeJsonlAll(paths.catalog.media, catalog.media, MediaSchema);
      }
    }

    // Update metadata in audio file
    try {
      const fullPath = join(ctx.projectRoot, updatedTake.path);
      if (await fs.pathExists(fullPath)) {
        await updateMetadata(fullPath, {
          status: updatedTake.status,
          updated_at: updatedTake.updated_at,
        });
      }
    } catch (metaErr) {
      request.log.warn({ err: metaErr, takeId: id }, 'Failed to update metadata in audio file');
    }

    return { take: updatedTake, lifecycle };
  });

  fastify.delete('/api/takes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const { id } = request.params;

    const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);
    const takeIndex = takes.findIndex(t => t.id === id);

    if (takeIndex === -1) {
      reply.code(404);
      return { error: 'Take not found' };
    }

    const deletedTake = takes[takeIndex];
    takes.splice(takeIndex, 1);
    await writeJsonlAll(paths.catalog.takes, takes, TakeSchema);

    // Delete physical file
    try {
      const fullPath = join(ctx.projectRoot, deletedTake.path);
      if (await fs.pathExists(fullPath)) {
        await fs.remove(fullPath);
      }
    } catch (err) {
      console.error('Failed to delete physical take file:', err);
    }

    reply.code(204);
    return;
  });
}
