/**
 * View Engine - Generic grouping and view rendering for asset trees
 */

import { ASSET_TYPES, getAssetTypeForContent, getFileIcon } from './assetTypes.js';

// Available dimensions for custom views
export const DIMENSIONS = [
  { id: 'actor_id', name: 'Actor', icon: 'person', displayField: 'actor_name' },
  { id: 'scene_id', name: 'Scene', icon: 'folder', displayField: 'scene_name' },
  { id: 'section_id', name: 'Section', icon: 'folder', displayField: 'section_name' },
  { id: 'content_type', name: 'Type', icon: 'type', labelMap: { dialogue: 'Dialogue', music: 'Music', sfx: 'SFX' } },
  { id: 'status', name: 'Status', icon: 'status' },
  { id: 'content_id', name: 'Cue', icon: 'content', displayField: 'cue_id', isTerminal: true },
];

export function getStickyName(view) {
  if (view.name && view.name.trim() !== '') return view.name;
  if (!view.levels || view.levels.length === 0) return 'new view';
  const firstLevel = view.levels[0];
  const dim = DIMENSIONS.find(d => d.id === firstLevel.field);
  return `by ${dim ? dim.name.toLowerCase() : firstLevel.field}`;
}

// ============================================================================
// Preset View Definitions (Now serving as initial templates)
// ============================================================================

export const PRESET_VIEWS = {
  'by-actor': {
    id: 'by-actor',
    name: '', // Sticky: by actor
    category: 'view',
    levels: [
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'section_id', displayField: 'section_name', icon: 'folder' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content', isTerminal: true },
    ]
  },
  'by-scene': {
    id: 'by-scene',
    name: '', // Sticky: by scene
    category: 'view',
    levels: [
      { field: 'scene_id', displayField: 'scene_name', icon: 'folder' },
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'section_id', displayField: 'section_name', icon: 'folder' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content', isTerminal: true },
    ]
  },
  'unapproved': {
    id: 'unapproved',
    name: 'unapproved',
    category: 'summary',
    filter: (asset) => asset.status !== 'approved',
    levels: [
      { field: 'status', icon: 'status', labelMap: {
        'new': 'New',
        'rejected': 'Rejected',
        'hidden': 'Hidden',
        '__none__': 'No Takes'
      }},
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content', isTerminal: true },
    ]
  },
  'missing-audio': {
    id: 'missing-audio',
    name: 'missing audio',
    category: 'summary',
    filter: (asset) => !asset.take_id,
    levels: [
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'content_id', displayField: 'cue_id', icon: 'content', isTerminal: true },
    ]
  }
};

// ============================================================================
// Asset Index Builder
// ============================================================================

export function buildAssetIndex(actors, sections, content, takes, scenes = []) {
  const actorsById = new Map(actors.map(a => [a.id, a]));
  const sectionsById = new Map(sections.map(s => [s.id, s]));
  const scenesById = new Map(scenes.map(sc => [sc.id, sc]));
  
  const takesByContentId = new Map();
  for (const take of takes) {
    if (!takesByContentId.has(take.content_id)) takesByContentId.set(take.content_id, []);
    takesByContentId.get(take.content_id).push(take);
  }

  const index = [];

  for (const c of content) {
    const s = sectionsById.get(c.section_id);
    const a = actorsById.get(c.actor_id);
    const sc = s?.scene_id ? scenesById.get(s.scene_id) : null;
    const contentTakes = takesByContentId.get(c.id) || [];

    const baseRecord = {
      content_id: c.id,
      cue_id: c.cue_id || 'unknown',
      prompt: c.prompt,
      content_type: c.content_type || 'unknown',
      section_id: c.section_id,
      section_name: s?.name || 'Unknown Section',
      scene_id: s?.scene_id || null,
      scene_name: sc?.name || null,
      actor_id: c.actor_id,
      actor_name: a?.display_name || 'Unknown Actor',
      asset_type: getAssetTypeForContent(c.content_type)?.id || 'audio',
      leaf_type: getAssetTypeForContent(c.content_type)?.leafType || 'take',
      _content: c,
      _section: s,
      _actor: a,
      _scene: sc,
    };

    if (contentTakes.length === 0) {
      index.push({
        ...baseRecord,
        id: `content-${c.id}`,
        take_id: null,
        status: '__none__',
      });
    } else {
      for (const take of contentTakes) {
        index.push({
          ...baseRecord,
          id: take.id,
          take_id: take.id,
          take_number: take.take_number,
          status: take.status || 'new',
          filename: take.filename,
          path: take.path,
          duration_sec: take.duration_sec,
          _take: take,
        });
      }
    }
  }
  
  return index;
}

