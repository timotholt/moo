import { join } from 'path';
import type { Actor, Content, Take } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate } from '../../utils/validation.js';

export function registerActorRoutes(fastify: any, getProjectContext: any) {
  fastify.get('/api/actors', async () => {
    const { paths } = getProjectContext();
    const actors = await readJsonl<Actor>(paths.catalog.actors);
    return { actors };
  });

  fastify.post('/api/actors', async (request: any, reply: any) => {
    const { projectRoot, paths } = getProjectContext();
    await ensureJsonlFile(paths.catalog.actors);

    const body = request.body as Partial<Actor> | undefined;
    const now = new Date().toISOString();

    // Load global defaults
    const defaultsPath = join(paths.root, 'defaults.json');
    let globalDefaults: Record<string, Record<string, unknown>> = {
      dialogue: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1, stability: 0.5, similarity_boost: 0.75 },
      music: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
      sfx: { provider: 'elevenlabs', batch_generate: 1, approval_count_default: 1 },
    };

    try {
      const fs = await import('fs-extra').then(m => m.default);
      if (await fs.pathExists(defaultsPath)) {
        globalDefaults = await fs.readJson(defaultsPath);
      }
    } catch (err) {
      fastify.log.warn(err, 'Failed to load global defaults, using hardcoded values');
    }

    const actor: Actor = {
      id: generateId(),
      display_name: body?.display_name ?? 'New Actor',
      base_filename:
        body?.base_filename ??
        `${(body?.display_name ?? 'actor')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')}_`,
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
      return { error: 'Invalid actor', details: validation.errors };
    }

    await appendJsonl(paths.catalog.actors, actor);
    return { actor };
  });

  fastify.put('/api/actors/:id', async (request: any, reply: any) => {
    const { paths } = getProjectContext();
    
    const { id } = request.params as { id: string };
    const body = request.body as Partial<Actor>;
    
    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const actorIndex = actors.findIndex(a => a.id === id);
    
    if (actorIndex === -1) {
      reply.code(404);
      return { error: 'Actor not found' };
    }

    // Update the actor with new data
    const updatedActor: Actor = {
      ...actors[actorIndex],
      ...body,
      id, // Ensure ID doesn't change
      updated_at: new Date().toISOString(),
    };

    // Validate the updated actor
    const validation = validate('actor', updatedActor);
    if (!validation.valid) {
      reply.code(400);
      return { error: 'Invalid actor data', details: validation.errors };
    }

    // Replace the actor in the array
    actors[actorIndex] = updatedActor;

    // Write back to file
    await writeJsonlAll(paths.catalog.actors, actors);

    return { actor: updatedActor };
  });

  fastify.delete('/api/actors/:id', async (request: any, reply: any) => {
    const { paths } = getProjectContext();

    const { id } = request.params as { id: string };

    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const contentItems = await readJsonl<Content>(paths.catalog.content);
    const takes = await readJsonl<Take>(paths.catalog.takes);

    const remainingActors = actors.filter((a) => a.id !== id);
    const removedContent = contentItems.filter((c) => c.actor_id === id);
    const removedContentIds = new Set(removedContent.map((c) => c.id));
    const remainingContent = contentItems.filter((c) => c.actor_id !== id);
    const remainingTakes = takes.filter((t) => !removedContentIds.has(t.content_id));

    await ensureJsonlFile(paths.catalog.actors);
    await ensureJsonlFile(paths.catalog.content);
    await ensureJsonlFile(paths.catalog.takes);

    await fastify.log.debug?.({ id }, 'Deleting actor and related content/takes');

    await fastify.log.debug?.({ remainingActors: remainingActors.length }, 'Actors after delete');

    await writeJsonlAll(paths.catalog.actors, remainingActors);
    await writeJsonlAll(paths.catalog.content, remainingContent);
    await writeJsonlAll(paths.catalog.takes, remainingTakes);

    reply.code(204);
    return null;
  });
}
