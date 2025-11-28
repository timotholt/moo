import { join } from 'path';

export function registerDefaultsRoutes(fastify: any, getProjectContext: any) {
  // Global defaults endpoints
  fastify.get('/api/defaults', async (request: any, reply: any) => {
    const { paths } = getProjectContext();
    const defaultsPath = join(paths.root, 'defaults.json');
    
    try {
      const fs = await import('fs-extra').then(m => m.default);
      
      if (await fs.pathExists(defaultsPath)) {
        const defaults = await fs.readJson(defaultsPath);
        return { defaults };
      } else {
        // Return hardcoded defaults if no file exists
        const defaults = {
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
        return { defaults };
      }
    } catch (err) {
      fastify.log.error(err, 'Failed to read defaults');
      // Return structured 500 error so clients can handle it consistently
      reply.code(500);
      return { error: 'Failed to read defaults', details: (err as Error).message };
    }
  });

  fastify.put('/api/defaults/:contentType', async (request: any, reply: any) => {
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
        defaults = await fs.readJson(defaultsPath);
      } else {
        defaults = {
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
      }

      // Update the specific content type
      defaults[contentType] = { ...defaults[contentType], ...body };

      // Write back to file
      await fs.writeJson(defaultsPath, defaults, { spaces: 2 });

      return { defaults };
    } catch (err) {
      fastify.log.error(err, 'Failed to update defaults');
      reply.code(500);
      return { error: 'Failed to update defaults', details: (err as Error).message };
    }
  });
}
