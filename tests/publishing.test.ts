import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { publishSelectedTakes } from '../src/services/publishing.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.remove(root))); });

describe('publishSelectedTakes', () => {
  it('exports only explicitly selected approved takes with a portable manifest', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Test Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = { id: 'cue-1', owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'sfx', name: 'rifle fire', cue_key: 'weapons.rifle.fire', tags: ['weapon'], selected_take_ids: ['take-1'], created_at: now, updated_at: now };
    const take = { id: 'take-1', media_id: 'cue-1', take_number: 2, filename: 'rifle_fire.mp3', path: 'global/sfx/rifle_fire.mp3', format: 'mp3', size_bytes: 5, status: 'approved', duration_sec: 1.2, hash_sha256: 'abc', created_at: now, updated_at: now };
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.ensureDir(join(root, 'global', 'sfx'));
    await fs.writeFile(join(root, take.path), 'audio');

    const result = await publishSelectedTakes(root, 'test-release');
    expect(result.exported_count).toBe(1);
    await expect(fs.readFile(join(root, 'exports/test-release/audio/rifle_fire.mp3'), 'utf8')).resolves.toBe('audio');
    const manifest = await fs.readJson(result.manifest_path);
    expect(manifest.assets[0]).toMatchObject({ cue_key: 'weapons.rifle.fire', selected_take_id: 'take-1', file: 'audio/rifle_fire.mp3' });
    const releases = (await fs.readFile(paths.catalog.releases, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ release_id: 'test-release', exported_count: 1, manifest_path: 'exports/test-release/manifest.json' });
  });

  it('rejects unsafe filenames before creating a partial release', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Test Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = { id: 'cue-unsafe', owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'sfx', name: 'unsafe', export_filename: '../outside.wav', selected_take_ids: ['take-unsafe'], created_at: now, updated_at: now };
    const take = { id: 'take-unsafe', media_id: 'cue-unsafe', take_number: 1, filename: 'unsafe.wav', path: 'global/sfx/unsafe.wav', format: 'wav', size_bytes: 5, status: 'approved', created_at: now, updated_at: now };
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.ensureDir(join(root, 'global', 'sfx'));
    await fs.writeFile(join(root, take.path), 'audio');

    await expect(publishSelectedTakes(root, 'unsafe-release')).rejects.toThrow('plain file name');
    await expect(fs.pathExists(join(root, 'exports', 'unsafe-release'))).resolves.toBe(false);
  });
});
