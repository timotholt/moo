/**
 * Utility for building hierarchical display paths for logging
 * e.g., "Actors → Tim → Dialogue → hello"
 */

/**
 * Build a display path for an actor
 * @param {string} actorName
 * @returns {string}
 */
export function buildActorPath(actorName) {
  return `actor → ${actorName}`;
}

/**
 * Build a display path for a section
 * @param {string} actorName
 * @param {string} sectionName
 * @returns {string}
 */
export function buildSectionPath(actorName, sectionName) {
  return `actor → ${actorName} → ${sectionName}`;
}

/**
 * Build a display path for content/cue
 * @param {string} actorName
 * @param {string} sectionName
 * @param {string} cueName
 * @returns {string}
 */
export function buildContentPath(actorName, sectionName, cueName) {
  return `actor → ${actorName} → ${sectionName} → ${cueName}`;
}

/**
 * Lookup actor name by ID
 * @param {string} actorId
 * @param {Array<{id: string, display_name: string}>} actors
 * @returns {string}
 */
export function getActorName(actorId, actors) {
  return actors?.find(a => a.id === actorId)?.display_name || 'Unknown';
}

/**
 * Lookup section name by ID
 * @param {string} sectionId
 * @param {Array<{id: string, name?: string, content_type: string}>} sections
 * @returns {string}
 */
export function getSectionName(sectionId, sections) {
  const section = sections?.find(s => s.id === sectionId);
  return section?.name || section?.content_type || 'Unknown';
}
