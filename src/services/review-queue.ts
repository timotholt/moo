import type { Actor, Bin, Card, Defaults, Media, Scene, Take } from '../types/index.js';
import { calculateCueLifecycle, type CueLifecycle } from './cue-lifecycle.js';
import { resolveDefaultBlock } from '../utils/defaultBlockResolver.js';

export type ReviewQueueKind = 'ready_for_review' | 'needs_generation' | 'not_generated';

export interface ReviewQueueItem {
  media: Media;
  lifecycle: CueLifecycle;
  kind: ReviewQueueKind;
  owner_name: string | null;
  bin_name: string | null;
}

export interface ReviewQueueCatalog {
  actors: Actor[];
  cards?: Card[];
  scenes: Scene[];
  bins: Bin[];
  media: Media[];
}

/**
 * Build the author's attention queue from canonical cue lifecycle state.
 *
 * Finished cues never appear here. Cues with undecided takes come first,
 * followed by cues which need another generation pass and then untouched cues.
 */
export function buildReviewQueue(
  catalog: ReviewQueueCatalog,
  takes: Take[],
  defaults: Defaults | null,
): ReviewQueueItem[] {
  const items: ReviewQueueItem[] = [];

  for (const media of catalog.media) {
    const bin = catalog.bins.find((candidate) => candidate.id === media.bin_id) ?? null;
    const owner = media.owner_type === 'actor'
      ? catalog.actors.find((candidate) => candidate.id === media.owner_id) ?? null
      : media.owner_type === 'scene'
        ? catalog.scenes.find((candidate) => candidate.id === media.owner_id) ?? null
        : media.owner_type === 'card'
          ? catalog.cards?.find((candidate) => candidate.id === media.owner_id) ?? null
        : null;
    const settings = resolveDefaultBlock(media.media_type, media, bin, owner, defaults).settings;
    const lifecycle = calculateCueLifecycle(media, takes, settings.approval_count_default ?? 1);

    if (lifecycle.is_complete) continue;

    const kind: ReviewQueueKind = lifecycle.new_take_count > 0
      ? 'ready_for_review'
      : lifecycle.take_count > 0
        ? 'needs_generation'
        : 'not_generated';
    items.push({
      media,
      lifecycle,
      kind,
      owner_name: owner ? ('display_name' in owner ? owner.display_name : owner.name) : null,
      bin_name: bin?.name ?? null,
    });
  }

  const priority: Record<ReviewQueueKind, number> = {
    ready_for_review: 0,
    needs_generation: 1,
    not_generated: 2,
  };
  return items.sort((a, b) => priority[a.kind] - priority[b.kind]
    || a.media.name.localeCompare(b.media.name));
}
