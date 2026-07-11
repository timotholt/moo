import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Defaults } from '../../types/index.js';
import { DefaultBlockSchema, MediaTypeSchema } from '../../shared/schemas/index.js';
import { validate } from '../../utils/validation.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerDefaultsRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  // Global defaults endpoints
  fastify.get('/api/defaults', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const defaultsPath = paths.moo.defaults;

    try {
      if (await fs.pathExists(defaultsPath)) {
        const defaults = await fs.readJson(defaultsPath);
        return { defaults };
      } else {
        // Return default template if no file
        const templatePath = join(process.cwd(), 'src', 'templates', 'defaults.template.json');
        if (await fs.pathExists(templatePath)) {
          return { defaults: await fs.readJson(templatePath) };
        }
        return { error: 'Defaults not found' };
      }
    } catch (err) {
      fastify.log.error(err, 'Failed to read defaults');
      reply.code(500);
      return { error: 'Failed to read defaults', details: (err as Error).message };
    }
  });

  fastify.put('/api/defaults', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const defaultsPath = paths.moo.defaults;
    const body = request.body as Defaults;

    try {
      // Validate full defaults object
      const validation = validate('defaults', body);
      if (!validation.valid) {
        reply.code(400);
        return { error: 'Invalid defaults data', details: validation.errors };
      }

      await fs.writeJson(defaultsPath, body, { spaces: 2 });
      return { defaults: body };
    } catch (err) {
      fastify.log.error(err, 'Failed to update defaults');
      reply.code(500);
      return { error: 'Failed to update defaults', details: (err as Error).message };
    }
  });

  // Update specific content type default
  fastify.put('/api/defaults/:contentType', async (request: FastifyRequest<{ Params: { contentType: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    const defaultsPath = paths.moo.defaults;
    const mediaType = MediaTypeSchema.safeParse(request.params.contentType);
    if (!mediaType.success) {
      reply.code(400);
      return { error: 'Unsupported media type' };
    }
    const contentType = mediaType.data;
    const settings = request.body as Record<string, unknown>;

    try {
      const defaults = await fs.readJson(defaultsPath) as Defaults;

      const mergedBlock = {
        ...defaults.content_types[contentType],
        ...settings
      };
      const parsedBlock = DefaultBlockSchema.safeParse(mergedBlock);
      if (!parsedBlock.success) {
        reply.code(400);
        return { error: 'Invalid media type defaults', details: parsedBlock.error.format() };
      }
      defaults.content_types[contentType] = parsedBlock.data;

      const validation = validate('defaults', defaults);
      if (!validation.valid) {
        reply.code(400);
        return { error: 'Invalid content type defaults', details: validation.errors };
      }

      await fs.writeJson(defaultsPath, defaults, { spaces: 2 });
      return { defaults };
    } catch {
      reply.code(500);
      return { error: 'Failed to update content type defaults' };
    }
  });
}
