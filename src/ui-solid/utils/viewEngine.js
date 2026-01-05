/**
 * View Engine - Generic grouping and view rendering for asset trees
 */

import { ASSET_TYPES, getAssetTypeForContent, getFileIcon } from './assetTypes.js';

// Available dimensions for custom views
export const DIMENSIONS = [
  { id: 'owner_id', name: 'Owner', icon: 'person', displayField: 'owner_name' },
  { id: 'owner_type', name: 'Owner Type', icon: 'folder', labelMap: { actor: 'Actors', scene: 'Scenes', global: 'Global' } },
  { id: 'scene_id', name: 'Scene', icon: 'folder', displayField: 'scene_name' },
  { id: 'actor_id', name: 'Actor', icon: 'person', displayField: 'actor_name' },
  { id: 'bin_id', name: 'Media Bin', icon: 'folder', displayField: 'bin_name' },
  { id: 'media_type', name: 'Type', icon: 'type', labelMap: { dialogue: 'Dialogue', music: 'Music', sfx: 'SFX', image: 'Image', video: 'Video' } },
  { id: 'status', name: 'Status', icon: 'status' },
  { id: 'media_id', name: 'Media / Take', icon: 'content', displayField: 'name', isTerminal: true },
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
      { field: 'scene_id', displayField: 'scene_name', icon: 'folder' },
      { field: 'bin_id', displayField: 'bin_name', icon: 'folder' },
      { field: 'media_id', displayField: 'name', icon: 'content', isTerminal: true },
    ]
  },
  'by-scene': {
    id: 'by-scene',
    name: '', // Sticky: by scene
    category: 'view',
    levels: [
      { field: 'scene_id', displayField: 'scene_name', icon: 'folder' },
      { field: 'actor_id', displayField: 'actor_name', icon: 'person' },
      { field: 'bin_id', displayField: 'bin_name', icon: 'folder' },
      { field: 'media_id', displayField: 'name', icon: 'content', isTerminal: true },
    ]
  },
  'unapproved': {
    id: 'unapproved',
    name: 'unapproved',
    category: 'summary',
    filter: [{ field: 'status', op: 'ne', value: 'approved' }],
    levels: [
      { field: 'status', icon: 'status', labelMap: {
        'new': 'New',
        'rejected': 'Rejected',
        'hidden': 'Hidden',
        '__none__': 'No Takes'
      }},
      { field: 'owner_id', displayField: 'owner_name', icon: 'person' },
      { field: 'media_id', displayField: 'name', icon: 'content', isTerminal: true },
    ]
  }
};

// ============================================================================
// Asset Index Builder
// ============================================================================

