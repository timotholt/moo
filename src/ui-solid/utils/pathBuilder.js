/**
 * Utility for building hierarchical display paths for logging
 * e.g., "actor → Tim → Dialogue → hello"
 */

/**
 * Build a display path for an owner (Actor, Scene, or Global)
 */
export function buildOwnerPath(ownerType, ownerName) {
  if (ownerType === 'global') return 'global';
  return `${ownerType} → ${ownerName || 'unknown'}`;
}

/**
 * Build a display path for a bin
 */
export function buildBinPath(ownerType, ownerName, binName) {
  return `${buildOwnerPath(ownerType, ownerName)} → ${binName}`;
}

/**
 * Build a display path for media/cue
 */
export function buildMediaPath(ownerType, ownerId, binId, mediaName, data) {
  const { actors = [], scenes = [], bins = [] } = data || {};
  const ownerName = getOwnerName(ownerType, ownerId, actors, scenes);
  const binName = getBinName(binId, bins);
  return `${buildBinPath(ownerType, ownerName, binName)} → ${mediaName}`;
}

/**
 * Lookup owner name by ID and Type
 */
export function getOwnerName(ownerType, ownerId, actors, scenes) {
  if (ownerType === 'global') return 'Global';
  if (ownerType === 'actor') {
    return actors?.find(a => a.id === ownerId)?.display_name || 'Unknown';
  }
  if (ownerType === 'scene') {
    return scenes?.find(s => s.id === ownerId)?.name || 'Unknown';
  }
  return 'Unknown';
}

/**
 * Lookup bin name by ID
 */
export function getBinName(binId, bins) {
  const bin = bins?.find(b => b.id === binId);
  return bin?.name || bin?.media_type || 'Unknown';
}
