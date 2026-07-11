import type { Media, Take } from '../types/index.js';

export type CueLifecycleStatus = 'draft' | 'review_needed' | 'approved';

export interface CueLifecycle {
  status: CueLifecycleStatus;
  approval_target: number;
  take_count: number;
  new_take_count: number;
  approved_take_count: number;
  rejected_take_count: number;
  hidden_take_count: number;
  approved_take_ids: string[];
  selected_take_ids: string[];
  is_complete: boolean;
  is_overridden: boolean;
}

/**
 * Derive a cue's authoring state from its takes and approval policy.
 *
 * This is intentionally read-only: it is the replacement truth model for the
 * legacy, manually-edited `all_approved` flag. Publishing is added when the
 * release model and explicit selected take fields are introduced.
 */
export function calculateCueLifecycle(
  media: Media,
  takes: Take[],
  approvalTarget: number,
): CueLifecycle {
  const cueTakes = takes.filter((take) => take.media_id === media.id);
  const approvedTakes = cueTakes.filter((take) => take.status === 'approved');
  const mediaWithSelection = media as unknown as { selected_take_ids?: unknown };
  const selectedTakeIds = Array.isArray(mediaWithSelection.selected_take_ids)
    ? mediaWithSelection.selected_take_ids.filter((id): id is string => typeof id === 'string')
    : [];
  const normalizedTarget = Math.max(1, approvalTarget);
  const isOverridden = (media as { completion_override?: boolean }).completion_override === true
    && approvedTakes.length > 0;
  const isComplete = isOverridden || approvedTakes.length >= normalizedTarget;

  return {
    status: cueTakes.length === 0 ? 'draft' : isComplete ? 'approved' : 'review_needed',
    approval_target: normalizedTarget,
    take_count: cueTakes.length,
    new_take_count: cueTakes.filter((take) => take.status === 'new').length,
    approved_take_count: approvedTakes.length,
    rejected_take_count: cueTakes.filter((take) => take.status === 'rejected').length,
    hidden_take_count: cueTakes.filter((take) => take.status === 'hidden').length,
    approved_take_ids: approvedTakes.map((take) => take.id),
    selected_take_ids: selectedTakeIds,
    is_complete: isComplete,
    is_overridden: isOverridden,
  };
}
