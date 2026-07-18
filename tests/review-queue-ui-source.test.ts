import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  boundedVisibleSelection,
  isTypingTarget,
  MAX_BULK_REVIEW_TAKES,
  moveWithinBounds,
  shouldIgnoreReviewShortcut,
} from '../src/ui-solid/components/review/reviewQueueModel.js';

const root = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

describe('unified multimedia review workspace', () => {
  it('renders image and video with TakePreview while preserving native audio playback', () => {
    const reviewQueue = source('src/ui-solid/components/ReviewQueue.jsx');

    expect(reviewQueue).toContain("import TakePreview, { mediaUrlForPath } from './TakePreview.jsx'");
    expect(reviewQueue).toContain("<TakePreview take={take()} mediaType={entry().media.media_type} />");
    expect(reviewQueue).toContain('<audio');
    expect(reviewQueue).toContain('src={mediaUrlForPath(take().path)}');
    expect(reviewQueue).toContain('Audio take:');
    expect(reviewQueue).toContain('Loading audio preview');
    expect(reviewQueue).toContain('Could not load audio preview');
  });

  it('uses only existing take and media endpoints for review decisions and early finish', () => {
    const reviewQueue = source('src/ui-solid/components/ReviewQueue.jsx');

    expect(reviewQueue).toContain('getReviewQueue, getTakes, updateMedia, updateTake');
    expect(reviewQueue).toContain("updateTake(take.id, { status: nextStatus })");
    expect(reviewQueue).toContain("updateMedia(entry.media.id, { completion_override: true })");
    expect(reviewQueue).not.toContain('fetch(');
  });

  it('exposes truthful state, metadata, errors, and bounded bulk controls', () => {
    const reviewQueue = source('src/ui-solid/components/ReviewQueue.jsx');

    expect(reviewQueue).toContain('Selected deliverable');
    expect(reviewQueue).toContain('Not selected for export');
    expect(reviewQueue).toContain('Review take metadata');
    expect(reviewQueue).toContain('Provider:');
    expect(reviewQueue).toContain('Approve valid selected');
    expect(reviewQueue).toContain('Reject selected');
    expect(reviewQueue).toContain('Maximum {MAX_BULK_REVIEW_TAKES} visible takes');
    expect(reviewQueue).toContain('<Alert severity="error"');
    expect(reviewQueue).toContain('Saving review decision');
    expect(reviewQueue).toContain('Technically invalid');
    expect(reviewQueue).toContain("take().technical_status === 'invalid'");
    expect(reviewQueue).toContain('selectedApprovableTakes');
  });

  it('recognizes typing targets so review hotkeys do not fire while editing', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);

    const reviewQueue = source('src/ui-solid/components/ReviewQueue.jsx');
    expect(reviewQueue).toContain('if (shouldIgnoreReviewShortcut(event.target)');
  });

  it('leaves playback and focused controls in charge of their own keyboard events', () => {
    expect(shouldIgnoreReviewShortcut({ tagName: 'AUDIO' })).toBe(true);
    expect(shouldIgnoreReviewShortcut({ tagName: 'VIDEO' })).toBe(true);
    expect(shouldIgnoreReviewShortcut({ tagName: 'BUTTON' })).toBe(true);
    expect(shouldIgnoreReviewShortcut({ tagName: 'DIV', getAttribute: () => 'button' })).toBe(true);
    expect(shouldIgnoreReviewShortcut({ tagName: 'DIV', getAttribute: () => null })).toBe(false);
  });

  it('limits bulk decisions to selected takes that are visible in the active cue', () => {
    const visible = Array.from({ length: MAX_BULK_REVIEW_TAKES + 5 }, (_, index) => ({
      id: `visible-${index}`,
    }));
    const selected = new Set([
      'not-visible',
      ...visible.map((take) => take.id),
    ]);

    expect(boundedVisibleSelection(selected, visible)).toEqual(visible.slice(0, MAX_BULK_REVIEW_TAKES));
    expect(boundedVisibleSelection(new Set(['not-visible']), visible)).toEqual([]);
  });

  it('keeps keyboard navigation inside the current visible range', () => {
    expect(moveWithinBounds(0, 3, -1)).toBe(0);
    expect(moveWithinBounds(1, 3, 1)).toBe(2);
    expect(moveWithinBounds(2, 3, 1)).toBe(2);
    expect(moveWithinBounds(2, 0, 1)).toBe(0);
  });
});
