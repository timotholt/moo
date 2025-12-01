import { useState, useCallback } from 'react';
import { updateActor } from '../api/client.js';
import { useVoices } from './useVoices.ts';
import { useSectionOperations } from './useSectionOperations.js';
import { useContentOperations } from './useContentOperations.js';

/**
 * Composite hook for data operations
 * Combines voices, section, and content operations into a single interface
 * for backward compatibility with existing components
 */
export function useDataOperations({ 
  actors, 
  sections, 
  selectedNode, 
  expandNode, 
  onContentCreated, 
  onSectionCreated, 
  onActorUpdated, 
  onSectionUpdated
}) {
  const [actorError, setActorError] = useState(null);

  // Compose smaller hooks
  const voiceOps = useVoices({ selectedNode, actors, sections });
  
  const sectionOps = useSectionOperations({ 
    sections, 
    expandNode, 
    onSectionCreated, 
    onSectionUpdated,
    onActorUpdated
  });
  
  const contentOps = useContentOperations({ 
    expandNode, 
    onContentCreated 
  });

  // Actor-specific operations (kept here as they're simple)
  const updateBaseFilename = useCallback(async (actorId, newBaseFilename) => {
    try {
      const result = await updateActor(actorId, { base_filename: newBaseFilename });
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
    } catch (err) {
      setActorError(err.message || String(err));
    }
  }, [onActorUpdated]);

  const updateDisplayName = useCallback(async (actorId, newDisplayName, oldDisplayName) => {
    try {
      const result = await updateActor(actorId, { display_name: newDisplayName });
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor, oldDisplayName);
      }
    } catch (err) {
      setActorError(err.message || String(err));
    }
  }, [onActorUpdated]);

  // Combine errors from all sources
  const error = actorError || sectionOps.error || contentOps.error || voiceOps.voiceError;
  
  const setError = useCallback((err) => {
    setActorError(err);
    sectionOps.setError(err);
    contentOps.setError(err);
  }, [sectionOps, contentOps]);

  return {
    // State (backward compatible interface)
    contentPrompt: contentOps.contentPrompt,
    contentCueId: contentOps.contentCueId,
    creatingContent: contentOps.creating || sectionOps.creating,
    voices: voiceOps.voices,
    loadingVoices: voiceOps.loadingVoices,
    error,
    setError,
    
    // Handlers (backward compatible interface)
    setContentPrompt: contentOps.setContentPrompt,
    setContentCueId: contentOps.setContentCueId,
    createContent: contentOps.createContent,
    createSection: sectionOps.createSection,
    updateProviderSettings: sectionOps.updateProviderSettings,
    updateSectionName: sectionOps.updateSectionName,
    updateBaseFilename,
    updateDisplayName,
    toggleSectionComplete: sectionOps.toggleSectionComplete
  };
}
