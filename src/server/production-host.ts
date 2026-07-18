import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProductionUiOptions {
  enabled: boolean;
  moduleUrl: string;
  rootOverride?: string;
}

export interface ProductionUiStatus {
  enabled: boolean;
  available: boolean;
  root: string;
  reason?: string;
}

function isReadableFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveProductionUiRoot(moduleUrl: string, rootOverride?: string): string {
  const moduleDirectory = dirname(fileURLToPath(moduleUrl));
  if (rootOverride) {
    return isAbsolute(rootOverride)
      ? resolve(rootOverride)
      : resolve(moduleDirectory, rootOverride);
  }

  // src/server.ts and dist/server.js are both one directory below the
  // repository/application resource root.
  return resolve(moduleDirectory, '..', 'dist-ui-solid');
}

export function shouldServeProductionUi(
  moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  entryPath: string | undefined = process.argv[1],
): boolean {
  if (env.MOO_SERVE_UI === '1') return true;
  if (env.MOO_SERVE_UI === '0') return false;
  if (env.NODE_ENV === 'production') return true;
  if (!entryPath) return false;

  const modulePath = fileURLToPath(moduleUrl);
  return resolve(entryPath) === modulePath && modulePath.endsWith(join('dist', 'server.js'));
}

function requestPath(request: FastifyRequest): string {
  try {
    return new URL(request.raw.url ?? '/', 'http://moo.local').pathname;
  } catch {
    return '/';
  }
}

function isReservedServerPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/media' ||
    pathname.startsWith('/media/')
  );
}

function isSpaNavigation(request: FastifyRequest, pathname: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (isReservedServerPath(pathname)) return false;

  const finalSegment = pathname.split('/').pop() ?? '';
  if (finalSegment.includes('.')) return false;

  const accept = request.headers.accept ?? '';
  return pathname === '/' || accept.includes('text/html');
}

function sendServerNotFound(reply: FastifyReply, request: FastifyRequest) {
  return reply.code(404).send({
    message: `Route ${request.method}:${request.url} not found`,
    error: 'Not Found',
    statusCode: 404,
  });
}

export function registerProductionUi(
  fastify: FastifyInstance,
  options: ProductionUiOptions,
): ProductionUiStatus {
  const root = resolveProductionUiRoot(options.moduleUrl, options.rootOverride);
  if (!options.enabled) {
    return { enabled: false, available: false, root, reason: 'production UI hosting disabled' };
  }

  const indexPath = join(root, 'index.html');
  if (!isReadableFile(indexPath)) {
    fastify.setNotFoundHandler((request, reply) => {
      const pathname = requestPath(request);
      if (isReservedServerPath(pathname) || !isSpaNavigation(request, pathname)) {
        return sendServerNotFound(reply, request);
      }

      return reply.code(503).send({
        error: 'Production UI build unavailable',
        message: `Missing ${indexPath}; run pnpm run build:ui`,
        statusCode: 503,
      });
    });

    return {
      enabled: true,
      available: false,
      root,
      reason: `missing ${indexPath}`,
    };
  }

  fastify.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode >= 400) return payload;
    const pathname = requestPath(request);
    if (pathname === '/' || pathname === '/index.html' || isSpaNavigation(request, pathname)) {
      reply.header('Cache-Control', 'no-cache');
    } else if (pathname.startsWith('/assets/')) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return payload;
  });

  fastify.register(fastifyStatic, {
    root,
    wildcard: false,
    serveDotFiles: false,
  });

  fastify.setNotFoundHandler((request, reply) => {
    const pathname = requestPath(request);
    if (isReservedServerPath(pathname) || !isSpaNavigation(request, pathname)) {
      return sendServerNotFound(reply, request);
    }

    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html', root);
  });

  return { enabled: true, available: true, root };
}
