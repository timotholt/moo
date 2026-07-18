import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { join, resolve } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getProjectPaths } from './utils/paths.js';
import { registerActorRoutes } from './server/routes/actors.js';
import { registerMediaRoutes } from './server/routes/media.js';
import { registerTakeRoutes } from './server/routes/takes.js';
import { registerBinRoutes } from './server/routes/bins.js';
import { registerDefaultsRoutes } from './server/routes/defaults.js';
import { registerProviderRoutes } from './server/routes/provider.js';
import { registerGenerationRoutes } from './server/routes/generation.js';
import { registerHistoryRoutes } from './server/routes/history.js';
import { registerSnapshotRoutes } from './server/routes/snapshots.js';
import { registerBatchRoutes } from './server/routes/batch.js';
import llmRoutes from './server/routes/llm.js';
import { registerSceneRoutes } from './server/routes/scenes.js';
import { registerCardRoutes } from './server/routes/cards.js';
import { registerPublishRoutes } from './server/routes/publish.js';
import { registerReviewRoutes } from './server/routes/review.js';
import { ProjectWriteLocks } from './services/project-write-lock.js';
import projectRoutes, {
  getCurrentProjectPath,
  PROJECTS_DIR,
} from './server/routes/projects.js';
import {
  registerProductionUi,
  resolveProductionUiRoot,
  shouldServeProductionUi,
  type ProductionUiStatus,
} from './server/production-host.js';

// Dynamic project context - uses the switchable project path. Returns null when no project selected.
function getProjectContextNullable() {
  const projectRoot = getCurrentProjectPath();
  if (!projectRoot) return null;
  const paths = getProjectPaths(projectRoot);
  return { projectRoot, paths };
}

// Export for use by route modules that need access to the current project
export { getProjectContextNullable as getProjectContext, PROJECTS_DIR };

export interface BuildServerOptions {
  serveUi?: boolean;
  uiRoot?: string;
  logger?: boolean;
}

export interface MooServer extends FastifyInstance {
  productionUi: ProductionUiStatus;
}

export function buildServer(options: BuildServerOptions = {}): MooServer {
  const app = Fastify({
    logger: options.logger ?? false,
  }) as unknown as MooServer;
  const projectWriteLocks = new ProjectWriteLocks();
  const requestUnlocks = new WeakMap<object, () => void>();

  // MOO is local-first and uses flat catalog files. Serialize mutations per
  // selected project so read-modify-write handlers cannot clobber each other.
  app.addHook('onRequest', async (request) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const context = getProjectContextNullable();
    if (!context) return;
    requestUnlocks.set(request, await projectWriteLocks.acquire(context.projectRoot));
  });

  const releaseRequestLock = (request: object) => {
    const unlock = requestUnlocks.get(request);
    if (!unlock) return;
    requestUnlocks.delete(request);
    unlock();
  };
  app.addHook('onResponse', async (request) => {
    releaseRequestLock(request);
  });
  app.addHook('onError', async (request) => {
    releaseRequestLock(request);
  });

  app.get('/api/health', async () => {
    return { status: 'ok' };
  });

  // Serve media files for the currently selected project
  app.get('/media/*', async (request, reply) => {
    const ctx = getProjectContextNullable();
    if (!ctx) {
      reply.code(404);
      return 'No project selected';
    }

    const relPath = (request.params as { '*': string })['*'];

    // Security: Ensure path stays within allowed subfolders at project root
    const allowedFolders = ['actors', 'cards', 'scenes', 'global', 'exports'];
    const firstPart = relPath.split(/[/\\]/)[0];

    if (!allowedFolders.includes(firstPart)) {
      reply.code(403);
      return 'Forbidden';
    }

    const filePath = join(ctx.projectRoot, relPath);

    if (!fs.existsSync(filePath)) {
      reply.code(404);
      return 'Not found';
    }

    // Basic content type handling based on extension
    if (filePath.endsWith('.wav')) {
      reply.type('audio/wav');
    } else if (filePath.endsWith('.mp3')) {
      reply.type('audio/mpeg');
    } else if (filePath.endsWith('.mp4')) {
      reply.type('video/mp4');
    } else if (filePath.endsWith('.png')) {
      reply.type('image/png');
    } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      reply.type('image/jpeg');
    }

    const stream = fs.createReadStream(filePath);
    return reply.send(stream);
  });

  // Register all API/media routes before the production static catch-all.
  registerActorRoutes(app, getProjectContextNullable);
  registerMediaRoutes(app, getProjectContextNullable);
  registerTakeRoutes(app, getProjectContextNullable);
  registerBinRoutes(app, getProjectContextNullable);
  registerSceneRoutes(app, getProjectContextNullable);
  registerCardRoutes(app, getProjectContextNullable);
  registerPublishRoutes(app, getProjectContextNullable);
  registerReviewRoutes(app, getProjectContextNullable);
  registerDefaultsRoutes(app, getProjectContextNullable);
  registerProviderRoutes(app, getProjectContextNullable);
  registerGenerationRoutes(app, getProjectContextNullable);
  registerHistoryRoutes(app, getProjectContextNullable);
  registerSnapshotRoutes(app, getProjectContextNullable);
  registerBatchRoutes(app, getProjectContextNullable);
  app.register(llmRoutes);
  app.register(projectRoutes);

  const serveUi =
    options.serveUi ??
    shouldServeProductionUi(import.meta.url, process.env, process.argv[1]);
  app.productionUi = registerProductionUi(app, {
    enabled: serveUi,
    moduleUrl: import.meta.url,
    rootOverride: options.uiRoot ?? process.env.MOO_UI_ROOT,
  });

  return app;
}

const fastify = buildServer();

async function start(app: FastifyInstance = fastify) {
  try {
    const port = 6000;
    const host = '127.0.0.1';
    await app.listen({ port, host });
    const productionUi = (app as Partial<MooServer>).productionUi;
    console.log(
      productionUi?.available
        ? `MOO server and UI listening on http://${host}:${port}`
        : `MOO API server listening on http://${host}:${port}`,
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

function isDirectExecution(moduleUrl: string): boolean {
  const entryPath = process.argv[1];
  return !!entryPath && resolve(entryPath) === fileURLToPath(moduleUrl);
}

// Importing this module is side-effect free; direct source and compiled launches listen.
if (isDirectExecution(import.meta.url)) {
  void start();
}

export { fastify, resolveProductionUiRoot, start };
