import { describe, expect, it } from 'vitest';

import { TakeSchema } from '../src/shared/schemas/take.schema.js';

const now = '2026-07-17T00:00:00.000Z';

describe('take technical validity schema', () => {
  it('defaults existing valid candidates safely without migration machinery', () => {
    const take = TakeSchema.parse({
      id: 'take-1',
      media_id: 'media-1',
      take_number: 1,
      filename: 'take.mp3',
      path: 'global/sfx/take.mp3',
      format: 'mp3',
      size_bytes: 3,
      status: 'new',
      created_at: now,
      updated_at: now,
    });

    expect(take).toMatchObject({
      technical_status: 'valid',
      technical_issues: [],
    });
  });

  it('accepts structured invalidity independently of human review status', () => {
    const take = TakeSchema.parse({
      id: 'take-1',
      media_id: 'media-1',
      take_number: 1,
      filename: 'take.png',
      path: 'global/image/take.png',
      format: 'png',
      size_bytes: 3,
      status: 'rejected',
      technical_status: 'invalid',
      technical_issues: [{
        code: 'inspection_failed',
        stage: 'inspection',
        message: 'Invalid PNG signature',
      }],
      created_at: now,
      updated_at: now,
    });

    expect(take.status).toBe('rejected');
    expect(take.technical_status).toBe('invalid');
  });
});
