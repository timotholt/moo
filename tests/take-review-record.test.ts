import { describe, expect, it } from 'vitest';
import { TakeSchema } from '../src/shared/schemas/index.js';

describe('take review record', () => {
  it('persists a review note and timestamp alongside a decision', () => {
    const take = TakeSchema.parse({
      id: 'take-1', media_id: 'cue-1', take_number: 1,
      filename: 'take-1.wav', path: 'global/take-1.wav', format: 'wav', size_bytes: 1,
      status: 'rejected', status_changed_at: '2026-07-10T00:00:00.000Z',
      review_note: 'Too bright for an indoor rifle tail.',
      reviewed_at: '2026-07-10T00:00:00.000Z',
      created_at: '2026-07-10T00:00:00.000Z', updated_at: '2026-07-10T00:00:00.000Z',
    });
    expect(take.review_note).toBe('Too bright for an indoor rifle tail.');
    expect(take.reviewed_at).toBe('2026-07-10T00:00:00.000Z');
  });
});
