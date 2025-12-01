/**
 * Utility for generating human-readable descriptions of object changes
 * Used for undo messages and console logging
 */

export interface DiffResult {
  /** List of human-readable change descriptions */
  changes: string[];
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** Summary message (e.g., "Changed voice_id, stability") */
  summary: string;
}

/** Field display name mappings for better readability */
const FIELD_LABELS: Record<string, string> = {
  display_name: 'name',
  base_filename: 'filename',
  voice_id: 'voice',
  model_id: 'model',
  min_candidates: 'minimum candidates',
  approval_count_default: 'approval count',
  similarity_boost: 'similarity',
  duration_seconds: 'duration',
  provider_settings: 'provider settings',
  content_type: 'type',
  cue_id: 'cue',
  filename: 'filename',
  prompt: 'prompt',
  all_approved: 'cue completion',
  actor_complete: 'actor completion',
  section_complete: 'section completion',
  status: 'take status',
};

/** Fields to ignore when comparing */
const IGNORED_FIELDS = new Set([
  'id',
  'created_at',
  'updated_at',
]);

/**
 * Get a human-readable label for a field name
 */
function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, ' ');
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    // Truncate long strings
    return value.length > 30 ? value.slice(0, 27) + '...' : value;
  }
  if (typeof value === 'object') {
    return '[object]';
  }
  return String(value);
}

/**
 * Compare two objects and generate human-readable change descriptions
 * 
 * @param oldObj - The original object
 * @param newObj - The updated object
 * @param prefix - Optional prefix for nested field names (e.g., "dialogue.")
 * @returns DiffResult with changes, hasChanges flag, and summary
 */
export function describeChanges(
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown> | null | undefined,
  prefix = ''
): DiffResult {
  const changes: string[] = [];
  
  // Handle null/undefined cases
  if (!oldObj && !newObj) {
    return { changes: [], hasChanges: false, summary: '' };
  }
  if (!oldObj) {
    return { changes: ['created'], hasChanges: true, summary: 'created' };
  }
  if (!newObj) {
    return { changes: ['deleted'], hasChanges: true, summary: 'deleted' };
  }
  
  // Get all keys from both objects
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changedFields: string[] = [];
  
  for (const key of allKeys) {
    // Skip ignored fields
    if (IGNORED_FIELDS.has(key)) continue;
    
    const oldVal = oldObj[key];
    const newVal = newObj[key];
    const fieldName = prefix + key;
    const label = getFieldLabel(key);
    
    // Handle nested objects (like provider_settings)
    if (
      typeof oldVal === 'object' && oldVal !== null && !Array.isArray(oldVal) &&
      typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal)
    ) {
      const nestedDiff = describeChanges(
        oldVal as Record<string, unknown>,
        newVal as Record<string, unknown>,
        fieldName + '.'
      );
      if (nestedDiff.hasChanges) {
        changes.push(...nestedDiff.changes);
        changedFields.push(label);
      }
      continue;
    }
    
    // Compare values
    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);
    
    if (oldStr !== newStr) {
      changedFields.push(label);
      
      // Special handling for completion flags
      // Note: These return just the action - the caller adds the path prefix
      if (key === 'all_approved') {
        changes.push(newVal ? 'marked as complete' : 'marked as incomplete');
      }
      else if (key === 'actor_complete') {
        changes.push(newVal ? 'marked as complete' : 'marked as incomplete');
      }
      else if (key === 'section_complete') {
        changes.push(newVal ? 'marked as complete' : 'marked as incomplete');
      }
      // Special handling for take status (approved/rejected)
      else if (key === 'status') {
        if (newVal === 'approved') changes.push('Approved take');
        else if (newVal === 'rejected') changes.push('Rejected take');
        else if (newVal === 'new') changes.push('Reset take to new');
        else changes.push(`Changed take status to ${newVal}`);
      }
      // Generate descriptive change message
      else if (oldVal === undefined || oldVal === null) {
        changes.push(`Set ${label} to ${formatValue(newVal)}`);
      } else if (newVal === undefined || newVal === null) {
        changes.push(`Cleared ${label}`);
      } else {
        changes.push(`Changed ${label}: ${formatValue(oldVal)} → ${formatValue(newVal)}`);
      }
    }
  }
  
  const hasChanges = changes.length > 0;
  const summary = changedFields.length > 0 
    ? `Changed ${changedFields.join(', ')}`
    : '';
  
  return { changes, hasChanges, summary };
}

/**
 * Generate a snapshot message for an update operation
 * 
 * @param entityType - Type of entity (e.g., "actor", "section", "content")
 * @param entityName - Display name of the entity
 * @param oldObj - Original object state
 * @param newObj - Updated object state
 * @returns Descriptive message for the snapshot
 */
export function generateUpdateMessage(
  entityType: string,
  entityName: string,
  oldObj: Record<string, unknown> | null | undefined,
  newObj: Record<string, unknown> | null | undefined
): string {
  const diff = describeChanges(oldObj, newObj);
  
  if (!diff.hasChanges) {
    return `Update ${entityType}: ${entityName} (no changes)`;
  }
  
  // For single change, be more specific
  if (diff.changes.length === 1) {
    return `${entityType}: ${entityName} - ${diff.changes[0]}`;
  }
  
  // For multiple changes, use summary
  return `Update ${entityType}: ${entityName} (${diff.summary.toLowerCase()})`;
}