// ============================================================================
// Grouping Engine
// ============================================================================

export function groupByLevels(items, levels, depth = 0) {
  if (!items || items.length === 0) return [];
  
  if (depth >= levels.length) {
    return items.map(item => {
      const assetType = ASSET_TYPES[item.asset_type] || ASSET_TYPES.audio;
      let label = item.filename;
      if (!label) {
        if (item.take_id) label = `${assetType.leafType} ${item.take_number || item.id}`;
        else label = `(no ${assetType.leafType}s)`;
      }
      return {
        type: 'leaf',
        id: item.id,
        label,
        leafType: item.leaf_type || 'take',
        assetType: item.asset_type || 'audio',
        fileIcon: getFileIcon(item.filename || ''),
        data: item,
      };
    });
  }
  
  const level = levels[depth];
  const groups = new Map();
  const UNASSIGNED_KEY = '__unassigned__';
  
  for (const item of items) {
    const rawValue = item[level.field];
    const key = (rawValue === null || rawValue === undefined || rawValue === '') ? UNASSIGNED_KEY : String(rawValue);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  
  const nodes = [];
  for (const [key, children] of groups) {
    let label = key;
    if (key === UNASSIGNED_KEY) label = `Unknown ${level.field.replace('_id', '')}`;
    else if (level.labelMap && level.labelMap[key]) label = level.labelMap[key];
    else if (level.displayField && children[0]) label = children[0][level.displayField] || key;
    
    const childNodes = groupByLevels(children, levels, depth + 1);
    const statuses = children.map(c => c.status).filter(s => s !== '__none__');
    let groupStatus = 'gray';
    
    if (statuses.length > 0) {
      const hasApproved = statuses.includes('approved');
      const hasNew = statuses.includes('new');
      const hasRejected = statuses.includes('rejected');
      
      if (hasRejected || (hasNew && !hasApproved)) groupStatus = 'red';
      else if (hasNew && hasApproved) groupStatus = 'yellow';
      else if (hasApproved) groupStatus = 'green';
    }
    
    nodes.push({
      type: 'group',
      id: `${level.field}:${key}`,
      field: level.field,
      fieldValue: key,
      label,
      icon: level.icon,
      status: groupStatus,
      count: children.filter(c => c.take_id).length || null,
      children: childNodes,
      depth,
    });
  }
  
  nodes.sort((a, b) => {
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

export function getViewById(viewId, customViews = []) {
  return customViews.find(v => v.id === viewId) || PRESET_VIEWS[viewId] || null;
}

export function getAllViews(customViews = []) {
  // If no custom views yet, we could seed from presets.
  // For now, we mix them.
  const seenIds = new Set(customViews.map(v => v.id));
  const combined = [...customViews];
  for (const p of Object.values(PRESET_VIEWS)) {
    if (!seenIds.has(p.id)) combined.push(p);
  }
  return combined;
}

export function buildViewTree(viewId, data, customViews = []) {
  const view = getViewById(viewId, customViews);
  if (!view) return [];
  const { actors = [], sections = [], content = [], takes = [], scenes = [] } = data;
  let assets = buildAssetIndex(actors, sections, content, takes, scenes);
  if (view.filter && typeof view.filter === 'function') assets = assets.filter(view.filter);
  return groupByLevels(assets, view.levels);
}
