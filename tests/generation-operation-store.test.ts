import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GenerationOperationStore } from '../src/services/generation-operation-store.js';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

async function createStore(): Promise<{ root: string; store: GenerationOperationStore }> {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-operation-store-'));
  roots.push(root);
  await initializeProject(root);
  return { root, store: new GenerationOperationStore(root) };
}

function operationInput(overrides: Record<string, unknown> = {}) {
  return {
    generation_job_id: 'job-1',
    media_id: 'media-1',
    asset_kind: 'video' as const,
    request_id: 'request-1',
    provider: 'openai',
    provider_operation_id: 'provider-op-1',
    submitted_at: '2026-07-17T12:00:00.000Z',
    requested_delivery_profile: {
      name: 'portrait-hd',
      width: 1080,
      height: 1920,
      duration_sec: 8,
      video_aspect_ratio: '9:16' as const,
    },
    ...overrides,
  };
}

describe('GenerationOperationStore', () => {
  it('persists a full provider operation in the canonical JSONL ledger', async () => {
    const { root, store } = await createStore();
    const created = await store.create(operationInput());

    expect(created.status).toBe('submitted');
    expect(created.progress).toBeUndefined();
    expect(created.requested_delivery_profile).toMatchObject({ video_aspect_ratio: '9:16', width: 1080, height: 1920 });

    const paths = getProjectPaths(root);
    await expect(fs.readFile(paths.catalog.generationOperations, 'utf8')).resolves.toContain('provider-op-1');
  });

  it('reloads submitted work after restart and only reconciles non-terminal operations', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-operation-restart-'));
    roots.push(root);
    await initializeProject(root);
    const firstProcess = new GenerationOperationStore(root);
    const submitted = await firstProcess.create(operationInput());
    const processing = await firstProcess.update(submitted.id, {
      status: 'processing',
      progress: 0.4,
      last_polled_at: '2026-07-17T12:01:00.000Z',
    });
    const completed = await firstProcess.create(operationInput({
      provider_operation_id: 'provider-op-2',
      media_id: 'media-2',
      asset_kind: 'image',
      status: 'completed',
      provider_metadata: { request_id: 'request-2' },
    }));

    const restartedProcess = new GenerationOperationStore(root);
    await expect(restartedProcess.list()).resolves.toHaveLength(2);
    await expect(restartedProcess.listForRestartReconciliation()).resolves.toEqual([
      expect.objectContaining({ id: processing.id, status: 'processing', progress: 0.4 }),
      expect.objectContaining({
        id: completed.id,
        status: 'completed',
        provider_metadata: { request_id: 'request-2' },
      }),
    ]);

    await firstProcess.update(completed.id, { downloaded_take_id: 'take-1' });
    await expect(restartedProcess.listForRestartReconciliation()).resolves.toEqual([
      expect.objectContaining({ id: processing.id }),
    ]);
  });

  it('keeps remote work reconcilable when a generation job stops submitting new work', async () => {
    const { store } = await createStore();
    const submitted = await store.create(operationInput());
    const processing = await store.create(operationInput({ provider_operation_id: 'provider-op-2', media_id: 'media-2', asset_kind: 'image' }));
    await store.update(processing.id, { status: 'processing' });

    const resumable = await store.listForRestartReconciliation({ generationJobId: 'job-1' });
    expect(resumable.map((operation) => operation.id)).toEqual([submitted.id, processing.id]);
    expect(resumable.map((operation) => operation.status)).toEqual(['submitted', 'processing']);
  });

  it('filters by job, media, provider, and status', async () => {
    const { store } = await createStore();
    const first = await store.create(operationInput());
    await store.create(operationInput({ provider_operation_id: 'provider-op-2', generation_job_id: 'job-2', media_id: 'media-2', provider: 'google', asset_kind: 'image' }));
    await store.update(first.id, { status: 'failed', error: 'provider timeout' });

    await expect(store.list({ generationJobId: 'job-2', provider: 'google', statuses: ['submitted'] })).resolves.toEqual([
      expect.objectContaining({ media_id: 'media-2', asset_kind: 'image' }),
    ]);
    await expect(store.list({ mediaId: 'media-1', statuses: ['failed'] })).resolves.toEqual([
      expect.objectContaining({ id: first.id, error: 'provider timeout' }),
    ]);
  });
});
