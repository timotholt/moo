import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { Readable } from 'stream';
import { importActorsService } from '../src/services/importer.js';
import { rebuildIndexesService } from '../src/services/indexing.js';
import { getProjectPaths } from '../src/utils/paths.js';

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

        // 1. Create dummy CSV input
        const csvContent = `display_name,aliases,notes
Alice,Ali; A-Dawg,Lead role
Bob,,Supporting
`;
        const stream = Readable.from(csvContent);

        // 2. Run Import Service
        const count = await importActorsService(TEST_DIR, stream);
        expect(count).toBe(2);

        // 3. Verify JSONL content
        const fileContent = await fs.readFile(paths.catalog.actors, 'utf-8');
        const lines = fileContent.trim().split('\n');
        expect(lines.length).toBe(2);
        const actor1 = JSON.parse(lines[0]);
        expect(actor1.display_name).toBe('Alice');
        expect(actor1.aliases).toEqual(['Ali', 'A-Dawg']);

        // 4. Run Indexing Service
        await rebuildIndexesService(TEST_DIR);

        // 5. Verify Index
        const actorIndexFile = join(paths.catalog.indexes.dir, 'by_actor', `${actor1.id}.json`);
        expect(await fs.pathExists(actorIndexFile)).toBe(true);
        const indexData = await fs.readJson(actorIndexFile);
        expect(indexData.actor_id).toBe(actor1.id);
    });
});
