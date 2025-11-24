import fs from 'fs-extra';
import { join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl } from '../utils/jsonl.js';
import { Actor, Content, Take } from '../types/index.js';

export async function rebuildIndexesService(projectRoot: string): Promise<void> {
    const paths = getProjectPaths(projectRoot);

    // Clear existing indexes
    await fs.emptyDir(paths.catalog.indexes.dir);
    await fs.ensureDir(join(paths.catalog.indexes.dir, 'by_actor'));
    await fs.ensureDir(join(paths.catalog.indexes.dir, 'by_content'));

    // Read all data
    const actors = await readJsonl<Actor>(paths.catalog.actors);
    const contentItems = await readJsonl<Content>(paths.catalog.content);
    const takes = await readJsonl<Take>(paths.catalog.takes);

    // Build Actor Index (by actor -> content_ids)
    for (const actor of actors) {
        const actorContent = contentItems.filter((c) => c.actor_id === actor.id);
        const indexData = {
            actor_id: actor.id,
            content_ids: actorContent.map((c) => c.id),
            content_count: actorContent.length,
            last_updated: new Date().toISOString(),
        };
        await fs.writeJson(paths.catalog.indexes.byActor(actor.id), indexData, { spaces: 2 });
    }

    // Build Content Index (by content -> takes + status)
    for (const content of contentItems) {
        const contentTakes = takes.filter((t) => t.content_id === content.id);
        const approvedTakes = contentTakes.filter((t) => t.status === 'approved');

        const indexData = {
            content_id: content.id,
            actor_id: content.actor_id,
            take_ids: contentTakes.map((t) => t.id),
            approved_take_ids: approvedTakes.map((t) => t.id),
            complete: content.complete,
            all_approved: content.all_approved,
            last_updated: new Date().toISOString(),
        };
        await fs.writeJson(paths.catalog.indexes.byContent(content.id), indexData, { spaces: 2 });
    }

    console.log('Indexes rebuilt.');
}
