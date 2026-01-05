/**
 * Asset Type System
 * 
 * Defines the different types of assets that can be managed:
 * - Audio (media → takes): dialogue, music, sfx
 * - Clips (references → files): images, video
 * - Scripts (scripts → documents): text, pdf, doc
 * 
 * Each asset type has:
 * - A parent type (media, clip, script)
 * - A leaf type (take, file, document)
 * - Supported file extensions
 * - Media types that use this asset type
 */

// ============================================================================
// Asset Type Definitions
// ============================================================================

export const ASSET_TYPES = {
  audio: {
    id: 'audio',
    name: 'Audio',
    description: 'Voice recordings, music, sound effects',
    
    // Parent-child relationship
    parentType: 'media',         // Parent record type (Media)
    parentField: 'media_id',     // Field linking leaf to parent
    leafType: 'take',            // What we call the leaf items
    leafTypePlural: 'takes',
    
    // File handling
    extensions: ['wav', 'mp3', 'flac', 'aiff', 'ogg', 'm4a'],
    mimeTypes: ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/aiff', 'audio/ogg', 'audio/mp4'],
    
    // Media types that produce this asset type
    mediaTypes: ['dialogue', 'music', 'sfx'],
    
    // Icons
    icon: 'audio',
    leafIcon: 'audioFile',
  },
  
  clip: {
    id: 'clip',
    name: 'Clip',
    description: 'Images and video clips',
    
    parentType: 'clip',
    parentField: 'media_id',     // Changed to media_id for consistency
    leafType: 'file',
    leafTypePlural: 'files',
    
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'mp4', 'mov', 'avi', 'webm'],
    mimeTypes: ['image/*', 'video/*'],
    
    mediaTypes: ['image', 'video', 'storyboard'],
    
    icon: 'clip',
    leafIcon: 'imageFile',
  },
  
  script: {
    id: 'script',
    name: 'Script',
    description: 'Scripts, notes, documentation',
    
    parentType: 'script',
    parentField: 'media_id',     // Changed to media_id for consistency
    leafType: 'document',
    leafTypePlural: 'documents',
    
    extensions: ['txt', 'md', 'doc', 'docx', 'pdf', 'rtf'],
    mimeTypes: ['text/*', 'application/pdf', 'application/msword'],
    
    mediaTypes: ['script', 'notes', 'documentation'],
    
    icon: 'script',
    leafIcon: 'documentFile',
  },
};

// ============================================================================
// Media Type to Asset Type Mapping
// ============================================================================

/**
 * Map media_type to asset type.
 * This determines what kind of leaves a media item has.
 */
export const MEDIA_TYPE_TO_ASSET = {
  // Audio types → takes
  dialogue: 'audio',
  music: 'audio',
  sfx: 'audio',
  
  // Visual types → files
  image: 'clip',
  video: 'clip',
  storyboard: 'clip',
  
  // Document types → documents
  script: 'script',
  notes: 'script',
  documentation: 'script',
};

/**
 * Get the asset type for a media type.
 */
export function getAssetTypeForContent(mediaType) {
  const assetTypeId = MEDIA_TYPE_TO_ASSET[mediaType];
  return assetTypeId ? ASSET_TYPES[assetTypeId] : ASSET_TYPES.audio;
}

/**
 * Get the asset type by ID.
 */
export function getAssetType(assetTypeId) {
  return ASSET_TYPES[assetTypeId] || null;
}

/**
 * Determine asset type from file extension.
 */
export function getAssetTypeFromExtension(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  
  for (const assetType of Object.values(ASSET_TYPES)) {
    if (assetType.extensions.includes(ext)) {
      return assetType;
    }
  }
  return null;
}

// ============================================================================
// Bin Media Type Constraints
// ============================================================================

/**
 * Defines what media types are allowed in each bin type.
 * This enforces: music bins → music media, dialogue bins → dialogue media, etc.
 *
 * High-level buckets:
 * - clips: images or video (and storyboards if present)
 * - documents: scripts, notes, documentation
 * - general: anything
 */
export const BIN_MEDIA_CONSTRAINTS = {
  // Audio bins
  dialogue: ['dialogue'],
  music: ['music'],
  sfx: ['sfx'],
  
  // Clips bins: images or video (and storyboards if used)
  clips: ['image', 'video', 'storyboard'],
  
  // Documents bins: scripts, notes, documentation
  documents: ['script', 'notes', 'documentation'],
  
  // General bin (allows anything)
  general: Object.keys(MEDIA_TYPE_TO_ASSET),
};

/**
 * Get allowed media types for a bin.
 */
export function getAllowedMediaTypes(binMediaType) {
  return BIN_MEDIA_CONSTRAINTS[binMediaType] || 
         BIN_MEDIA_CONSTRAINTS.general;
}

/**
 * Check if a media type is allowed in a bin.
 */
export function isMediaTypeAllowed(binMediaType, mediaType) {
  const allowed = getAllowedMediaTypes(binMediaType);
  return allowed.includes(mediaType);
}

// ============================================================================
// Leaf Display Helpers
// ============================================================================

/**
 * Get display info for a leaf item based on its asset type.
 */
export function getLeafDisplayInfo(leaf, assetType) {
  const type = assetType || ASSET_TYPES.audio;
  
  return {
    label: leaf.filename || `${type.leafType} ${leaf.take_number || leaf.id}`,
    icon: type.leafIcon,
    type: type.leafType,
  };
}

/**
 * Get the appropriate icon for a file based on extension.
 */
export function getFileIcon(filename) {
  const assetType = getAssetTypeFromExtension(filename);
  if (!assetType) return 'file';
  
  const ext = filename.split('.').pop()?.toLowerCase();
  
  // More specific icons within asset types
  if (assetType.id === 'audio') {
    return 'audioFile';
  }
  if (assetType.id === 'clip') {
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext)) return 'videoFile';
    return 'imageFile';
  }
  if (assetType.id === 'script') {
    if (ext === 'pdf') return 'pdfFile';
    if (['doc', 'docx'].includes(ext)) return 'wordFile';
    return 'textFile';
  }
  
  return 'file';
}
