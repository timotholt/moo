import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProjectPaths } from './utils/paths.js';
import { appendJsonl, ensureJsonlFile, readJsonl } from './utils/jsonl.js';
import type { Actor, Content, Take, GenerationJob, Section } from './types/index.js';
import { runBatchGeneration } from './services/generation.js';
import { generateId } from './utils/ids.js';
import { validate } from './utils/validation.js';
import { getAudioProvider } from './services/provider-factory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({
  logger: false,
});

function getProjectRoot(): string {
  return process.cwd();
}

fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

fastify.get('/api/actors', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const actors = await readJsonl<Actor>(paths.catalog.actors);
  return { actors };
});

fastify.post('/api/actors', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.actors);

  const body = request.body as Partial<Actor> | undefined;
  const now = new Date().toISOString();

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
      (body?.provider_settings as Actor['provider_settings']) ?? {
        dialogue: { provider: 'manual' },
        music: { provider: 'manual' },
        sfx: { provider: 'manual' },
      },
    aliases: body?.aliases ?? [],
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

fastify.delete('/api/actors/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);

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

  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.actors,
      remainingActors.map((a) => JSON.stringify(a)).join('\n') + (remainingActors.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.content,
      remainingContent.map((c) => JSON.stringify(c)).join('\n') + (remainingContent.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.takes,
      remainingTakes.map((t) => JSON.stringify(t)).join('\n') + (remainingTakes.length ? '\n' : ''),
      'utf8',
    );
  });

  reply.code(204);
  return null;
});

fastify.get('/api/content', async (request) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const contentItems = await readJsonl<Content>(paths.catalog.content);

  const query = request.query as { actorId?: string; type?: string };
  const actorId = query.actorId;
  const type = query.type as Content['content_type'] | undefined;

  const filtered = contentItems.filter((c) => {
    if (actorId && c.actor_id !== actorId) return false;
    if (type && c.content_type !== type) return false;
    return true;
  });

  return { content: filtered };
});

fastify.post('/api/content', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.content);

  const body = request.body as {
    actor_id: string;
    content_type: Content['content_type'];
    item_id?: string;
    prompt: string;
    tags?: string[];
  } | null;

  if (!body || !body.actor_id || !body.content_type || !body.prompt) {
    reply.code(400);
    return { error: 'actor_id, content_type, and prompt are required' };
  }

  const now = new Date().toISOString();

  const content: Content = {
    id: generateId(),
    actor_id: body.actor_id,
    content_type: body.content_type,
    item_id: body.item_id ?? '',
    prompt: body.prompt,
    complete: false,
    all_approved: false,
    tags: body.tags ?? [],
    created_at: now,
    updated_at: now,
  };

  const validation = validate('content', content);
  if (!validation.valid) {
    reply.code(400);
    return { error: 'Invalid content', details: validation.errors };
  }

  await appendJsonl(paths.catalog.content, content);
  return { content };
});

fastify.delete('/api/content/:id', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);

  const { id } = request.params as { id: string };

  const contentItems = await readJsonl<Content>(paths.catalog.content);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const remainingContent = contentItems.filter((c) => c.id !== id);
  const remainingTakes = takes.filter((t) => t.content_id !== id);

  await ensureJsonlFile(paths.catalog.content);
  await ensureJsonlFile(paths.catalog.takes);

  await import('fs-extra').then(async (fsMod) => {
    const fs = fsMod.default;
    await fs.writeFile(
      paths.catalog.content,
      remainingContent.map((c) => JSON.stringify(c)).join('\n') + (remainingContent.length ? '\n' : ''),
      'utf8',
    );
    await fs.writeFile(
      paths.catalog.takes,
      remainingTakes.map((t) => JSON.stringify(t)).join('\n') + (remainingTakes.length ? '\n' : ''),
      'utf8',
    );
  });

  reply.code(204);
  return null;
});

fastify.get('/api/takes', async (request) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const query = request.query as { contentId?: string };
  const contentId = query.contentId;

  const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

  return { takes: filtered };
});

fastify.get('/api/voices', async (request, reply) => {
  try {
    const projectRoot = getProjectRoot();
    const provider = await getAudioProvider(projectRoot);
    const voices = await provider.getVoices();
    return { voices };
  } catch (error) {
    fastify.log.error(error);
    reply.code(500);
    
    // Pass through specific error details for better client-side handling
    let errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('missing_permissions') || errorMessage.includes('voices_read')) {
      errorMessage = 'ElevenLabs API key is missing voices_read permission';
    }
    
    return { error: 'Failed to fetch voices', details: errorMessage };
  }
});

fastify.get('/api/sections', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const sections = await readJsonl<Section>(paths.catalog.sections);
  return { sections };
});

fastify.post('/api/sections', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  await ensureJsonlFile(paths.catalog.sections);

  const body = request.body as {
    actor_id: string;
    content_type: 'dialogue' | 'music' | 'sfx';
  };
  
  if (!body || !body.actor_id || !body.content_type) {
    reply.code(400);
    return { error: 'actor_id and content_type are required' };
  }

  const now = new Date().toISOString();
  const section: Section = {
    id: `${body.actor_id}-${body.content_type}`,
    actor_id: body.actor_id,
    content_type: body.content_type,
    created_at: now,
    updated_at: now,
  };

  await appendJsonl(paths.catalog.sections, section);
  return { section };
});

fastify.get('/api/jobs', async () => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const jobs = await readJsonl<GenerationJob>(paths.catalog.generationJobs);
  return { jobs };
});

fastify.post('/api/generation/batch', async (request, reply) => {
  const projectRoot = getProjectRoot();
  const body = request.body as {
    actorId?: string;
    contentType?: 'dialogue' | 'music' | 'sfx';
    dryRun?: boolean;
  } | undefined;

  try {
    const { job } = await runBatchGeneration(projectRoot, {
      actorId: body?.actorId,
      contentType: body?.contentType,
      dryRun: !!body?.dryRun,
    });

    return { job };
  } catch (err) {
    request.log.error(err);
    reply.code(500);
    return { error: (err as Error).message };
  }
});

async function start() {
  try {
    const port = 3000;
    const host = '127.0.0.1';
    await fastify.listen({ port, host });
    // eslint-disable-next-line no-console
    console.log(`VOF API server listening on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// When this module is executed directly (e.g. via `tsx src/server.ts` or `pnpm dev`),
// start the Fastify server immediately.
void start();

export { fastify, start };
