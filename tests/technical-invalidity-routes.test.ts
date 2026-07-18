import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { registerMediaRoutes } from '../src/server/routes/media.js';
import { registerTakeRoutes } from '../src/server/routes/takes.js';
import { initializeProject } from '../src/services/project-initializer.js';
import { TakeSchema, type Take } from '../src/shared/schemas/take.schema.js';
import { readJsonl, writeJsonlAll } from '../src/utils/jsonl.js';
import { getProjectPaths } from '../src/utils/paths.js';

const roots: string[] = [];
const apps: FastifyInstance[] = [];
const now = '2026-07-17T00:00:00.000Z';

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

async function fixture() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-technical-routes-'));
  roots.push(root);
  await initializeProject(root, { displayName: 'Technical Routes' });
  const paths = getProjectPaths(root);
  await writeJsonlAll(paths.catalog.bins, [{
    id: 'bin-1',
    owner_type: 'global',
    owner_id: null,
    media_type: 'image',
    name: 'Images',
    created_at: now,
    updated_at: now,
  }]);
  await writeJsonlAll(paths.catalog.media, [{
    id: 'media-1',
    owner_type: 'global',
    owner_id: null,
    bin_id: 'bin-1',
    media_type: 'image',
    name: 'Hero',
    created_at: now,
    updated_at: now,
  }]);
  const invalid = TakeSchema.parse({
    id: 'take-invalid',
    media_id: 'media-1',
    take_number: 1,
    filename: 'invalid.png',
    path: 'global/image/invalid.png',
    format: 'png',
    size_bytes: 4,
    status: 'new',
    technical_status: 'invalid',
    technical_issues: [{
      code: 'transparency_missing',
      stage: 'delivery',
      message: 'Generated PNG is opaque',
    }],
    created_at: now,
    updated_at: now,
  });
  const valid = TakeSchema.parse({
    id: 'take-valid',
    media_id: 'media-1',
    take_number: 2,
    filename: 'valid.png',
    path: 'global/image/valid.png',
    format: 'png',
    size_bytes: 4,
    status: 'new',
    created_at: now,
    updated_at: now,
  });
  await writeJsonlAll(paths.catalog.takes, [invalid, valid], TakeSchema);

  const app = Fastify();
  apps.push(app);
  const context = () => ({ projectRoot: root, paths });
  registerTakeRoutes(app, context);
  registerMediaRoutes(app, context);
  return { app, paths };
}

describe('technical invalidity routes', () => {
  it('blocks approval and treats technical evidence as system-managed', async () => {
    const { app, paths } = await fixture();

    const approval = await app.inject({
      method: 'PUT',
      url: '/api/takes/take-invalid',
      payload: { status: 'approved' },
    });
    expect(approval.statusCode).toBe(409);
    expect(approval.json()).toMatchObject({
      error: 'Technically invalid takes cannot be approved',
      technical_issues: [{ code: 'transparency_missing' }],
    });

    const evidenceEdit = await app.inject({
      method: 'PUT',
      url: '/api/takes/take-invalid',
      payload: { technical_status: 'valid', technical_issues: [] },
    });
    expect(evidenceEdit.statusCode).toBe(400);

    const rejection = await app.inject({
      method: 'PUT',
      url: '/api/takes/take-invalid',
      payload: { status: 'rejected', review_note: 'Composition is unusable too' },
    });
    expect(rejection.statusCode).toBe(200);
    expect(rejection.json().take).toMatchObject({
      status: 'rejected',
      technical_status: 'invalid',
      review_note: 'Composition is unusable too',
    });

    const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);
    expect(takes.find(take => take.id === 'take-invalid')).toMatchObject({
      status: 'rejected',
      technical_status: 'invalid',
    });
  });

  it('blocks invalid selection while preserving the valid approval and selection path', async () => {
    const { app, paths } = await fixture();
    const takes = await readJsonl<Take>(paths.catalog.takes, TakeSchema);
    const invalid = takes.find(take => take.id === 'take-invalid')!;
    invalid.status = 'approved';
    await writeJsonlAll(paths.catalog.takes, takes, TakeSchema);

    const invalidSelection = await app.inject({
      method: 'PUT',
      url: '/api/media/media-1/selection',
      payload: { take_ids: ['take-invalid'] },
    });
    expect(invalidSelection.statusCode).toBe(400);
    expect(invalidSelection.json().error).toContain('technically valid');

    const approval = await app.inject({
      method: 'PUT',
      url: '/api/takes/take-valid',
      payload: { status: 'approved' },
    });
    expect(approval.statusCode).toBe(200);

    const validSelection = await app.inject({
      method: 'PUT',
      url: '/api/media/media-1/selection',
      payload: { take_ids: ['take-valid'] },
    });
    expect(validSelection.statusCode).toBe(200);
    expect(validSelection.json().media.selected_take_ids).toEqual(['take-valid']);
  });
});
