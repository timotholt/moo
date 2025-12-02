/**
 * View Engine - Generic grouping and view rendering for asset trees
 * 
 * Supports dynamic views that group assets by any metadata field.
 * Views are defined as a chain of "group by" operations.
 */

// ============================================================================
// Preset View Definitions
// ============================================================================

export const PRESET_VIEWS = {
  'by-status': {
    id: 'by-status',
    name: 'By Status',
    description: 'Group by approval status',
    levels: [
      { field: 'status', icon: 'status', labelMap: {
        'approved': 'Approved',
        'new': 'New',
        'rejected': 'Rejected',
        'hidden': 'Hidden',
      }},
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content' },
    ]
  },
  'by-type': {
    id: 'by-type',
    name: 'By Type',
    description: 'Group by content type (dialogue, music, sfx)',
    levels: [
      { field: 'content_type', icon: 'type', labelMap: {
        'dialogue': 'Dialogue',
        'music': 'Music',
        'sfx': 'Sound Effects',
      }},
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'section_id', displayField: 'section_name', icon: 'folder' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content' },
    ]
  },
  'by-section': {
    id: 'by-section',
    name: 'By Section',
    description: 'Group by section first',
    levels: [
      { field: 'section_id', displayField: 'section_name', icon: 'folder' },
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content' },
    ]
  },
  'by-scene': {
    id: 'by-scene',
    name: 'By Scene',
    description: 'Group by scene (Act 1, Act 2, etc.)',
    levels: [
      { field: 'scene_id', displayField: 'scene_name', icon: 'folder' },
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'section_id', displayField: 'section_name', icon: 'folder' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content' },
    ]
  },
  'flat': {
    id: 'flat',
    name: 'All Cues',
    description: 'Flat list of all cues',
    levels: [
      { field: 'content_id', displayField: 'cue_id', icon: 'content' },
    ]
  },
};

// ============================================================================
// Asset Index Builder
// ============================================================================

/**
 * Build a denormalized index of all assets (takes) with all related metadata.
 * This flattens the hierarchy so we can group by any field.
 * 
 * @param {Array} actors - Actor records
 * @param {Array} sections - Section records
 * @param {Array} content - Content/cue records
 * @param {Array} takes - Take records
 * @param {Array} scenes - Scene records (optional)
 * @returns {Array} Denormalized asset records
 */
export function buildAssetIndex(actors, sections, content, takes, scenes = []) {
  const actorsById = new Map(actors.map(a => [a.id, a]));
  const sectionsById = new Map(sections.map(s => [s.id, s]));
  const contentById = new Map(content.map(c => [c.id, c]));
  const scenesById = new Map(scenes.map(sc => [sc.id, sc]));
  
  return takes.map(take => {
    const c = contentById.get(take.content_id);
    const s = c ? sectionsById.get(c.section_id) : null;
    const a = c ? actorsById.get(c.actor_id) : null;
    const sc = s?.scene_id ? scenesById.get(s.scene_id) : null;
    
    return {
      // Take fields
      id: take.id,
      take_id: take.id,
      take_number: take.take_number,
      status: take.status || 'new',
      filename: take.filename,
      path: take.path,
      duration_sec: take.duration_sec,
      generated_by: take.generated_by,
      created_at: take.created_at,
      updated_at: take.updated_at,
      
      // Content fields
      content_id: take.content_id,
      cue_id: c?.cue_id || 'unknown',
      prompt: c?.prompt,
      content_type: c?.content_type || 'unknown',
      
      // Section fields
      section_id: c?.section_id,
      section_name: s?.name || 'Unknown Section',
      
      // Scene fields (optional - may be null/undefined)
      scene_id: s?.scene_id || null,
      scene_name: sc?.name || null,
      
      // Actor fields
      actor_id: c?.actor_id,
      actor_name: a?.display_name || 'Unknown Actor',
      
      // Original records for reference
      _take: take,
      _content: c,
      _section: s,
      _actor: a,
      _scene: sc,
    };
  });
}

/**
 * Build an index of content items (for views that don't need takes).
 * 
 * @param {Array} actors - Actor records
 * @param {Array} sections - Section records  
 * @param {Array} content - Content/cue records
 * @returns {Array} Denormalized content records
 */
export function buildContentIndex(actors, sections, content) {
  const actorsById = new Map(actors.map(a => [a.id, a]));
  const sectionsById = new Map(sections.map(s => [s.id, s]));
  
  return content.map(c => {
    const s = sectionsById.get(c.section_id);
    const a = actorsById.get(c.actor_id);
    
    return {
      id: c.id,
      content_id: c.id,
      cue_id: c.cue_id || 'unknown',
      prompt: c.prompt,
      content_type: c.content_type || 'unknown',
      section_id: c.section_id,
      section_name: s?.name || 'Unknown Section',
      actor_id: c.actor_id,
      actor_name: a?.display_name || 'Unknown Actor',
      complete: c.complete || c.all_approved,
      
      _content: c,
      _section: s,
      _actor: a,
    };
  });
}

