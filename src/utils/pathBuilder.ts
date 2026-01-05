/**
 * Utility for building hierarchical display paths for logging and undo messages
 * e.g., "actor → John → dialogue → hello"
 * e.g., "scene → intro → music → background"
 */

import type { OwnerType } from '../shared/schemas/index.js';

export interface PathContext {
  actors?: Array<{ id: string; display_name: string }>;
  scenes?: Array<{ id: string; name: string }>;
  bins?: Array<{ id: string; owner_id: string | null; owner_type: OwnerType; name?: string; media_type: string }>;
}

/**
 * Get display name for an owner
 */
export function getOwnerDisplayName(
  ownerType: OwnerType,
  ownerId: string | null,
  ctx: PathContext
): string {
  if (ownerType === 'global') return 'global';
  if (ownerType === 'actor') {
    return ctx.actors?.find(a => a.id === ownerId)?.display_name || 'unknown actor';
  }
  if (ownerType === 'scene') {
    return ctx.scenes?.find(s => s.id === ownerId)?.name || 'unknown scene';
  }
  return 'unknown';
}

/**
 * Build a display path for an actor
 */
export function buildActorPath(actorName: string): string {
  return `actor → ${actorName}`;
}

/**
 * Build a display path for a scene
 */
export function buildScenePath(sceneName: string): string {
  return `scene → ${sceneName}`;
}

/**
 * Build a display path for a bin
 */
export function buildBinPath(
  ownerType: OwnerType,
  ownerId: string | null,
  binName: string,
  ctx: PathContext
): string {
  const ownerName = getOwnerDisplayName(ownerType, ownerId, ctx);
  return `${ownerType} → ${ownerName} → ${binName}`;
}

/**
 * Build a display path for media (cue/clip/image/track)
 */
export function buildMediaPath(
  ownerType: OwnerType,
  ownerId: string | null,
  binId: string,
  mediaName: string,
  ctx: PathContext
): string {
  const ownerName = getOwnerDisplayName(ownerType, ownerId, ctx);
  const bin = ctx.bins?.find(b => b.id === binId);
  const binName = bin?.name || bin?.media_type || 'unknown bin';
  return `${ownerType} → ${ownerName} → ${binName} → ${mediaName}`;
}
