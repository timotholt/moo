import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Bin, Take } from '../../types/index.js';
import { BinSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate, validateReferences } from '../../utils/validation.js';
import {
    readCatalog,
    saveSnapshot,
    snapshotMessageForBin,
    snapshotMessageForBinUpdate
} from './snapshots.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerBinRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
    fastify.get('/api/bins', async (_request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const bins = await readJsonl<Bin>(paths.catalog.bins, BinSchema);
        return { bins };
    });

    fastify.post('/api/bins', async (request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        await ensureJsonlFile(paths.catalog.bins);

        const body = request.body as Partial<Bin> | undefined;

        if (!body || !body.owner_type || !body.media_type) {
            reply.code(400);
            return { error: 'owner_type and media_type are required' };
        }

        if ((body.owner_type === 'actor' || body.owner_type === 'scene') && !body.owner_id) {
            reply.code(400);
            return { error: 'owner_id is required for actors and scenes' };
        }

        // Read catalog once and save snapshot
        const catalog = await readCatalog(paths);

        // Validate Referential Integrity (RI)
        const ri = validateReferences(body, catalog);
        if (!ri.valid) {
            reply.code(400);
            return { error: 'Referential integrity failure', details: ri.errors };
        }

        const binName = body.name || body.media_type;

        console.log('[API] Creating bin. Body:', JSON.stringify(body, null, 2));

        const snapshotMessage = snapshotMessageForBin(
            'create',
            body.owner_type as any,
            body.owner_id ?? null,
            binName,
            catalog
        );
        await saveSnapshot(paths, snapshotMessage, catalog);

        const now = new Date().toISOString();
        const bin: Bin = {
            id: generateId(),
            owner_type: body.owner_type as any,
            owner_id: body.owner_id ?? null,
            media_type: body.media_type as any,
            name: body.name || body.media_type,
            scene_id: body.scene_id || undefined,
            default_blocks: body.default_blocks || { [body.media_type]: { provider: 'inherit' } },
            bin_complete: false,
            created_at: now,
            updated_at: now,
        };

        console.log('[API] Bin object created:', JSON.stringify(bin, null, 2));

        const validation = validate('bin', bin);
        if (!validation.valid) {
            console.error('[API] Validation failed:', JSON.stringify(validation.errors, null, 2));
            reply.code(400);
            return { error: 'Invalid bin data', details: validation.errors };
        }

        await appendJsonl(paths.catalog.bins, bin, BinSchema);
        return { bin };
    });

    fastify.put('/api/bins/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;

        const { id } = request.params;
        const body = request.body as Partial<Bin>;

        if (!body) {
            reply.code(400);
            return { error: 'Request body is required' };
        }

        const catalog = await readCatalog(paths);
        const binIndex = catalog.bins.findIndex(b => b.id === id);

        if (binIndex === -1) {
            reply.code(404);
            return { error: 'Bin not found' };
        }

        const currentBin = catalog.bins[binIndex];

        // Check for duplicate names within same owner/type
        if (body.name && body.name !== currentBin.name) {
            const duplicate = catalog.bins.find(b =>
                b.id !== id &&
                b.owner_type === currentBin.owner_type &&
                b.owner_id === currentBin.owner_id &&
                b.media_type === currentBin.media_type &&
                b.name === body.name
            );
            if (duplicate) {
                reply.code(400);
                return { error: 'A bin with this name already exists for this owner and type' };
            }
        }

        const updatedBin: Bin = {
            ...currentBin,
            ...body,
            id,
            updated_at: new Date().toISOString(),
        };

        // Save snapshot
        const currentName = currentBin.name || currentBin.media_type;
        const snapshotMessage = snapshotMessageForBinUpdate(
            currentBin.owner_type as any,
            currentBin.owner_id ?? null,
            currentName,
            catalog,
            currentBin as unknown as Record<string, unknown>,
            updatedBin as unknown as Record<string, unknown>
        );
        await saveSnapshot(paths, snapshotMessage, catalog);

        // Validate
        const validation = validate('bin', updatedBin);
        if (!validation.valid) {
            reply.code(400);
            return { error: 'Invalid bin data', details: validation.errors };
        }

        catalog.bins[binIndex] = updatedBin;
        await writeJsonlAll(paths.catalog.bins, catalog.bins, BinSchema);

        return { bin: updatedBin };
    });

    fastify.delete('/api/bins/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const { id } = request.params;

        const catalog = await readCatalog(paths);
        const bin = catalog.bins.find(b => b.id === id);
        if (!bin) {
            reply.code(404);
            return { error: 'Bin not found' };
        }

        const binName = bin.name || bin.media_type;
        const snapshotMessage = snapshotMessageForBin('delete', bin.owner_type as any, bin.owner_id ?? null, binName, catalog);
        await saveSnapshot(paths, snapshotMessage, catalog);

        const remainingBins = catalog.bins.filter(b => b.id !== id);

        // Cascade delete media and takes
        const removedMedia = catalog.media.filter(m => m.bin_id === id);
        const removedMediaIds = new Set(removedMedia.map(m => m.id));
        const remainingMedia = catalog.media.filter(m => m.bin_id !== id);

        const takes = await readJsonl<Take>(paths.catalog.takes);
        const remainingTakes = takes.filter(t => !removedMediaIds.has(t.media_id));

        await writeJsonlAll(paths.catalog.bins, remainingBins, BinSchema);
        await writeJsonlAll(paths.catalog.media, remainingMedia);
        await writeJsonlAll(paths.catalog.takes, remainingTakes);

        reply.code(204);
        return null;
    });
}
