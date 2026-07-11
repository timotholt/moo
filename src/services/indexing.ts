import fs from 'fs-extra';
import { join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl } from '../utils/jsonl.js';
import { Actor, Media, Take, Bin } from '../types/index.js';

export async function rebuildIndexesService(projectRoot: string): Promise<void> {
    const paths = getProjectPaths(projectRoot);

    // Clear existing indexes
    await fs.emptyDir(paths.catalog.indexes.dir);
    await fs.ensureDir(join(paths.catalog.indexes.dir, 'by_actor'));
    await fs.ensureDir(join(paths.catalog.indexes.dir, 'by_bin'));
    await fs.ensureDir(join(paths.catalog.indexes.dir, 'by_media'));

    // Read all data
    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const bins = await readJsonl<Bin>(paths.catalog.bins);
    const mediaItems = await readJsonl<Media>(paths.catalog.media);
    const takes = await readJsonl<Take>(paths.catalog.takes);

    // Build Actor Index
    for (const actor of actors) {
        const actorMedia = mediaItems.filter((m) => m.owner_id === actor.id && m.owner_type === 'actor');
        const indexData = {
            actor_id: actor.id,
            media_ids: actorMedia.map((m) => m.id),
            media_count: actorMedia.length,
            last_updated: new Date().toISOString(),
        };
        await fs.writeJson(paths.catalog.indexes.byActor(actor.id), indexData, { spaces: 2 });
    }

    // Build Bin Index
    for (const bin of bins) {
        const binMedia = mediaItems.filter((m) => m.bin_id === bin.id);
        const indexData = {
            bin_id: bin.id,
            owner_id: bin.owner_id,
            owner_type: bin.owner_type,
            media_ids: binMedia.map((m) => m.id),
            media_count: binMedia.length,
            last_updated: new Date().toISOString(),
        };
        await fs.writeJson(paths.catalog.indexes.byBin(bin.id), indexData, { spaces: 2 });
    }

    // Build Media Index
    for (const media of mediaItems) {
        const mediaTakes = takes.filter((t) => t.media_id === media.id);
        const approvedTakes = mediaTakes.filter((t) => t.status === 'approved');

        const indexData = {
            media_id: media.id,
            bin_id: media.bin_id,
            owner_id: media.owner_id,
            take_ids: mediaTakes.map((t) => t.id),
            approved_take_ids: approvedTakes.map((t) => t.id),
            last_updated: new Date().toISOString(),
        };
        await fs.writeJson(paths.catalog.indexes.byMedia(media.id), indexData, { spaces: 2 });
    }

    console.log('Indexes rebuilt.');
}
