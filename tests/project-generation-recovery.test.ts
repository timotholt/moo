import { deflateSync } from 'node:zlib';
import os from 'node:os';
import { join } from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerationOperationStore } from '../src/services/generation-operation-store.js';
import { GeneratorRegistry } from '../src/services/generators/registry.js';
import type { AssetGenerator } from '../src/services/generators/types.js';
import { initializeProject } from '../src/services/project-initializer.js';
import { reconcileProjectGeneration } from '../src/services/project-generation-recovery.js';
import { appendJsonl, readJsonl } from '../src/utils/jsonl.js';
import { getProjectPaths } from '../src/utils/paths.js';
import type { Take } from '../src/shared/schemas/take.schema.js';

const roots: string[] = [];
const now = '2026-07-17T12:00:00.000Z';
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function transparentPng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const scanline = Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 0]);
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(scanline)), chunk('IEND', Buffer.alloc(0))]);
}

async function createProject() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-project-recovery-'));
  roots.push(root);
  await initializeProject(root);
  const paths = getProjectPaths(root);
  await appendJsonl(paths.catalog.bins, {
    id: 'bin-1', owner_type: 'global', owner_id: null, media_type: 'image', name: 'Illustrations', default_blocks: {}, created_at: now, updated_at: now,
  });
  await appendJsonl(paths.catalog.media, {
    id: 'media-1', owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'image', name: 'Hero', prompt: 'transparent hero', created_at: now, updated_at: now,
  });
  return { root, paths, store: new GenerationOperationStore(root) };
}

function generator(): AssetGenerator {
  return {
    providerId: 'fake',
    capabilities: () => ({ providerId: 'fake', media: { image: { supportsTransparency: true } } }),
    submit: vi.fn(),
    poll: vi.fn(),
    download: vi.fn().mockResolvedValue({ bytes: transparentPng(), mimeType: 'image/png', providerMetadata: { source: 'test' } }),
  };
}

async function completedOperation(store: GenerationOperationStore, mediaId = 'media-1') {
  return store.create({
    generation_job_id: 'job-1', media_id: mediaId, asset_kind: 'image', request_id: 'request-1', provider: 'fake', provider_operation_id: 'operation-1',
    status: 'completed', submitted_at: now,
    requested_delivery_profile: { width: 2, height: 1, format: 'png' },
  });
}

describe('reconcileProjectGeneration', () => {
  it('attaches a completed transparent PNG once and remains idempotent', async () => {
    const { root, paths, store } = await createProject();
    const operation = await completedOperation(store);
    const provider = generator();
    const registry = new GeneratorRegistry([provider]);

    await expect(reconcileProjectGeneration(root, registry)).resolves.toMatchObject({ eligible: 1, harvested: 1, errors: [] });
    const takes = await readJsonl<Take>(paths.catalog.takes);
    expect(takes).toHaveLength(1);
    expect(takes[0]).toMatchObject({ media_id: 'media-1', take_number: 1, format: 'png', width: 2, height: 1 });
    await expect(store.list()).resolves.toEqual([expect.objectContaining({ id: operation.id, downloaded_take_id: takes[0].id })]);

    await expect(reconcileProjectGeneration(root, registry)).resolves.toEqual({ eligible: 0, polled: 0, harvested: 0, failed: 0, errors: [] });
    expect(provider.download).toHaveBeenCalledTimes(1);
  });

  it('allocates the next take number from canonical takes at harvest time', async () => {
    const { root, paths, store } = await createProject();
    await appendJsonl(paths.catalog.takes, {
      id: 'prior-take', media_id: 'media-1', take_number: 7, filename: 'prior.png', path: 'global/image/illustrations/prior_007.png', format: 'png', size_bytes: 1, status: 'approved', created_at: now, updated_at: now,
    });
    await completedOperation(store);

    await reconcileProjectGeneration(root, new GeneratorRegistry([generator()]));
    await expect(readJsonl<Take>(paths.catalog.takes)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ take_number: 8 })]));
  });

  it('leaves a completed operation recoverable when its media is missing', async () => {
    const { root, store } = await createProject();
    const operation = await completedOperation(store, 'missing-media');

    await expect(reconcileProjectGeneration(root, new GeneratorRegistry([generator()]))).resolves.toEqual(expect.objectContaining({
      eligible: 1,
      harvested: 0,
      errors: [{ operationId: operation.id, provider: 'fake', message: 'Media "missing-media" is missing from the project catalog; completed provider work remains recoverable.' }],
    }));
    const [persisted] = await store.list();
    expect(persisted).toMatchObject({ id: operation.id, status: 'completed' });
    expect(persisted).not.toHaveProperty('downloaded_take_id');
  });
});
