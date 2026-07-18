import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GenerationOperationStore } from '../src/services/generation-operation-store.js';
import { GenerationReconciler } from '../src/services/generation-reconciler.js';
import { GeneratorRegistry } from '../src/services/generators/registry.js';
import type { AssetGenerator, ProviderOperation } from '../src/services/generators/types.js';
import { initializeProject } from '../src/services/project-initializer.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

async function createStore(): Promise<GenerationOperationStore> {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-reconciler-'));
  roots.push(root);
  await initializeProject(root);
  return new GenerationOperationStore(root);
}

async function createOperation(store: GenerationOperationStore, overrides: Record<string, unknown> = {}) {
  return store.create({
    generation_job_id: 'job-1',
    media_id: 'media-1',
    asset_kind: 'video',
    request_id: 'request-1',
    provider: 'fake',
    provider_operation_id: 'provider-operation-1',
    submitted_at: '2026-07-17T12:00:00.000Z',
    ...overrides,
  });
}

function fakeGenerator(poll: (operation: ProviderOperation) => Promise<ProviderOperation>): AssetGenerator {
  return {
    providerId: 'fake',
    capabilities: () => ({ providerId: 'fake', media: { video: {} } }),
    submit: vi.fn(),
    poll: vi.fn(poll),
    download: vi.fn().mockResolvedValue({
      bytes: Buffer.from('generated-video'),
      mimeType: 'video/mp4',
      providerMetadata: { completed: true },
    }),
  };
}

describe('GenerationReconciler', () => {
  it('polls processing work once, persists completion, then harvests it', async () => {
    const store = await createStore();
    const operation = await createOperation(store, { status: 'processing' });
    const generator = fakeGenerator(async (providerOperation) => ({ ...providerOperation, status: 'completed' }));
    const createTake = vi.fn().mockResolvedValue('take-1');
    const reconciler = new GenerationReconciler(store, new GeneratorRegistry([generator]), createTake);

    await expect(reconciler.reconcile()).resolves.toMatchObject({ eligible: 1, polled: 1, harvested: 1, failed: 0, errors: [] });
    expect(generator.poll).toHaveBeenCalledTimes(1);
    expect(generator.download).toHaveBeenCalledTimes(1);
    expect(createTake).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({ id: operation.id, status: 'completed' }),
      providerOperation: expect.objectContaining({ operationId: 'provider-operation-1', requestId: 'request-1' }),
    }));
    await expect(store.list()).resolves.toEqual([expect.objectContaining({
      id: operation.id,
      status: 'completed',
      downloaded_take_id: 'take-1',
      last_polled_at: expect.any(String),
    })]);
  });

  it('harvests an already-completed operation without polling', async () => {
    const store = await createStore();
    await createOperation(store, { status: 'completed' });
    const generator = fakeGenerator(async (providerOperation) => providerOperation);
    const reconciler = new GenerationReconciler(store, new GeneratorRegistry([generator]), vi.fn().mockResolvedValue('take-1'));

    await expect(reconciler.reconcile()).resolves.toMatchObject({ eligible: 1, polled: 0, harvested: 1, errors: [] });
    expect(generator.poll).not.toHaveBeenCalled();
    expect(generator.download).toHaveBeenCalledTimes(1);
  });

  it('does not poll or download an operation again after its take is attached', async () => {
    const store = await createStore();
    await createOperation(store, { status: 'completed' });
    const generator = fakeGenerator(async (providerOperation) => providerOperation);
    const createTake = vi.fn().mockResolvedValue('take-1');
    const reconciler = new GenerationReconciler(store, new GeneratorRegistry([generator]), createTake);

    await reconciler.reconcile();
    await expect(reconciler.reconcile()).resolves.toEqual({ eligible: 0, polled: 0, harvested: 0, failed: 0, errors: [] });
    expect(generator.poll).not.toHaveBeenCalled();
    expect(generator.download).toHaveBeenCalledTimes(1);
    expect(createTake).toHaveBeenCalledTimes(1);
  });

  it('keeps work recoverable when its generator is missing', async () => {
    const store = await createStore();
    const operation = await createOperation(store, { status: 'processing', provider: 'unconfigured' });
    const reconciler = new GenerationReconciler(store, new GeneratorRegistry(), vi.fn());

    await expect(reconciler.reconcile()).resolves.toEqual({
      eligible: 1,
      polled: 0,
      harvested: 0,
      failed: 0,
      errors: [{
        operationId: operation.id,
        provider: 'unconfigured',
        message: 'Generator "unconfigured" is not configured; provider work remains recoverable.',
      }],
    });
    await expect(store.list()).resolves.toEqual([expect.objectContaining({ id: operation.id, status: 'processing' })]);
  });
});
