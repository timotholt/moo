import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join } from 'path';
import fs from 'fs';
import { getProjectPaths } from './utils/paths.js';
import { registerActorRoutes } from './server/routes/actors.js';
import { registerContentRoutes } from './server/routes/content.js';
import { registerTakeRoutes } from './server/routes/takes.js';
import { registerSectionRoutes } from './server/routes/sections.js';
import { registerDefaultsRoutes } from './server/routes/defaults.js';
import { registerProviderRoutes } from './server/routes/provider.js';
import { registerGenerationRoutes } from './server/routes/generation.js';
import { registerHistoryRoutes } from './server/routes/history.js';
import { registerSnapshotRoutes } from './server/routes/snapshots.js';
import { registerBatchRoutes } from './server/routes/batch.js';
import llmRoutes from './server/routes/llm.js';
import projectRoutes, { setCurrentProject, getCurrentProjectPath } from './server/routes/projects.js';

const fastify = Fastify({
  logger: false,
});

// Projects directory
const PROJECTS_DIR = join(process.cwd(), 'projects');

// Dynamic project context - uses the switchable project path. Returns null when no project selected.
function getProjectContextNullable() {
  const projectRoot = getCurrentProjectPath();
  if (!projectRoot) return null;
  const paths = getProjectPaths(projectRoot);
  return { projectRoot, paths };
}

// Export for use by route modules that need access to the current project
export { getProjectContextNullable as getProjectContext, PROJECTS_DIR };

fastify.get('/api/health', async () => {
  return { status: 'ok' };
});

// Serve media files for the currently selected project
fastify.get('/media/*', async (request, reply) => {
  const ctx = getProjectContextNullable();
  if (!ctx) {
    reply.code(404);
    return 'No project selected';
  }

  const relPath = (request.params as { '*': string })['*'];
  const filePath = join(ctx.paths.media, relPath);

  if (!fs.existsSync(filePath)) {
    reply.code(404);
    return 'Not found';
  }

  // Basic content type handling based on extension
  if (filePath.endsWith('.wav')) {
    reply.type('audio/wav');
  } else if (filePath.endsWith('.mp3')) {
    reply.type('audio/mpeg');
  }

  const stream = fs.createReadStream(filePath);
  return reply.send(stream);
});

// Register all route modules
registerActorRoutes(fastify, getProjectContextNullable);
registerContentRoutes(fastify, getProjectContextNullable);
registerTakeRoutes(fastify, getProjectContextNullable);
registerSectionRoutes(fastify, getProjectContextNullable);
registerDefaultsRoutes(fastify, getProjectContextNullable);
registerProviderRoutes(fastify, getProjectContextNullable);
registerGenerationRoutes(fastify, getProjectContextNullable);
registerHistoryRoutes(fastify, getProjectContextNullable);
registerSnapshotRoutes(fastify, getProjectContextNullable);
registerBatchRoutes(fastify, getProjectContextNullable);
fastify.register(llmRoutes);
fastify.register(projectRoutes);

async function start() {
  try {
    const port = 3000;
    const host = '127.0.0.1';
    await fastify.listen({ port, host });
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
