import { describe, expect, it } from 'vitest';
import { calculateCueLifecycle } from '../src/services/cue-lifecycle.js';
import type { Media, Take } from '../src/types/index.js';

const media: Media = {
  id: 'cue-1',
  owner_type: 'global',
  owner_id: null,
  bin_id: 'bin-1',
  media_type: 'sfx',
  name: 'rifle fire',
  all_approved: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

function take(id: string, status: Take['status']): Take {
  return {
    id,
    media_id: media.id,
    take_number: 1,
    filename: `${id}.wav`,
    path: `global/${id}.wav`,
    format: 'wav',
    size_bytes: 1,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('calculateCueLifecycle', () => {
  it('starts as draft without takes', () => {
    expect(calculateCueLifecycle(media, [], 2)).toMatchObject({
      status: 'draft',
      approval_target: 2,
      is_complete: false,
    });
  });

  it('requires the configured number of approved takes', () => {
    const lifecycle = calculateCueLifecycle(media, [take('take-1', 'approved'), take('take-2', 'new')], 2);
    expect(lifecycle).toMatchObject({
      status: 'review_needed',
      approved_take_count: 1,
      new_take_count: 1,
      is_complete: false,
    });
  });

  it('becomes approved when the target is met', () => {
    const lifecycle = calculateCueLifecycle(media, [take('take-1', 'approved'), take('take-2', 'approved')], 2);
    expect(lifecycle).toMatchObject({
      status: 'approved',
      approved_take_count: 2,
      is_complete: true,
    });
  });
});
