import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Take, Section, Content, Defaults } from '../../types/index.js';
import { ActorSchema, SceneSchema } from '../../shared/schemas/index.js';
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
    // Use schema validation on read
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

    // Get actor name(s) for snapshot message
    const displayNameInput = body?.display_name ?? 'New Actor';
    const allNames = displayNameInput.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);
    const snapshotMessage = allNames.length === 1
      ? snapshotMessageForActor('create', allNames[0])
      : `Create actors: ${allNames.join(', ')}`;

    // Read catalog once and save snapshot
    const catalog = await readCatalog(paths);

    // Validate Referential Integrity (RI)
    const ri = validateReferences(body, catalog);
    if (!ri.valid) {
      reply.code(400);
      return { error: 'Referential integrity failure', details: ri.errors };
    }

    await saveSnapshot(paths, snapshotMessage, catalog);

    // Load global defaults to initialize actor blocks
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

    // Check for existing actors and filter out duplicates
    const existingActors = await readJsonl<Actor>(paths.catalog.actors, ActorSchema);
    const existingNames = new Set(existingActors.map(a => a.display_name.toLowerCase()));

    const names = allNames.filter((n: string) => !existingNames.has(n.toLowerCase()));
    const duplicateNames = allNames.filter((n: string) => existingNames.has(n.toLowerCase()));

    if (names.length === 0) {
      reply.code(400);
      return { error: 'All provided actor names already exist', duplicates: duplicateNames };
    }

    const createdActors: Actor[] = [];

    for (const name of names) {
      // Determine auto-added blocks from template
      const autoAddBlocks = defaults?.templates?.actor?.auto_add_blocks || ['dialogue'];
      const defaultBlocks: any = {};

      for (const type of autoAddBlocks) {
        defaultBlocks[type] = { provider: 'inherit' };
      }

      const actor: Actor = {
        id: generateId(),
        display_name: name,
        base_filename:
          body?.base_filename ??
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, ''),
        default_blocks:
          (body?.default_blocks as Actor['default_blocks']) ?? (defaultBlocks as Actor['default_blocks']),
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
      createdActors.push(actor);
    }

    const result: { actor?: Actor; actors?: Actor[]; duplicates_skipped?: string[]; message?: string } =
      names.length === 1 ? { actor: createdActors[0] } : { actors: createdActors };

    if (duplicateNames.length > 0) {
      result.duplicates_skipped = duplicateNames;
      result.message = `Created ${names.length} actors. Skipped ${duplicateNames.length} duplicates: ${duplicateNames.join(', ')}`;
    }

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
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    // Save snapshot
    const snapshotMessage = snapshotMessageForActorUpdate(
      currentActor.display_name,
      currentActor as unknown as Record<string, unknown>,
      updatedActor as unknown as Record<string, unknown>
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    // Validate
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

    // Updated Cascade Delete Logic: 
    // Delete all sections where owner_id is this actor and owner_type is 'actor'
    const remainingSections = catalog.sections.filter((s) => !(s.owner_id === id && s.owner_type === 'actor'));

    const removedSectionIds = new Set(catalog.sections
      .filter((s) => s.owner_id === id && s.owner_type === 'actor')
      .map(s => s.id));

    // Delete content belonging to those sections (or directly owned by actor)
    const remainingContent = catalog.content.filter((c) =>
      !(c.owner_id === id && c.owner_type === 'actor') && !removedSectionIds.has(c.section_id)
    );

    const removedContentIds = new Set(catalog.content
      .filter((c) => (c.owner_id === id && c.owner_type === 'actor') || removedSectionIds.has(c.section_id))
      .map(c => c.id));

    // Delete takes for removed content
    const takes = await readJsonl<Take>(paths.catalog.takes);
    const remainingTakes = takes.filter((t) => !removedContentIds.has(t.content_id));

    // Update all scenes to remove this actor from their actor_ids list
    const updatedScenes = catalog.scenes.map(s => ({
      ...s,
      actor_ids: s.actor_ids ? s.actor_ids.filter((aid: string) => aid !== id) : []
    }));

    await writeJsonlAll(paths.catalog.actors, remainingActors, ActorSchema);
    await writeJsonlAll(paths.catalog.scenes, updatedScenes, SceneSchema);
    await writeJsonlAll(paths.catalog.sections, remainingSections);
    await writeJsonlAll(paths.catalog.content, remainingContent);
    await writeJsonlAll(paths.catalog.takes, remainingTakes);

    reply.code(204);
    return null;
  });

  // Restore actor for undo
  fastify.post('/api/actors/restore', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const body = request.body as {
      actor: Actor;
      sections: Section[];
      content: Content[];
    };

    if (!body.actor) {
      reply.code(400);
      return { error: 'Actor data is required' };
    }

    await appendJsonl(paths.catalog.actors, body.actor, ActorSchema);

    if (body.sections) {
      for (const section of body.sections) {
        await appendJsonl(paths.catalog.sections, section);
      }
    }

    if (body.content) {
      for (const item of body.content) {
        await appendJsonl(paths.catalog.content, item);
      }
    }

    return {
      actor: body.actor,
      sections: body.sections || [],
      content: body.content || [],
    };
  });
}
