import { useState, useCallback } from 'react';
import { createSection, updateSection, updateActor } from '../api/client.js';

/**
 * Sanitize provider settings to only include valid schema properties
 */
function sanitizeProviderSettings(settings, contentType) {
  if (!settings || settings.provider === 'inherit') {
    return { provider: 'inherit' };
  }
  
  let validKeys;
  if (contentType === 'dialogue') {
    validKeys = ['provider', 'voice_id', 'model_id', 'min_candidates', 'approval_count_default', 'stability', 'similarity_boost'];
  } else if (contentType === 'music') {
    validKeys = ['provider', 'min_candidates', 'approval_count_default', 'duration_seconds'];
  } else {
    validKeys = ['provider', 'min_candidates', 'approval_count_default'];
  }
  
  const sanitized = {};
  for (const key of validKeys) {
    if (settings[key] !== undefined) {
      sanitized[key] = settings[key];
    }
  }
  return sanitized;
}

/**
 * Hook for section CRUD operations
 */
export function useSectionOperations({ 
  sections,
  expandNode, 
  onSectionCreated, 
  onSectionUpdated,
  onActorUpdated
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const createSectionForActor = useCallback(async (actorId, contentType, customName = null) => {
    try {
      setCreating(true);
      setError(null);
      
      const sectionData = {
        actor_id: actorId,
        content_type: contentType,
      };
      
      if (customName) {
        sectionData.name = customName;
      }
      
      const result = await createSection(sectionData);
      
      if (result && result.section && onSectionCreated) {
        onSectionCreated(result.section);
        
        if (expandNode) {
          expandNode('actors');
          expandNode(`actor-${actorId}`);
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreating(false);
    }
  }, [expandNode, onSectionCreated]);

  const updateSectionProviderSettings = useCallback(async (sectionId, newSettings) => {
    try {
      const section = sections.find(s => s.id === sectionId);
      if (!section) {
        console.error('[useSectionOperations] Section not found:', sectionId);
        return;
      }

      const sanitizedSettings = sanitizeProviderSettings(newSettings, section.content_type);
      const result = await updateSection(sectionId, {
        provider_settings: sanitizedSettings
      });

      if (result && result.section && onSectionUpdated) {
        onSectionUpdated(result.section);
      }
    } catch (err) {
      console.error('[useSectionOperations] Error:', err);
      setError(err.message || String(err));
    }
  }, [sections, onSectionUpdated]);

  const updateSectionName = useCallback(async (sectionId, newName, oldName) => {
    try {
      const result = await updateSection(sectionId, { name: newName });
      if (result && result.section && onSectionUpdated) {
        onSectionUpdated(result.section, oldName);
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [onSectionUpdated]);

  const toggleSectionComplete = useCallback(async (sectionId, newCompleteValue) => {
    try {
      const result = await updateSection(sectionId, { section_complete: newCompleteValue });
      if (result && result.section && onSectionUpdated) {
        onSectionUpdated(result.section);
      }

      // If section is being marked incomplete, also mark parent actor as incomplete
      if (newCompleteValue === false) {
        const section = sections.find((s) => s.id === sectionId);
        if (section) {
          try {
            const actorResult = await updateActor(section.actor_id, { actor_complete: false });
            if (actorResult && actorResult.actor && onActorUpdated) {
              onActorUpdated(actorResult.actor);
            }
          } catch (actorErr) {
            setError(actorErr.message || String(actorErr));
          }
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  }, [sections, onSectionUpdated, onActorUpdated]);

  return {
    creating,
    error,
    setError,
    createSection: createSectionForActor,
    updateProviderSettings: updateSectionProviderSettings,
    updateSectionName,
    toggleSectionComplete,
  };
}
