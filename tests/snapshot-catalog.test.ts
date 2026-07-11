import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { readCatalog } from '../src/server/routes/snapshots.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.remove(root))); });

describe('snapshot catalog', () => {
  it('includes takes so review decisions participate in undo/redo snapshots', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-snapshot-'));
    roots.push(root);
    await initializeProject(root);
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify({ id: 'take-1', media_id: 'cue-1', take_number: 1, filename: 'a.wav', path: 'global/a.wav', format: 'wav', size_bytes: 1, status: 'new', created_at: now, updated_at: now })}\n`);
    await expect(readCatalog(paths)).resolves.toMatchObject({ takes: [{ id: 'take-1', media_id: 'cue-1' }] });
  });
});
