import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Scene, Defaults } from '../../types/index.js';
import { SceneSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate, validateReferences } from '../../utils/validation.js';
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
        const scenes = await readJsonl<Scene>(paths.catalog.scenes, SceneSchema);
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

        const body = request.body as Partial<Scene> | undefined;

        if (!body || !body.name) {
            reply.code(400);
            return { error: 'Scene name is required' };
        }

        const snapshotMessage = `Create scene: ${body.name}`;
        const catalog = await readCatalog(paths);

        // Validate Referential Integrity (RI)
        const ri = validateReferences(body, catalog);
        if (!ri.valid) {
            reply.code(400);
            return { error: 'Referential integrity failure', details: ri.errors };
        }

        await saveSnapshot(paths, snapshotMessage, catalog);

        // Load global defaults for potential auto-blocks (though scenes often start empty)
        const defaultsPath = join(paths.root, 'defaults.json');
        let defaults: Defaults | null = null;
        try {
            if (await fs.pathExists(defaultsPath)) {
                defaults = await fs.readJson(defaultsPath);
            }
        } catch (err) {
            fastify.log.warn(err, 'Failed to load defaults.json');
        }

        const now = new Date().toISOString();

        // Determine auto-added blocks from template
        const autoAddBlocks = defaults?.templates?.scene?.auto_add_blocks || [];
        const defaultBlocks: any = {};
        for (const type of autoAddBlocks) {
            defaultBlocks[type as keyof Scene['default_blocks'] & string] = { provider: 'inherit' };
        }

        const scene: Scene = {
            id: generateId(),
            name: body.name,
            description: body.description || '',
            default_blocks: body.default_blocks || defaultBlocks,
            scene_complete: false,
            created_at: now,
            updated_at: now,
        };

        const validation = validate('scene', scene);
        if (!validation.valid) {
            reply.code(400);
            return { error: 'Invalid scene data', details: validation.errors };
        }

        await appendJsonl(paths.catalog.scenes, scene, SceneSchema);
        return { scene };
    });

    fastify.put('/api/scenes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const { id } = request.params;
        const body = request.body as Partial<Scene>;

        const catalog = await readCatalog(paths);
        const sceneIndex = catalog.scenes.findIndex(s => s.id === id);
        if (sceneIndex === -1) {
            reply.code(404);
            return { error: 'Scene not found' };
        }

        const updatedScene: Scene = {
            ...catalog.scenes[sceneIndex],
            ...body,
            id,
            updated_at: new Date().toISOString(),
        };

        await saveSnapshot(paths, `Update scene: ${updatedScene.name}`, catalog);

        const validation = validate('scene', updatedScene);
        if (!validation.valid) {
            reply.code(400);
            return { error: 'Invalid scene data', details: validation.errors };
        }

        catalog.scenes[sceneIndex] = updatedScene;
        await writeJsonlAll(paths.catalog.scenes, catalog.scenes, SceneSchema);

        return { scene: updatedScene };
    });

    fastify.delete('/api/scenes/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const { id } = request.params;

        const catalog = await readCatalog(paths);
        const sceneToDelete = catalog.scenes.find(s => s.id === id);
        if (!sceneToDelete) {
            reply.code(404);
            return { error: 'Scene not found' };
        }

        await saveSnapshot(paths, `Delete scene: ${sceneToDelete.name}`, catalog);

        const remainingScenes = catalog.scenes.filter(s => s.id !== id);

        // Cascade delete logic: 
        // 1. Sections owned by 'scene' type
        // 2. Sections referencing this scene via scene_id (even if owned by actor)
        const remainingSections = catalog.sections.filter(s =>
            !(s.owner_id === id && s.owner_type === 'scene') &&
            !(s.scene_id === id)
        );
        const removedSectionIds = new Set(catalog.sections
            .filter(s => (s.owner_id === id && s.owner_type === 'scene') || (s.scene_id === id))
            .map(s => s.id));

        const remainingContent = catalog.content.filter(c =>
            !(c.owner_id === id && c.owner_type === 'scene') &&
            !(c.scene_id === id) &&
            !removedSectionIds.has(c.section_id)
        );

        await writeJsonlAll(paths.catalog.scenes, remainingScenes, SceneSchema);
        await writeJsonlAll(paths.catalog.sections, remainingSections);
        await writeJsonlAll(paths.catalog.content, remainingContent);

        reply.code(204);
        return null;
    });
}
