import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { Readable } from 'stream';
import { importActorsService, importDialogService } from '../src/services/importer.js';
import { rebuildIndexesService } from '../src/services/indexing.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { initializeProject } from '../src/services/project-initializer.js';

const TEST_DIR = join(process.cwd(), 'test_temp_' + Date.now());

describe('M1 Service Layer Integration', () => {
    beforeEach(async () => {
        await fs.ensureDir(TEST_DIR);
    });

    afterEach(async () => {
        await fs.remove(TEST_DIR);
    });

    it('should import actors from CSV and rebuild indexes', async () => {
        const paths = getProjectPaths(TEST_DIR);
        const csvContent = `display_name,aliases,notes
Alice,Ali; A-Dawg,Lead role
Bob,,Supporting
`;
        const stream = Readable.from(csvContent);

        const count = await importActorsService(TEST_DIR, stream);
        expect(count).toBe(2);

        const fileContent = await fs.readFile(paths.catalog.actors, 'utf-8');
        const lines = fileContent.trim().split('\n');
        expect(lines.length).toBe(2);
        const actor1 = JSON.parse(lines[0]);
        expect(actor1.display_name).toBe('Alice');
        expect(actor1.aliases).toEqual(['Ali', 'A-Dawg']);

        await rebuildIndexesService(TEST_DIR);
        const actorIndexFile = join(paths.catalog.indexes.dir, 'by_actor', `${actor1.id}.json`);
        expect(await fs.pathExists(actorIndexFile)).toBe(true);
        const indexData = await fs.readJson(actorIndexFile);
        expect(indexData.actor_id).toBe(actor1.id);
    });

    it('imports dialogue and wipes only the actor catalog while retaining audio', async () => {
        await initializeProject(TEST_DIR, { displayName: 'Importer test' });
        const paths = getProjectPaths(TEST_DIR);
        const now = new Date().toISOString();
        const actor = {
            id: 'actor-1', display_name: 'Alice', base_filename: 'alice', default_blocks: {},
            actor_complete: false, created_at: now, updated_at: now,
        };
        const otherActor = { ...actor, id: 'actor-2', display_name: 'Bob', base_filename: 'bob' };
        const oldBin = {
            id: 'bin-old', owner_type: 'actor', owner_id: actor.id, media_type: 'dialogue', name: 'Old',
            default_blocks: {}, bin_complete: false, created_at: now, updated_at: now,
        };
        const otherBin = { ...oldBin, id: 'bin-other', owner_id: otherActor.id };
        const oldMedia = {
            id: 'media-old', owner_type: 'actor', owner_id: actor.id, bin_id: oldBin.id,
            media_type: 'dialogue', name: 'old_line', prompt: 'Old line', created_at: now, updated_at: now,
        };
        const otherMedia = { ...oldMedia, id: 'media-other', owner_id: otherActor.id, bin_id: otherBin.id };
        const oldTake = {
            id: 'take-old', media_id: oldMedia.id, take_number: 1, filename: 'old.mp3',
            path: 'actors/alice/dialogue/old.mp3', format: 'mp3', size_bytes: 5, status: 'new',
            created_at: now, updated_at: now,
        };
        await fs.writeFile(paths.catalog.actors, `${JSON.stringify(actor)}\n${JSON.stringify(otherActor)}\n`);
        await fs.writeFile(paths.catalog.bins, `${JSON.stringify(oldBin)}\n${JSON.stringify(otherBin)}\n`);
        await fs.writeFile(paths.catalog.media, `${JSON.stringify(oldMedia)}\n${JSON.stringify(otherMedia)}\n`);
        await fs.writeFile(paths.catalog.takes, `${JSON.stringify(oldTake)}\n`);
        const audioPath = join(TEST_DIR, oldTake.path);
        await fs.ensureDir(join(audioPath, '..'));
        await fs.writeFile(audioPath, 'audio');
        const scriptPath = join(TEST_DIR, 'dialog.txt');
        await fs.writeFile(scriptPath, '*Combat*\nTake cover 1!\nTake cover 2?\n');

        const result = await importDialogService(TEST_DIR, 'Alice', scriptPath, { wipe: true });

        expect(result).toEqual({ binsCount: 1, mediaCount: 2 });
        const bins = (await fs.readFile(paths.catalog.bins, 'utf8')).trim().split('\n').map(JSON.parse);
        const media = (await fs.readFile(paths.catalog.media, 'utf8')).trim().split('\n').map(JSON.parse);
        expect(bins.some(bin => bin.id === otherBin.id)).toBe(true);
        expect(bins.some(bin => bin.id === oldBin.id)).toBe(false);
        expect(media.some(item => item.id === otherMedia.id)).toBe(true);
        expect(media.filter(item => item.owner_id === actor.id).map(item => item.prompt)).toEqual(['Take cover!', 'Take cover?']);
        await expect(fs.readFile(paths.catalog.takes, 'utf8')).resolves.toBe('');
        await expect(fs.pathExists(audioPath)).resolves.toBe(true);
    });
});
