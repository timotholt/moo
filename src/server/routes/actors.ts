import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Take, Bin, Media, Defaults } from '../../types/index.js';
import { ActorSchema, SceneSchema, BinSchema, MediaSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate, validateReferences } from '../../utils/validation.js';
import {
  readCatalog,
  saveSnapshot,
  snapshotMessageForActor,
  snapshotMessageForActorUpdate
} from './snapshots.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerActorRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/actors', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const actors = await readJsonl<Actor>(paths.catalog.actors, ActorSchema);
    return { actors };
  });

  fastify.post('/api/actors', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    await ensureJsonlFile(paths.catalog.actors);

    const body = request.body as Partial<Actor> | undefined;
    const now = new Date().toISOString();

    const displayNameInput = body?.display_name ?? 'New Actor';
    const allNames = displayNameInput.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);
    const snapshotMessage = allNames.length === 1
      ? snapshotMessageForActor('create', allNames[0])
      : `Create actors: ${allNames.join(', ')}`;

    const catalog = await readCatalog(paths);
    const ri = validateReferences(body, catalog);
    if (!ri.valid) {
      reply.code(400);
      return { error: 'Referential integrity failure', details: ri.errors };
    }

    await saveSnapshot(paths, snapshotMessage, catalog);

    const defaultsPath = join(paths.root, 'defaults.json');
    let defaults: Defaults | null = null;
    try {
      if (await fs.pathExists(defaultsPath)) {
        defaults = await fs.readJson(defaultsPath);
      }
    } catch (err) {
      fastify.log.warn(err, 'Failed to load defaults.json');
    }

    if (allNames.length === 0) {
      reply.code(400);
      return { error: 'At least one valid actor name is required' };
    }

    const existingActors = await readJsonl<Actor>(paths.catalog.actors, ActorSchema);
    const finalActors: Actor[] = [];
    const existingActorsByName = new Map<string, Actor>(existingActors.map(a => [a.display_name.toLowerCase(), a]));

    for (const name of allNames) {
      const existing = existingActorsByName.get(name.toLowerCase());
      if (existing) {
        finalActors.push(existing);
      } else {
        const autoAddBlocks = defaults?.templates?.actor?.auto_add_blocks || ['dialogue'];
        const defaultBlocks: Record<string, { provider: 'inherit' }> = {};
        for (const type of autoAddBlocks) {
          defaultBlocks[type] = { provider: 'inherit' };
        }

        const actor: Actor = {
          id: generateId(),
          display_name: name,
          base_filename: name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
          default_blocks: (body?.default_blocks as Actor['default_blocks']) ?? defaultBlocks as Actor['default_blocks'],
          actor_complete: false,
          created_at: now,
          updated_at: now,
        };

        const validation = validate('actor', actor);
        if (!validation.valid) {
          reply.code(400);
          return { error: `Invalid actor "${name}"`, details: validation.errors };
        }

        await appendJsonl(paths.catalog.actors, actor, ActorSchema);
        finalActors.push(actor);
      }
    }

    const result: { actor?: Actor; actors?: Actor[]; message?: string } =
      finalActors.length === 1 ? { actor: finalActors[0] } : { actors: finalActors };

    return result;
  });

  fastify.put('/api/actors/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const { id } = request.params as { id: string };
    const body = request.body as Partial<Actor>;

    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const catalog = await readCatalog(paths);
    const actorIndex = catalog.actors.findIndex(a => a.id === id);

    if (actorIndex === -1) {
      reply.code(404);
      return { error: 'Actor not found' };
    }

    const currentActor = catalog.actors[actorIndex];

    const updatedActor: Actor = {
      ...currentActor,
      ...body,
      id,
      updated_at: new Date().toISOString(),
    };

    const snapshotMessage = snapshotMessageForActorUpdate(
      currentActor.display_name,
      currentActor as unknown as Record<string, unknown>,
      updatedActor as unknown as Record<string, unknown>
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    const validation = validate('actor', updatedActor);
    if (!validation.valid) {
      reply.code(400);
      return { error: 'Invalid actor data', details: validation.errors };
    }

    catalog.actors[actorIndex] = updatedActor;
    await writeJsonlAll(paths.catalog.actors, catalog.actors, ActorSchema);

    return { actor: updatedActor };
  });

  fastify.delete('/api/actors/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const { id } = request.params as { id: string };

    const catalog = await readCatalog(paths);
    const actorToDelete = catalog.actors.find(a => a.id === id);
    if (!actorToDelete) {
      reply.code(404);
      return { error: 'Actor not found' };
    }
    const actorName = actorToDelete.display_name;

    await saveSnapshot(paths, snapshotMessageForActor('delete', actorName), catalog);

    const remainingActors = catalog.actors.filter((a) => a.id !== id);

    // Cascade Delete Logic (Bins, Media, Takes)
    const remainingBins = catalog.bins.filter((b) => !(b.owner_id === id && b.owner_type === 'actor'));
    const removedBinIds = new Set(catalog.bins
      .filter((b) => b.owner_id === id && b.owner_type === 'actor')
      .map(b => b.id));

    const remainingMedia = catalog.media.filter((m) =>
      !(m.owner_id === id && m.owner_type === 'actor') && !removedBinIds.has(m.bin_id)
    );
    const removedMediaIds = new Set(catalog.media
      .filter((m) => (m.owner_id === id && m.owner_type === 'actor') || removedBinIds.has(m.bin_id))
      .map(m => m.id));

    const takes = await readJsonl<Take>(paths.catalog.takes);
    const remainingTakes = takes.filter((t) => !removedMediaIds.has(t.media_id));

    const updatedScenes = catalog.scenes.map(s => ({
      ...s,
      actor_ids: s.actor_ids ? s.actor_ids.filter((aid: string) => aid !== id) : []
    }));

    await writeJsonlAll(paths.catalog.actors, remainingActors, ActorSchema);
    await writeJsonlAll(paths.catalog.scenes, updatedScenes, SceneSchema);
    await writeJsonlAll(paths.catalog.bins, remainingBins, BinSchema);
    await writeJsonlAll(paths.catalog.media, remainingMedia, MediaSchema);
    await writeJsonlAll(paths.catalog.takes, remainingTakes);

    reply.code(204);
    return null;
  });

  fastify.post('/api/actors/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const body = request.body as {
      actor: Actor;
      bins: Bin[];
      media: Media[];
    };

    if (!body.actor) {
      reply.code(400);
      return { error: 'Actor data is required' };
    }

    await appendJsonl(paths.catalog.actors, body.actor, ActorSchema);

    if (body.bins) {
      for (const bin of body.bins) {
        await appendJsonl(paths.catalog.bins, bin, BinSchema);
      }
    }

    if (body.media) {
      for (const item of body.media) {
        await appendJsonl(paths.catalog.media, item, MediaSchema);
      }
    }

    return {
      actor: body.actor,
      bins: body.bins || [],
      media: body.media || [],
    };
  });
}
