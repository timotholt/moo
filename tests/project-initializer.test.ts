import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

describe('initializeProject', () => {
  it('creates the complete canonical V2 layout and preserves it when rerun', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-project-'));
    roots.push(root);
    const projectRoot = join(root, 'audio-library');

    await initializeProject(projectRoot, { displayName: 'Audio Library' });
    const paths = getProjectPaths(projectRoot);

    await expect(fs.pathExists(paths.moo.config)).resolves.toBe(true);
    await expect(fs.pathExists(paths.catalog.generationJobs)).resolves.toBe(true);
    await expect(fs.pathExists(paths.catalog.generationOperations)).resolves.toBe(true);
    await expect(fs.pathExists(paths.catalog.redoSnapshots)).resolves.toBe(true);
    await expect(fs.pathExists(paths.catalog.indexes.byMedia('cue-1'))).resolves.toBe(false);
    await expect(fs.pathExists(paths.media.exports)).resolves.toBe(true);

    const config = await fs.readJson(paths.moo.config);
    expect(config.name).toBe('Audio Library');

    await fs.writeFile(paths.catalog.media, '{"preserved":true}\n');
    await initializeProject(projectRoot, { displayName: 'Changed Name' });
    await expect(fs.readFile(paths.catalog.media, 'utf8')).resolves.toBe('{"preserved":true}\n');
    expect((await fs.readJson(paths.moo.config)).name).toBe('Audio Library');
  });
});
