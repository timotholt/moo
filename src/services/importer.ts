import { parse } from 'csv-parse';
import { Readable } from 'stream';
import fs from 'fs-extra';
import { getProjectPaths } from '../utils/paths.js';
import { generateId } from '../utils/ids.js';
import { appendJsonl, ensureJsonlFile, readJsonl, writeJsonlAll } from '../utils/jsonl.js';
import { validate } from '../utils/validation.js';
import { ActorSchema, BinSchema, MediaSchema, TakeSchema } from '../shared/schemas/index.js';
import type { Actor, Bin, Media, Take } from '../types/index.js';

export async function importActorsService(projectRoot: string, inputStream: Readable): Promise<number> {
    const paths = getProjectPaths(projectRoot);
    await ensureJsonlFile(paths.catalog.actors);

    const parser = inputStream.pipe(
        parse({
            columns: true,
            trim: true,
            skip_empty_lines: true,
        })
    );

    let count = 0;
    const now = new Date().toISOString();

    for await (const record of parser) {
        const baseFilenameSource: string = record.base_filename || record.display_name || '';
        const base_filename =
            record.base_filename ||
            baseFilenameSource
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '') + '_';

        const actor = {
            id: generateId(),
            display_name: record.display_name,
            base_filename,
            provider_settings: {
                dialogue: {
                    provider: 'manual',
                },
                music: {
                    provider: 'manual',
                },
                sfx: {
                    provider: 'manual',
                },
            },
            aliases: record.aliases ? record.aliases.split(';').map((s: string) => s.trim()) : [],
            notes: record.notes || '',
            created_at: now,
            updated_at: now,
        };

        const validation = validate('actor', actor);
        if (!validation.valid) {
            console.error(`Invalid actor record: ${JSON.stringify(record)}`);
            console.error(validation.errors);
            continue;
        }

        await appendJsonl(paths.catalog.actors, actor);
        count++;
    }

    return count;
}

export async function importDialogService(
    projectRoot: string,
    actorIdentifier: string,
    txtFilePath: string,
    options: { wipe?: boolean } = {}
): Promise<{ binsCount: number; mediaCount: number }> {
    const paths = getProjectPaths(projectRoot);

    const actors = await readJsonl<Actor>(paths.catalog.actors, ActorSchema);
    const normalizedIdentifier = actorIdentifier.toLowerCase();
    const actor = actors.find(candidate =>
        candidate.id === actorIdentifier ||
        candidate.base_filename === actorIdentifier ||
        candidate.display_name.toLowerCase() === normalizedIdentifier
    );

    if (!actor) {
        throw new Error(`Actor not found matching identifier: ${actorIdentifier}`);
    }

    const actorId = actor.id;
    const now = new Date().toISOString();
    const [existingBins, existingMedia, existingTakes] = await Promise.all([
        readJsonl<Bin>(paths.catalog.bins, BinSchema),
        readJsonl<Media>(paths.catalog.media, MediaSchema),
        readJsonl<Take>(paths.catalog.takes, TakeSchema),
    ]);

    const actorBinIds = new Set(
        existingBins
            .filter(bin => bin.owner_type === 'actor' && bin.owner_id === actorId)
            .map(bin => bin.id)
    );
    const actorMediaIds = new Set(
        existingMedia
            .filter(media =>
                (media.owner_type === 'actor' && media.owner_id === actorId) ||
                actorBinIds.has(media.bin_id)
            )
            .map(media => media.id)
    );

    const retainedBins = options.wipe
        ? existingBins.filter(bin => !actorBinIds.has(bin.id))
        : existingBins;
    const retainedMedia = options.wipe
        ? existingMedia.filter(media => !actorMediaIds.has(media.id))
        : existingMedia;
    const retainedTakes = options.wipe
        ? existingTakes.filter(take => !actorMediaIds.has(take.media_id))
        : existingTakes;

    const txtContent = await fs.readFile(txtFilePath, 'utf-8');
    const lines = txtContent.split('\n').map(line => line.trim()).filter(Boolean);
    let currentBinId: string | null = null;
    const importedBins: Bin[] = [];
    const importedMedia: Media[] = [];

    for (const line of lines) {
        const isCategory = (line.startsWith('*') && line.endsWith('*')) ||
            line.toLowerCase() === 'single word';
        if (isCategory) {
            currentBinId = generateId();
            importedBins.push(BinSchema.parse({
                id: currentBinId,
                owner_type: 'actor',
                owner_id: actorId,
                media_type: 'dialogue',
                name: line.replace(/\*/g, '').trim(),
                default_blocks: {},
                bin_complete: false,
                created_at: now,
                updated_at: now,
            }));
            continue;
        }

        if (!currentBinId) continue;
        const promptMatch = line.match(/^(.*?)\s+\d+([?!]+)?$/);
        const prompt = promptMatch
            ? `${promptMatch[1]}${promptMatch[2] ?? ''}`
            : line;
        importedMedia.push(MediaSchema.parse({
            id: generateId(),
            owner_type: 'actor',
            owner_id: actorId,
            bin_id: currentBinId,
            media_type: 'dialogue',
            name: line.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
            prompt,
            created_at: now,
            updated_at: now,
        }));
    }

    await Promise.all([
        writeJsonlAll(paths.catalog.bins, [...retainedBins, ...importedBins], BinSchema),
        writeJsonlAll(paths.catalog.media, [...retainedMedia, ...importedMedia], MediaSchema),
        writeJsonlAll(paths.catalog.takes, retainedTakes, TakeSchema),
    ]);

    return { binsCount: importedBins.length, mediaCount: importedMedia.length };
}