// ============================================================================
// Grouping Engine
// ============================================================================

/**
 * Group items by a view's level definitions.
 * Returns a tree structure suitable for rendering.
 * 
 * @param {Array} items - Denormalized asset records
 * @param {Array} levels - View level definitions
 * @param {number} depth - Current depth (internal)
 * @returns {Array} Tree nodes
 */
export function groupByLevels(items, levels, depth = 0) {
  if (!items || items.length === 0) {
    return [];
  }
  
  // If we've exhausted all levels, return items as leaves
  if (depth >= levels.length) {
    return items.map(item => ({
      type: 'leaf',
      id: item.id,
      label: item.filename || `Take ${item.take_number}`,
      data: item,
    }));
  }
  
  const level = levels[depth];
  const groups = new Map();
  
  // Special key for items missing this field
  const UNASSIGNED_KEY = '__unassigned__';
  
  // Group items by the current level's field
  for (const item of items) {
    const rawValue = item[level.field];
    // Treat null, undefined, empty string as "unassigned"
    const key = (rawValue === null || rawValue === undefined || rawValue === '') 
      ? UNASSIGNED_KEY 
      : String(rawValue);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  
  // Convert groups to tree nodes
  const nodes = [];
  for (const [key, children] of groups) {
    // Determine display label
    let label = key;
    if (key === UNASSIGNED_KEY) {
      label = 'Unassigned';
    } else if (level.labelMap && level.labelMap[key]) {
      label = level.labelMap[key];
    } else if (level.displayField && children[0]) {
      label = children[0][level.displayField] || key;
    }
    
    // Recursively group children
    const childNodes = groupByLevels(children, levels, depth + 1);
    
    // Calculate aggregate status for this group
    const statuses = children.map(c => c.status);
    const hasApproved = statuses.includes('approved');
    const hasNew = statuses.includes('new');
    const hasRejected = statuses.includes('rejected');
    
    let groupStatus = 'gray';
    if (hasRejected || (hasNew && !hasApproved)) groupStatus = 'red';
    else if (hasNew && hasApproved) groupStatus = 'yellow';
    else if (hasApproved) groupStatus = 'green';
    
    nodes.push({
      type: 'group',
      id: `${level.field}:${key}`,
      field: level.field,
      fieldValue: key,
      label,
      icon: level.icon,
      status: groupStatus,
      count: children.length,
      children: childNodes,
      depth,
    });
  }
  
  // Sort nodes alphabetically by label
  nodes.sort((a, b) => {
    // Special sort for status: approved, new, rejected, hidden
    if (level.field === 'status') {
      const order = { approved: 0, new: 1, rejected: 2, hidden: 3 };
      return (order[a.fieldValue] ?? 99) - (order[b.fieldValue] ?? 99);
    }
    return String(a.label).localeCompare(String(b.label));
  });
  
  return nodes;
}

// ============================================================================
// View Utilities
// ============================================================================

/**
 * Get a view definition by ID.
 * 
 * @param {string} viewId - View ID
 * @param {Array} customViews - User-defined views (optional)
 * @returns {Object|null} View definition
 */
export function getViewById(viewId, customViews = []) {
  // Check presets first
  if (PRESET_VIEWS[viewId]) {
    return PRESET_VIEWS[viewId];
  }
  
  // Check custom views
  return customViews.find(v => v.id === viewId) || null;
}

/**
 * Get all available views (presets + custom).
 * 
 * @param {Array} customViews - User-defined views
 * @returns {Array} All view definitions
 */
export function getAllViews(customViews = []) {
  return [
    ...Object.values(PRESET_VIEWS),
    ...customViews,
  ];
}

/**
 * Build a tree for a specific view.
 * 
 * @param {string} viewId - View ID
 * @param {Object} data - { actors, sections, content, takes }
 * @param {Array} customViews - User-defined views
 * @returns {Array} Tree nodes
 */
export function buildViewTree(viewId, data, customViews = []) {
  const view = getViewById(viewId, customViews);
  if (!view) {
    console.warn(`View not found: ${viewId}`);
    return [];
  }
  
  const { actors = [], sections = [], content = [], takes = [] } = data;
  
  // Build denormalized index
  const assets = buildAssetIndex(actors, sections, content, takes);
  
  // Group by view levels
  return groupByLevels(assets, view.levels);
}

/**
 * Find a node in the tree by its selection path.
 * 
 * @param {Array} tree - Tree nodes
 * @param {Object} selection - { type, id }
 * @returns {Object|null} Found node
 */
export function findNodeInTree(tree, selection) {
  for (const node of tree) {
    if (node.type === 'leaf' && node.id === selection.id) {
      return node;
    }
    if (node.type === 'group' && node.id === `${selection.type}:${selection.id}`) {
      return node;
    }
    if (node.children) {
      const found = findNodeInTree(node.children, selection);
      if (found) return found;
    }
  }
  return null;
}
