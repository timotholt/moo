import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Actor, Media, Bin, Take, Defaults, Scene } from '../../types/index.js';
import { MediaSchema, TakeSchema, ActorSchema, BinSchema, SceneSchema, DefaultsSchema } from '../../shared/schemas/index.js';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { validate, validateReferences } from '../../utils/validation.js';
import { getAudioProvider } from '../../services/provider-factory.js';
import { writeMetadata, buildMetadataFromTake } from '../../services/audio/metadata.js';
import { resolveDefaultBlock } from '../../utils/defaultBlockResolver.js';
import { buildTemplateContext, resolveTemplate } from '../../utils/templateResolver.js';
import { constructTakePath, getExtensionForType } from '../../utils/pathConstruction.js';
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
            snapshotMessageForMedia('create', body.owner_type as any, body.owner_id ?? null, body.bin_id, displayNames, catalog),
            catalog
        );

        // Check for existing media and filter out duplicates
        const existingNames = new Set(
            catalog.media
                .filter(m => m.owner_id === body.owner_id && m.owner_type === body.owner_type as any && m.bin_id === body.bin_id)
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
                owner_type: body.owner_type as any,
                owner_id: body.owner_id ?? null,
                media_type: body.media_type as any,
                bin_id: body.bin_id,
                name: name,
                prompt: body.prompt || (name.charAt(0).toUpperCase() + name.slice(1)),
                all_approved: false,
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

        const updatedMedia: Media = {
            ...currentMedia,
            ...body,
            id,
            updated_at: new Date().toISOString(),
        };

        // Save snapshot
        const snapshotMessage = snapshotMessageForMediaUpdate(
            currentMedia.owner_type as any,
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
            snapshotMessageForMedia('delete', mediaToDelete.owner_type as any, mediaToDelete.owner_id ?? null, mediaToDelete.bin_id, mediaToDelete.name, catalog),
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
        const { projectRoot, paths } = ctx;
        const { id } = request.params;
        const body = request.body as { count?: number } | undefined;
        const count = body?.count || 1;

        try {
            // 1. Load context data
            const catalog = await readCatalog(paths);
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

            let owner: Actor | Scene | null = null;
            if (media.owner_type === 'actor' && media.owner_id) {
                owner = catalog.actors.find(a => a.id === media.owner_id) || null;
            } else if (media.owner_type === 'scene' && media.owner_id) {
                owner = catalog.scenes.find(s => s.id === media.owner_id) || null;
            }

            // Load global defaults
            const defaultsPath = join(paths.root, 'defaults.json');
            let globalDefaults: Defaults | null = null;
            if (await fs.pathExists(defaultsPath)) {
                globalDefaults = await fs.readJson(defaultsPath);
            }

            // 2. Resolve Settings
            const resolved = resolveDefaultBlock(media.media_type, media, bin, owner, globalDefaults);
            const settings = resolved.settings;

            // 3. Setup Generation
            const provider = await getAudioProvider(projectRoot);
            const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);
            const takesForMedia = takes.filter(t => t.media_id === media.id);
            let nextTakeNumber = takesForMedia.reduce((max, t) => Math.max(max, t.take_number), 0) + 1;

            const generatedTakes: Take[] = [];

            for (let i = 0; i < count; i++) {
                const takeNumber = nextTakeNumber++;

                // 4. Resolve Template Variables
                const templateContext = buildTemplateContext({
                    media,
                    bin,
                    owner,
                    takeNumber
                });

                const promptTemplate = settings.templates?.prompt || '{prompt}';
                let prompt = resolveTemplate(promptTemplate, templateContext);

                if (!prompt || prompt === '{prompt}' || prompt === promptTemplate) {
                    prompt = media.prompt || media.name;
                }

                // Generate buffer
                let buffer: Buffer;
                if (media.media_type === 'dialogue') {
                    if (!settings.voice_id) throw new Error('No voice_id resolved for dialogue');
                    buffer = await provider.generateDialogue(prompt, settings.voice_id, {
                        stability: settings.stability,
                        similarity_boost: settings.similarity_boost
                    }, settings.model_id);
                } else if (media.media_type === 'music') {
                    buffer = await provider.generateMusic(prompt, { duration_seconds: settings.duration_seconds || 30 });
                } else if (media.media_type === 'sfx') {
                    buffer = await provider.generateSFX(prompt, {});
                } else {
                    throw new Error(`Generation not supported for ${media.media_type}`);
                }

                // Construct path
                const actorBaseFilename = (owner && 'base_filename' in owner) ? (owner as any).base_filename : undefined;
                const relativePath = constructTakePath(media, bin, takeNumber, actorBaseFilename);
                const fullFilePath = join(paths.root, relativePath);
                const folderPath = join(projectRoot, join(paths.root, relativePath), '..');

                // Save file
                await fs.ensureDir(folderPath);
                await fs.writeFile(fullFilePath, buffer);

                // Analyze file
                const { probeAudio } = await import('../../services/audio/ffprobe.js');
                const { hashFile } = await import('../../services/audio/hash.js');
                const probeResult = await probeAudio(fullFilePath);
                const hash = await hashFile(fullFilePath);

                const now = new Date().toISOString();
                const primaryStream = probeResult.streams[0];

                // Create Take object with full provenance
                const take: Take = {
                    id: generateId(),
                    media_id: media.id,
                    take_number: takeNumber,
                    filename: join(relativePath).split(/[/\\]/).pop() || 'file.mp3',
                    path: relativePath,
                    status: 'new',
                    format: getExtensionForType(media.media_type) as any,
                    size_bytes: buffer.length,
                    duration_sec: probeResult.format.duration || 0,
                    hash_sha256: hash,
                    sample_rate: (primaryStream?.sample_rate ? Number(primaryStream.sample_rate) : 41000) as any,
                    channels: (primaryStream?.channels || 1) as any,
                    bit_depth: 16, // Default
                    lufs_integrated: 0,
                    peak_dbfs: 0,
                    generation_params: {
                        provider: settings.provider as any,
                        resolved_from: resolved.resolvedFrom as any,
                        full_settings: settings,
                        prompt: prompt,
                        owner_type: media.owner_type,
                        owner_id: media.owner_id ?? null,
                        owner_name: owner ? (('display_name' in owner) ? (owner as any).display_name : (owner as any).name) : 'Global',
                        bin_name: bin.name,
                        generated_at: now
                    },
                    created_at: now,
                    updated_at: now,
                };

                const takeValidation = validate('take', take);
                if (!takeValidation.valid) {
                    console.error('Generated invalid take:', takeValidation.errors);
                }

                await appendJsonl(paths.catalog.takes, take, TakeSchema);

                // Write metadata
                try {
                    const metadata = buildMetadataFromTake(take as any, media as any, {
                        actor_name: owner ? (('display_name' in owner) ? (owner as any).display_name : (owner as any).name) : 'Global',
                        bin_name: bin.name,
                    });
                    await writeMetadata(fullFilePath, fullFilePath, metadata);
                } catch (mErr) {
                    fastify.log.warn(mErr, 'Failed to write metadata');
                }

                generatedTakes.push(take);
            }

            return { takes: generatedTakes };
        } catch (err) {
            request.log.error(err);
            reply.code(500);
            return { error: (err as Error).message };
        }
    });
}
