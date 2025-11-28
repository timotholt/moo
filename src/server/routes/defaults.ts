import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerDefaultsRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext) {
  const DEFAULTS: Record<string, Record<string, unknown>> = {
    dialogue: { 
      provider: 'elevenlabs', 
      batch_generate: 1, 
      approval_count_default: 1, 
      stability: 0.5, 
      similarity_boost: 0.75 
    },
    music: { 
      provider: 'elevenlabs', 
      batch_generate: 1, 
      approval_count_default: 1 
    },
    sfx: { 
      provider: 'elevenlabs', 
      batch_generate: 1, 
      approval_count_default: 1 
    }
  };

  // Global defaults endpoints
  fastify.get('/api/defaults', async (_request: FastifyRequest, reply: FastifyReply) => {
    const { paths } = getProjectContext();
    const defaultsPath = join(paths.root, 'defaults.json');
    
    try {
      const fs = await import('fs-extra').then(m => m.default);
      
      if (await fs.pathExists(defaultsPath)) {
        try {
          const defaults = await fs.readJson(defaultsPath);
          return { defaults };
        } catch (err) {
          // If the file is empty or invalid JSON, log and fall back to hardcoded defaults
          fastify.log.warn({ err }, 'defaults.json invalid; falling back to DEFAULTS');
          return { defaults: DEFAULTS };
        }
      } else {
        // Return hardcoded defaults if no file exists
        return { defaults: DEFAULTS };
      }
    } catch (err) {
      fastify.log.error(err, 'Failed to read defaults');
      // Return structured 500 error so clients can handle it consistently
      reply.code(500);
      return { error: 'Failed to read defaults', details: (err as Error).message };
    }
  });

  fastify.put('/api/defaults/:contentType', async (request: FastifyRequest<{ Params: { contentType: string } }>, reply: FastifyReply) => {
    const { paths } = getProjectContext();
    const defaultsPath = join(paths.root, 'defaults.json');
    const contentType = (request.params as { contentType: string }).contentType as 'dialogue' | 'music' | 'sfx';
    const body = request.body as Record<string, unknown>;

    if (!['dialogue', 'music', 'sfx'].includes(contentType)) {
      reply.code(400);
      return { error: 'Invalid content type' };
    }

    try {
      const fs = await import('fs-extra').then(m => m.default);
      
      // Read existing defaults or create new ones
      let defaults: Record<string, Record<string, unknown>> = {};
      if (await fs.pathExists(defaultsPath)) {
        try {
          defaults = await fs.readJson(defaultsPath);
        } catch (err) {
          // If the file is empty or invalid, log and start from DEFAULTS instead of failing
          fastify.log.warn({ err }, 'defaults.json invalid; reinitializing from DEFAULTS');
          defaults = { ...DEFAULTS };
        }
      } else {
        defaults = { ...DEFAULTS };
      }

      // Update the specific content type
      defaults[contentType] = { ...defaults[contentType], ...body };

      // Write back to file
      await fs.writeJson(defaultsPath, defaults, { spaces: 2 });

      return { defaults };
    } catch (err) {
      const error = err as NodeJS.ErrnoException;

      // If the defaults file or directory was missing, recreate it from DEFAULTS
      if (error.code === 'ENOENT') {
        try {
          const fs = await import('fs-extra').then(m => m.default);
          const path = await import('path');
          await fs.ensureDir(path.dirname(defaultsPath));

          const recreated = { ...DEFAULTS, [contentType]: { ...DEFAULTS[contentType], ...body } };
          await fs.writeJson(defaultsPath, recreated, { spaces: 2 });

          return { defaults: recreated };
        } catch (innerErr) {
          fastify.log.error(innerErr, 'Failed to recreate defaults after ENOENT');
        }
      }

      fastify.log.error(err, 'Failed to update defaults');
      reply.code(500);
      return { error: 'Failed to update defaults', details: error.message };
    }
  });
}
