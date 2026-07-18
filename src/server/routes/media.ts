import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Media, Take } from '../../types/index.js';
import { MediaSchema, TakeSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate, validateReferences } from '../../utils/validation.js';
import { resolveDefaultBlock } from '../../utils/defaultBlockResolver.js';
import { calculateCueLifecycle } from '../../services/cue-lifecycle.js';
import { runBatchGeneration } from '../../services/generation.js';
import {
    readCatalog,
    saveSnapshot,
    snapshotMessageForMedia,
    snapshotMessageForMediaUpdate
} from './snapshots.js';

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerMediaRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
    fastify.get('/api/media', async (request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const mediaItems = await readJsonl<Media>(paths.catalog.media, MediaSchema);

        const query = request.query as { ownerId?: string; ownerType?: string; type?: string; binId?: string };
        const ownerId = query.ownerId;
        const ownerType = query.ownerType;
        const type = query.type as Media['media_type'] | undefined;
        const binId = query.binId;

        const filtered = mediaItems.filter((m: Media) => {
            if (ownerId && m.owner_id !== ownerId) return false;
            if (ownerType && m.owner_type !== ownerType) return false;
            if (type && m.media_type !== type) return false;
            if (binId && m.bin_id !== binId) return false;
            return true;
        });

        return { media: filtered };
    });

    fastify.get('/api/media/:id/lifecycle', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }

        const catalog = await readCatalog(ctx.paths);
        const media = catalog.media.find((item) => item.id === request.params.id);
        if (!media) {
            reply.code(404);
            return { error: 'Media not found' };
        }

        const bin = catalog.bins.find((item) => item.id === media.bin_id);
        if (!bin) {
            reply.code(409);
            return { error: 'Media references a missing bin' };
        }

        const owner = media.owner_type === 'actor'
            ? catalog.actors.find((item) => item.id === media.owner_id) ?? null
            : media.owner_type === 'scene'
                ? catalog.scenes.find((item) => item.id === media.owner_id) ?? null
                : null;
        const defaults = await fs.pathExists(ctx.paths.moo.defaults)
            ? await fs.readJson(ctx.paths.moo.defaults)
            : null;
        const settings = resolveDefaultBlock(media.media_type, media, bin, owner, defaults).settings;
        const takes = await readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema);

        return { lifecycle: calculateCueLifecycle(media, takes, settings.approval_count_default ?? 1) };
    });

    fastify.post('/api/media', async (request: FastifyRequest, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        await ensureJsonlFile(paths.catalog.media);

        const body = request.body as Partial<Media> & { names?: string } | null;

        if (!body || !body.owner_type || !body.media_type || !body.bin_id || (!body.name && !body.names)) {
            reply.code(400);
            return { error: 'owner_type, media_type, bin_id, and name/names are required' };
        }

        const now = new Date().toISOString();

        // Support batch creation
        const inputNames = body.names || body.name || '';
        const allNames = inputNames.split(',').map((n: string) => n.trim()).filter((n: string) => n.length > 0);

        if (allNames.length === 0) {
            reply.code(400);
            return { error: 'At least one valid name is required' };
        }

        // Read catalog for snapshots and duplicate checking
        const catalog = await readCatalog(paths);

        // Validate Referential Integrity (RI)
        const ri = validateReferences(body, catalog);
        if (!ri.valid) {
            reply.code(400);
            return { error: 'Referential integrity failure', details: ri.errors };
        }

        const displayNames = allNames.length === 1 ? allNames[0] : `${allNames.length} items`;

        await saveSnapshot(
            paths,
            snapshotMessageForMedia('create', body.owner_type, body.owner_id ?? null, body.bin_id, displayNames, catalog),
            catalog
        );

        // Check for existing media and filter out duplicates
        const existingNames = new Set(
            catalog.media
                .filter(m => m.owner_id === body.owner_id && m.owner_type === body.owner_type && m.bin_id === body.bin_id)
                .map(m => m.name.toLowerCase())
        );

        const names = allNames.filter((n: string) => !existingNames.has(n.toLowerCase()));
        const duplicateNames = allNames.filter((n: string) => existingNames.has(n.toLowerCase()));

        if (names.length === 0) {
            reply.code(400);
            return { error: 'All provided names already exist for this bin', duplicates: duplicateNames };
        }

        const createdMedia: Media[] = [];

        for (const name of names) {
            const media: Media = {
                id: generateId(),
                owner_type: body.owner_type,
                owner_id: body.owner_id ?? null,
                media_type: body.media_type,
                bin_id: body.bin_id,
                name: name,
                prompt: body.prompt || (name.charAt(0).toUpperCase() + name.slice(1)),
                created_at: now,
                updated_at: now,
            };

            const validation = validate('media', media);
            if (!validation.valid) {
                reply.code(400);
                return { error: `Invalid media for name "${name}"`, details: validation.errors };
            }

            await appendJsonl(paths.catalog.media, media, MediaSchema);
            createdMedia.push(media);
        }

        const result: { media: Media | Media[]; duplicates_skipped?: string[]; message?: string } = names.length === 1 ? { media: createdMedia[0] } : { media: createdMedia };

        if (duplicateNames.length > 0) {
            result.duplicates_skipped = duplicateNames;
            result.message = `Created ${names.length} items. Skipped ${duplicateNames.length} duplicates: ${duplicateNames.join(', ')}`;
        }

        return result;
    });

    fastify.put('/api/media/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;

        const { id } = request.params;
        const body = request.body as Partial<Media>;

        if (!body) {
            reply.code(400);
            return { error: 'Request body is required' };
        }

        const catalog = await readCatalog(paths);
        const mediaIndex = catalog.media.findIndex(m => m.id === id);

        if (mediaIndex === -1) {
            reply.code(404);
            return { error: 'Media not found' };
        }

        const currentMedia = catalog.media[mediaIndex];

        const changes = { ...body };
        delete changes.selected_take_ids;
        const updatedMedia: Media = {
            ...currentMedia,
            ...changes,
            id,
            updated_at: new Date().toISOString(),
        };

        // Save snapshot
        const snapshotMessage = snapshotMessageForMediaUpdate(
            currentMedia.owner_type,
            currentMedia.owner_id ?? null,
            currentMedia.bin_id,
            currentMedia.name,
            catalog,
            currentMedia as unknown as Record<string, unknown>,
            updatedMedia as unknown as Record<string, unknown>
        );
        await saveSnapshot(paths, snapshotMessage, catalog);

        const validation = validate('media', updatedMedia);
        if (!validation.valid) {
            reply.code(400);
            return { error: 'Invalid media data', details: validation.errors };
        }

        catalog.media[mediaIndex] = updatedMedia;
        await writeJsonlAll(paths.catalog.media, catalog.media, MediaSchema);

        return { media: updatedMedia };
    });

    fastify.put('/api/media/:id/selection', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }

        const body = request.body as { take_ids?: string[] } | null;
        const takeIds = [...new Set(body?.take_ids || [])];
        if (!Array.isArray(body?.take_ids)) {
            reply.code(400);
            return { error: 'take_ids must be an array' };
        }

        const catalog = await readCatalog(ctx.paths);
        const mediaIndex = catalog.media.findIndex((item) => item.id === request.params.id);
        if (mediaIndex === -1) {
            reply.code(404);
            return { error: 'Media not found' };
        }

        const takes = await readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema);
        const selectedTakes = takes.filter((take) => takeIds.includes(take.id));
        if (selectedTakes.length !== takeIds.length || selectedTakes.some((take) => take.media_id !== request.params.id || take.status !== 'approved')) {
            reply.code(400);
            return { error: 'Selected takes must be approved takes belonging to this media item' };
        }

        const currentMedia = catalog.media[mediaIndex];
        const updatedMedia: Media = {
            ...currentMedia,
            selected_take_ids: takeIds,
            updated_at: new Date().toISOString(),
        };
        await saveSnapshot(ctx.paths, `Select ${takeIds.length} deliverable take(s) for ${currentMedia.name}`, catalog);
        catalog.media[mediaIndex] = updatedMedia;
        await writeJsonlAll(ctx.paths.catalog.media, catalog.media, MediaSchema);
        return { media: updatedMedia };
    });

    fastify.delete('/api/media/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { paths } = ctx;
        const { id } = request.params;

        const catalog = await readCatalog(paths);
        const mediaToDelete = catalog.media.find(m => m.id === id);
        if (!mediaToDelete) {
            reply.code(404);
            return { error: 'Media not found' };
        }

        await saveSnapshot(
            paths,
            snapshotMessageForMedia('delete', mediaToDelete.owner_type, mediaToDelete.owner_id ?? null, mediaToDelete.bin_id, mediaToDelete.name, catalog),
            catalog
        );

        const remainingMedia = catalog.media.filter((m) => m.id !== id);

        const takes = await readJsonl<Take>(paths.catalog.takes);
        const remainingTakes = takes.filter((t) => t.media_id !== id);

        await writeJsonlAll(paths.catalog.media, remainingMedia, MediaSchema);
        await writeJsonlAll(paths.catalog.takes, remainingTakes, TakeSchema);

        reply.code(204);
        return null;
    });

    // Generate takes for a specific media item
    fastify.post('/api/media/:id/generate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
        const ctx = getProjectContext();
        if (!ctx) {
            reply.code(400);
            return { error: 'No project selected' };
        }
        const { id } = request.params;
        const body = request.body as { count?: number } | undefined;
        const requestedCount = Number(body?.count ?? 1);
        const count = Number.isFinite(requestedCount)
            ? Math.max(1, Math.min(10, Math.floor(requestedCount)))
            : 1;

        try {
            // Keep this endpoint as a compatibility facade. All provider calls,
            // persistence, cancellation, and candidate creation belong to the
            // canonical generation service.
            const catalog = await readCatalog(ctx.paths);
            const media = catalog.media.find(m => m.id === id);
            if (!media) {
                reply.code(404);
                return { error: 'Media not found' };
            }

            const bin = catalog.bins.find(b => b.id === media.bin_id);
            if (!bin) {
                reply.code(404);
                return { error: 'Bin not found' };
            }

            const owner = media.owner_type === 'actor'
                ? catalog.actors.find(a => a.id === media.owner_id) ?? null
                : media.owner_type === 'scene'
                    ? catalog.scenes.find(s => s.id === media.owner_id) ?? null
                    : null;
            const defaults = await fs.pathExists(ctx.paths.moo.defaults)
                ? await fs.readJson(ctx.paths.moo.defaults)
                : null;
            const settings = resolveDefaultBlock(media.media_type, media, bin, owner, defaults).settings;
            const takes = await readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema);
            const lifecycle = calculateCueLifecycle(media, takes, settings.approval_count_default ?? 1);
            if (lifecycle.is_complete) {
                reply.code(409);
                return { error: 'Cue is complete. Remove Finish Early or unapprove a take before generating more.' };
            }

            const { job } = await runBatchGeneration(ctx.projectRoot, { mediaId: id, count });
            const createdIds = new Set(job.items.flatMap(item => item.take_ids ?? []));
            const updatedTakes = await readJsonl<Take>(ctx.paths.catalog.takes, TakeSchema);
            return { takes: updatedTakes.filter(take => createdIds.has(take.id)), job };
        } catch (err) {
            request.log.error(err);
            reply.code(500);
            return { error: (err as Error).message };
        }
    });
}
