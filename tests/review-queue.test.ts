import { describe, expect, it } from 'vitest';
import { buildReviewQueue } from '../src/services/review-queue.js';
import type { Media, Take } from '../src/types/index.js';

const cue = (id: string, name: string, extra: Partial<Media> = {}): Media => ({
  id, name, owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'sfx',
  all_approved: false, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z', ...extra,
});
const take = (id: string, mediaId: string, status: Take['status']): Take => ({
  id, media_id: mediaId, take_number: 1, filename: `${id}.wav`, path: `global/${id}.wav`, format: 'wav', size_bytes: 1,
  status, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
});

describe('buildReviewQueue', () => {
  it('prioritizes undecided takes and excludes finished cues, including early finishes', () => {
    const draft = cue('draft', 'Draft');
    const review = cue('review', 'Review');
    const regenerate = cue('regenerate', 'Regenerate');
    const complete = cue('complete', 'Complete');
    const early = cue('early', 'Early', { completion_override: true });
    const items = buildReviewQueue(
      { actors: [], scenes: [], bins: [{ id: 'bin-1', name: 'SFX', owner_type: 'global', owner_id: null, media_type: 'sfx', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' }], media: [draft, review, regenerate, complete, early] },
      [take('new', review.id, 'new'), take('rejected', regenerate.id, 'rejected'), take('approved', complete.id, 'approved'), take('early-approved', early.id, 'approved')],
      null,
    );
    expect(items.map((item) => [item.media.id, item.kind])).toEqual([
      ['review', 'ready_for_review'],
      ['regenerate', 'needs_generation'],
      ['draft', 'not_generated'],
    ]);
  });
});
