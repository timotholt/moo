/**
 * Utility for building hierarchical display paths for logging and undo messages
 * e.g., "Actors → Tim → Dialogue → hello"
 */

export interface PathContext {
  actors?: Array<{ id: string; display_name: string }>;
  sections?: Array<{ id: string; actor_id: string; name?: string; content_type: string }>;
}

/**
 * Build a display path for an actor
 */
export function buildActorPath(actorName: string): string {
  return `actor → ${actorName}`;
}

/**
 * Build a display path for a section
 */
export function buildSectionPath(
  actorId: string,
  sectionName: string,
  ctx: PathContext
): string {
  const actor = ctx.actors?.find(a => a.id === actorId);
  const actorName = actor?.display_name || 'Unknown';
  return `actor → ${actorName} → ${sectionName}`;
}

/**
 * Build a display path for content/cue
 */
export function buildContentPath(
  actorId: string,
  sectionId: string,
  cueName: string,
  ctx: PathContext
): string {
  const actor = ctx.actors?.find(a => a.id === actorId);
  const section = ctx.sections?.find(s => s.id === sectionId);
  const actorName = actor?.display_name || 'Unknown';
  const sectionName = section?.name || section?.content_type || 'Unknown';
  return `actor → ${actorName} → ${sectionName} → ${cueName}`;
}

/**
 * Build a rename path showing old → new
 */
export function buildRenamePath(basePath: string, oldName: string, newName: string): string {
  return `${basePath} → ${oldName} → ${newName}`;
}

/**
 * Lookup helpers for common patterns
 */
export function getActorName(actorId: string, ctx: PathContext): string {
  return ctx.actors?.find(a => a.id === actorId)?.display_name || 'Unknown';
}

export function getSectionName(sectionId: string, ctx: PathContext): string {
  const section = ctx.sections?.find(s => s.id === sectionId);
  return section?.name || section?.content_type || 'Unknown';
}
