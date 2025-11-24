import Fastify from 'fastify';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProjectPaths } from './utils/paths.js';
import { readJsonl } from './utils/jsonl.js';
import type { Actor, Content, Take, GenerationJob } from './types/index.js';
import { runBatchGeneration } from './services/generation.js';

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

fastify.get('/api/takes', async (request) => {
  const projectRoot = getProjectRoot();
  const paths = getProjectPaths(projectRoot);
  const takes = await readJsonl<Take>(paths.catalog.takes);

  const query = request.query as { contentId?: string };
  const contentId = query.contentId;

  const filtered = contentId ? takes.filter((t) => t.content_id === contentId) : takes;

  return { takes: filtered };
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
