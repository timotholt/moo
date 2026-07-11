import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonlAll } from '../src/utils/jsonl.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.remove(root))); });

describe('writeJsonlAll', () => {
  it('replaces the complete catalog and leaves no temporary file behind', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-jsonl-'));
    roots.push(root);
    const target = join(root, 'catalog', 'takes.jsonl');
    await fs.writeFile(target, '{"old":true}\n').catch(async () => {
      await fs.ensureDir(join(root, 'catalog'));
      await fs.writeFile(target, '{"old":true}\n');
    });

    await writeJsonlAll(target, [{ id: 'new-1' }, { id: 'new-2' }]);

    await expect(fs.readFile(target, 'utf8')).resolves.toBe('{"id":"new-1"}\n{"id":"new-2"}\n');
    expect((await fs.readdir(join(root, 'catalog'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
