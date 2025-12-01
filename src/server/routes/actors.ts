import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Content, Take, Section } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';
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
    const actors = await readJsonl<Actor>(paths.catalog.actors);
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
    await saveSnapshot(paths, snapshotMessage, catalog);

    // Load global defaults
    const defaultsPath = join(paths.root, 'defaults.json');
    let globalDefaults: Record<string, Record<string, unknown>> = {
      dialogue: { provider: 'elevenlabs', min_candidates: 1, approval_count_default: 1, stability: 0.5, similarity_boost: 0.75 },
      music: { provider: 'elevenlabs', min_candidates: 1, approval_count_default: 1 },
      sfx: { provider: 'elevenlabs', min_candidates: 1, approval_count_default: 1 },
    };

    try {
      const fs = await import('fs-extra').then(m => m.default);
      if (await fs.pathExists(defaultsPath)) {
        globalDefaults = await fs.readJson(defaultsPath);
      }
    } catch (err) {
      fastify.log.warn(err, 'Failed to load global defaults, using hardcoded values');
    }

    if (allNames.length === 0) {
      reply.code(400);
      return { error: 'At least one valid actor name is required' };
    }

    // Check for existing actors and filter out duplicates
    const existingActors = await readJsonl<Actor>(paths.catalog.actors);
    const existingNames = new Set(existingActors.map(a => a.display_name.toLowerCase()));

    const names = allNames.filter((n: string) => !existingNames.has(n.toLowerCase()));
    const duplicateNames = allNames.filter((n: string) => existingNames.has(n.toLowerCase()));

    if (names.length === 0) {
      reply.code(400);
      return { error: 'All provided actor names already exist', duplicates: duplicateNames };
    }

    const createdActors: Actor[] = [];

    for (const name of names) {
      const actor: Actor = {
        id: generateId(),
        display_name: name,
        base_filename:
          body?.base_filename ??
          name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, ''),
        all_approved: false,
        provider_settings:
          (body?.provider_settings as Actor['provider_settings']) ?? globalDefaults,
        notes: body?.notes ?? '',
        created_at: now,
        updated_at: now,
      };

      const validation = validate('actor', actor);
      if (!validation.valid) {
        reply.code(400);
        return { error: `Invalid actor "${name}"`, details: validation.errors };
      }

      await appendJsonl(paths.catalog.actors, actor);
      createdActors.push(actor);
    }

    // Return the first item for single creation, or array for batch
    const result: { actor?: Actor; actors?: Actor[]; duplicates_skipped?: string[]; message?: string } = 
      names.length === 1 ? { actor: createdActors[0] } : { actors: createdActors };

    // Include information about duplicates if any were skipped
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

    // Read catalog once for snapshot and logic
    const catalog = await readCatalog(paths);
    const actorIndex = catalog.actors.findIndex(a => a.id === id);
    
    if (actorIndex === -1) {
      reply.code(404);
      return { error: 'Actor not found' };
    }
    
    const currentActor = catalog.actors[actorIndex];

    // Build the updated actor first so we can diff
    const updatedActor: Actor = {
      ...catalog.actors[actorIndex],
      ...body,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    // Build descriptive message with diff and save snapshot
    const snapshotMessage = snapshotMessageForActorUpdate(
      currentActor.display_name,
      currentActor as unknown as Record<string, unknown>,
      updatedActor as unknown as Record<string, unknown>
    );
    await saveSnapshot(paths, snapshotMessage, catalog);

    // Validate the updated actor
    const validation = validate('actor', updatedActor);
    if (!validation.valid) {
      reply.code(400);
      return { error: 'Invalid actor data', details: validation.errors };
    }

    // Replace the actor in the array and write back
    catalog.actors[actorIndex] = updatedActor;
    await writeJsonlAll(paths.catalog.actors, catalog.actors);

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

    // Read catalog once for snapshot and logic
    const catalog = await readCatalog(paths);
    const actorToDelete = catalog.actors.find(a => a.id === id);
    const actorName = actorToDelete?.display_name || id;

    // Save snapshot before mutation
    await saveSnapshot(paths, snapshotMessageForActor('delete', actorName), catalog);
    
    // Read takes separately (not in catalog)
    const takes = await readJsonl<Take>(paths.catalog.takes);

    const remainingActors = catalog.actors.filter((a) => a.id !== id);
    const remainingSections = catalog.sections.filter((s) => s.actor_id !== id);
    const removedContent = catalog.content.filter((c) => c.actor_id === id);
    const removedContentIds = new Set(removedContent.map((c) => c.id));
    const remainingContent = catalog.content.filter((c) => c.actor_id !== id);
    const remainingTakes = takes.filter((t) => !removedContentIds.has(t.content_id));

    await ensureJsonlFile(paths.catalog.actors);
    await ensureJsonlFile(paths.catalog.sections);
    await ensureJsonlFile(paths.catalog.content);
    await ensureJsonlFile(paths.catalog.takes);

    await fastify.log.debug?.({ id }, 'Deleting actor and related sections/content/takes');

    await fastify.log.debug?.({ remainingActors: remainingActors.length }, 'Actors after delete');

    await writeJsonlAll(paths.catalog.actors, remainingActors);
    await writeJsonlAll(paths.catalog.sections, remainingSections);
    await writeJsonlAll(paths.catalog.content, remainingContent);
    await writeJsonlAll(paths.catalog.takes, remainingTakes);

    reply.code(204);
    return null;
  });

  // Restore an actor with all related data (for undo)
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

    await ensureJsonlFile(paths.catalog.actors);
    await ensureJsonlFile(paths.catalog.sections);
    await ensureJsonlFile(paths.catalog.content);

    // Append actor
    await appendJsonl(paths.catalog.actors, body.actor);

    // Append sections
    if (body.sections && body.sections.length > 0) {
      for (const section of body.sections) {
        await appendJsonl(paths.catalog.sections, section);
      }
    }

    // Append content
    if (body.content && body.content.length > 0) {
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
