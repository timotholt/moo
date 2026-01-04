import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Scene } from '../../types/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import {
    readCatalog,
    saveSnapshot
} from './snapshots.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerSceneRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
    fastify.get('/api/scenes', async (_request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const scenes = await readJsonl<Scene>(paths.catalog.scenes).catch(() => []);
        return { scenes };
    });

    fastify.post('/api/scenes', async (request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        await ensureJsonlFile(paths.catalog.scenes);

        const body = request.body as {
            name: string;
            description?: string;
        };

        if (!body || !body.name) {
            reply.code(400);
            return { error: 'name is required' };
        }

        const catalog = await readCatalog(paths);
        await saveSnapshot(
            paths,
            `Create scene: ${body.name}`,
            catalog
        );

        const now = new Date().toISOString();
        const scene: Scene = {
            id: generateId(),
            name: body.name,
            description: body.description,
            created_at: now,
            updated_at: now,
        };

        await appendJsonl(paths.catalog.scenes, scene);
        return { scene };
    });
}
