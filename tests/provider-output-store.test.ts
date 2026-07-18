import { join } from 'node:path';
import { tmpdir } from 'node:os';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { ProviderOutputStore } from '../src/services/provider-output-store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

async function createStore(): Promise<{ root: string; store: ProviderOutputStore }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'moo-provider-output-'));
  roots.push(root);
  return { root, store: new ProviderOutputStore(root) };
}

describe('ProviderOutputStore', () => {
  it('stages content atomically and returns one deterministic restart-safe reference', async () => {
    const { root, store } = await createStore();
    const bytes = Buffer.from('provider-image-bytes');
    const first = await store.stage({
      providerId: 'openai-image',
      operationId: 'operation-1',
      bytes,
      mimeType: 'image/png',
    });
    const second = await store.stage({
      providerId: 'openai-image',
      operationId: 'operation-2',
      bytes,
      mimeType: 'image/png',
    });

    expect(second).toEqual(first);
    expect(first.path).toMatch(/^\.moo\/provider-output-staging\/openai-image-/);
    await expect(new ProviderOutputStore(root).read(first)).resolves.toEqual(bytes);
    expect((await fs.readdir(join(root, '.moo', 'provider-output-staging', first.path.split('/')[2])))
      .filter(name => name.endsWith('.tmp'))).toEqual([]);
  });

  it('refuses corrupted bytes and references outside project staging', async () => {
    const { root, store } = await createStore();
    const reference = await store.stage({
      providerId: 'google-image',
      operationId: 'operation-1',
      bytes: Buffer.from('original'),
      mimeType: 'image/webp',
    });
    await fs.writeFile(join(root, reference.path), Buffer.from('corrupt'));

    await expect(store.read(reference)).rejects.toThrow('failed integrity validation');
    await expect(store.read({
      ...reference,
      path: `../${reference.sha256}.webp`,
    })).rejects.toThrow('outside project staging');
  });
});