export function buildAssetIndex(actors, bins, media, takes, scenes = []) {
  const actorsById = new Map(actors.map(a => [a.id, a]));
  const binsById = new Map(bins.map(s => [s.id, s]));
  const scenesById = new Map(scenes.map(sc => [sc.id, sc]));
  
  const takesByMediaId = new Map();
  for (const take of takes) {
    if (!takesByMediaId.has(take.media_id)) takesByMediaId.set(take.media_id, []);
    takesByMediaId.get(take.media_id).push(take);
  }

  const index = [];
  const seenActorIds = new Set();
  const seenSceneIds = new Set();

  // 1. Process Media
  for (const m of media) {
    const b = binsById.get(m.bin_id);
    
    // Resolve owner details
    let ownerName = 'Global';
    let actorId = null;
    let actorName = null;
    let sceneId = null;
    let sceneName = null;

    if (m.owner_type === 'actor') {
        const a = actorsById.get(m.owner_id);
        ownerName = a?.display_name || 'Unknown Actor';
        actorId = m.owner_id;
        actorName = ownerName;
        if (actorId) seenActorIds.add(actorId);
    } else if (m.owner_type === 'scene') {
        const sc = scenesById.get(m.owner_id);
        ownerName = sc?.name || 'Unknown Scene';
        sceneId = m.owner_id;
        sceneName = ownerName;
        if (sceneId) seenSceneIds.add(sceneId);
    }

    if (!sceneId && b?.scene_id) {
        const sc = scenesById.get(b.scene_id);
        sceneId = b.scene_id;
        sceneName = sc?.name || 'Unknown Scene';
        if (sceneId) seenSceneIds.add(sceneId);
    }

    const mediaTakes = takesByMediaId.get(m.id) || [];

    const baseRecord = {
      media_id: m.id,
      name: m.name || 'untitled',
      prompt: m.prompt,
      media_type: m.media_type || 'unknown',
      bin_id: m.bin_id,
      bin_name: b?.name || 'Unknown Bin',
      owner_type: m.owner_type,
      owner_id: m.owner_id,
      owner_name: ownerName,
      scene_id: sceneId,
      scene_name: sceneName,
      actor_id: actorId,
      actor_name: actorName,
      asset_type: getAssetTypeForContent(m.media_type)?.id || 'audio',
      leaf_type: getAssetTypeForContent(m.media_type)?.leafType || 'take',
      _media: m,
      _bin: b,
    };

    if (mediaTakes.length === 0) {
      index.push({
        ...baseRecord,
        id: `media-${m.id}`,
        take_id: null,
        status: '__none__',
      });
    } else {
      for (const take of mediaTakes) {
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

  // 1.5 Process Bins (Shells for bins that might not have media yet)
  for (const b of bins) {
    let ownerName = 'Global';
    let actorId = null;
    let actorName = null;
    let sceneId = null;
    let sceneName = null;

    if (b.owner_type === 'actor') {
        const a = actorsById.get(b.owner_id);
        ownerName = a?.display_name || 'Unknown Actor';
        actorId = b.owner_id;
        actorName = ownerName;
        if (actorId) seenActorIds.add(actorId); // Mark actor as seen so we don't duplicate shell
    } else if (b.owner_type === 'scene') {
        const sc = scenesById.get(b.owner_id);
        ownerName = sc?.name || 'Unknown Scene';
        sceneId = b.owner_id;
        sceneName = ownerName;
        if (sceneId) seenSceneIds.add(sceneId);
    }

    if (!sceneId && b.scene_id) {
        const sc = scenesById.get(b.scene_id);
        sceneId = b.scene_id;
        sceneName = sc?.name || 'Unknown Scene';
        if (sceneId) seenSceneIds.add(sceneId);
    }

    // Check if this bin is already represented by media?
    // Actually, adding a shell entry is fine, it just adds to the group options.
    // It is safer to add it to ensure the Bin Node exists with correct metadata.
    
    index.push({
      id: `shell-bin-${b.id}`,
      bin_id: b.id,
      bin_name: b.name || b.media_type,
      owner_type: b.owner_type,
      owner_id: b.owner_id,
      owner_name: ownerName,
      scene_id: sceneId,
      scene_name: sceneName,
      actor_id: actorId,
      actor_name: actorName,
      status: '__empty__',
      asset_type: 'audio', // default
      // No media_id
    });
  }

  // 2. Add Shell Entries for Empty Actors (So they appear in the tree)
  for (const actor of actors) {
    if (!seenActorIds.has(actor.id)) {
      index.push({
        owner_type: 'actor',
        owner_id: actor.id,
        owner_name: actor.display_name,
        actor_id: actor.id,
        actor_name: actor.display_name,
        status: '__empty__',
        id: `shell-actor-${actor.id}`
      });
    }
  }

  // 3. Add Shell Entries for Scenes
  for (const scene of scenes) {
    if (!seenSceneIds.has(scene.id)) {
      const baseShell = {
        owner_type: 'scene',
        owner_id: scene.id,
        owner_name: scene.name,
        scene_id: scene.id,
        scene_name: scene.name,
        status: '__empty__'
      };

      if (scene.actor_ids && Array.isArray(scene.actor_ids) && scene.actor_ids.length > 0) {
        for (const actorId of scene.actor_ids) {
          const actor = actorsById.get(actorId);
          index.push({
            ...baseShell,
            id: `shell-scene-${scene.id}-actor-${actorId}`,
            actor_id: actorId,
            actor_name: actor?.display_name || 'Unknown Actor'
          });
        }
      } else {
        index.push({
          ...baseShell,
          id: `shell-scene-${scene.id}`
        });
      }
    }
  }
  console.log(`[ViewEngine] Building Asset Index: ${actors.length} actors, ${bins.length} bins, ${media.length} media, ${takes.length} takes, ${scenes.length} scenes`);
  
  // LOG: Show first few items for debugging
  if (index.length > 0) {
    console.log('[ViewEngine] Sample Index Item:', index[0]);
  }
  
  return index;
}

// ============================================================================
// Grouping Engine
// ============================================================================

export function groupByLevels(items, levels, depth = 0, parentPath = '') {
  if (!items || items.length === 0) return [];
  
  if (depth >= levels.length) {
    return items.filter(i => i.media_id).map(item => { // Don't show shell items as leaves
      const assetType = ASSET_TYPES[item.asset_type] || ASSET_TYPES.audio;
      let label = item.filename;
      if (!label) {
        if (item.take_id) label = `${assetType.leafType} ${item.take_number || item.id}`;
        else label = `(no ${assetType.leafType}s)`;
      }
      return {
        type: 'leaf',
        id: `${parentPath}/leaf:${item.id}`,
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
  
  for (const item of items) {
    const rawValue = item[level.field];
    
    // STRICT HIERARCHY:
    // If an item is missing the value for the REQUIRED tree level, 
    // it is excluded from this specific branch of the tree.
    // This prevents "Unknown" ghost folders.
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      continue;
    }
    
    const key = String(rawValue);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  
  const nodes = [];
  for (const [key, children] of groups) {
    let label = key;
    if (level.labelMap && level.labelMap[key]) {
      label = level.labelMap[key];
    } else if (level.displayField && children[0]) {
      label = children[0][level.displayField] || key;
    }
    
    const currentId = `${level.field}:${key}`;
    const fullId = parentPath ? `${parentPath}/${currentId}` : currentId;
    
    // Determine if we should stop grouping here
    const dimDef = DIMENSIONS.find(d => d.id === level.field);
    const isTerminal = dimDef?.isTerminal || level.isTerminal;
    
    const childNodes = isTerminal ? groupByLevels(children, levels, 999, fullId) : groupByLevels(children, levels, depth + 1, fullId);
    
    const statuses = children.map(c => c.status).filter(s => s !== '__none__' && s !== '__empty__');
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
      id: fullId,
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
    if (level.field === 'owner_type') {
        const order = { global: 0, actor: 1, scene: 2 };
        return (order[a.fieldValue] ?? 99) - (order[b.fieldValue] ?? 99);
    }
    if (level.field === 'status') {
      const order = { approved: 0, new: 1, rejected: 2, hidden: 3 };
      return (order[a.fieldValue] ?? 99) - (order[b.fieldValue] ?? 99);
    }
    return String(a.label).localeCompare(String(b.label));
  });
  
  return nodes;
}

// utility to get view by id
export function getViewById(viewId, customViews = []) {
  return customViews.find(v => v.id === viewId) || PRESET_VIEWS[viewId] || null;
}

export function getAllViews(customViews = []) {
  const seenIds = new Set(customViews.map(v => v.id));
  const combined = [...customViews];
  for (const p of Object.values(PRESET_VIEWS)) {
    if (!seenIds.has(p.id)) combined.push(p);
  }
  return combined;
}

/**
 * Apply a serializable filter to an asset
 */
export function applyFilters(asset, filter) {
  if (!filter) return true;

  // Legacy function support (for hardcoded presets)
  if (typeof filter === 'function') return filter(asset);

  // Array of rules (AND logic)
  if (Array.isArray(filter)) {
    return filter.every(rule => {
      const val = asset[rule.field];
      const target = rule.value;

      switch (rule.op) {
        case 'eq': return String(val) === String(target);
        case 'ne': return String(val) !== String(target);
        case 'contains': return String(val).toLowerCase().includes(String(target).toLowerCase());
        case 'regex': {
          try {
            const re = new RegExp(String(target), 'i');
            return re.test(String(val));
          } catch (e) {
            return true; // Ignore invalid regex
          }
        }
        case 'in': return Array.isArray(target) && target.includes(val);
        default: return true;
      }
    });
  }

  return true;
}

export function buildViewTree(viewId, data, customViews = []) {
  const view = getViewById(viewId, customViews);
  if (!view) return [];
  const { actors = [], bins = [], media = [], takes = [], scenes = [] } = data;
  let assets = buildAssetIndex(actors, bins, media, takes, scenes);

  if (view.filter) {
    assets = assets.filter(a => applyFilters(a, view.filter));
  }
  
  const tree = groupByLevels(assets, view.levels);
  console.log(`[ViewEngine] Built Tree for "${viewId}" (${view.name || 'Untitled'}): ${tree.length} root nodes`);
  return tree;
}
