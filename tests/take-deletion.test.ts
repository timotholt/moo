import Fastify from 'fastify';
import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerTakeRoutes } from '../src/server/routes/takes.js';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.remove(root))); });

describe('take deletion', () => {
  it('removes only the catalog record, retains the source audio, and snapshots the change', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-take-delete-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Test library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const take = {
      id: 'take-1', media_id: 'cue-1', take_number: 1, filename: 'shot.mp3', path: 'global/sfx/shot.mp3',
      format: 'mp3', size_bytes: 5, status: 'new', created_at: now, updated_at: now,
    };
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    const audioPath = join(root, take.path);
    await fs.ensureDir(join(root, 'global', 'sfx'));
    await fs.writeFile(audioPath, 'audio');

    const app = Fastify();
    registerTakeRoutes(app, () => ({ projectRoot: root, paths }));
    const response = await app.inject({ method: 'DELETE', url: '/api/takes/take-1' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ audio_retained: true, take: { id: 'take-1' } });
    await expect(fs.pathExists(audioPath)).resolves.toBe(true);
    await expect(fs.readFile(paths.catalog.takes, 'utf8')).resolves.toBe('');
    const snapshots = (await fs.readFile(paths.catalog.snapshots, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({ takes: [take] });
  });
});
