export const MAX_BULK_REVIEW_TAKES = 25;

export function isTypingTarget(target) {
    if (!target || typeof target !== 'object') return false;
    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'input'
        || tagName === 'textarea'
        || tagName === 'select'
        || target.isContentEditable === true;
}

export function shouldIgnoreReviewShortcut(target) {
    if (isTypingTarget(target)) return true;
    if (!target || typeof target !== 'object') return false;
    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'button'
        || tagName === 'a'
        || tagName === 'audio'
        || tagName === 'video'
        || target.getAttribute?.('role') === 'button';
}

export function boundedVisibleSelection(selectedIds, visibleTakes, limit = MAX_BULK_REVIEW_TAKES) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    return (visibleTakes || [])
        .filter((take) => selected.has(take.id))
        .slice(0, Math.max(0, limit));
}

export function moveWithinBounds(currentIndex, itemCount, delta) {
    if (itemCount <= 0) return 0;
    return Math.max(0, Math.min(itemCount - 1, currentIndex + delta));
}
