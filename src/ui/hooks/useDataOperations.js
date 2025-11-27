import { useState, useEffect } from 'react';
import { createContent, createSection, getVoices, updateActor, updateSection } from '../api/client.js';

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
  const [contentPrompt, setContentPrompt] = useState('');
  const [contentItemId, setContentItemId] = useState('');
  const [creatingContent, setCreatingContent] = useState(false);
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [error, setError] = useState(null);

  // Auto-load voices when needed
  useEffect(() => {
    if (selectedNode?.type?.endsWith('-section')) {
      const contentType = selectedNode.type.replace('-section', '');
      const sectionData = sections.find(s => s.id === selectedNode.id);
      if (sectionData) {
        const actor = actors.find((a) => a.id === sectionData.actor_id);
        const providerSettings = actor?.provider_settings?.[contentType];
        
        if (providerSettings?.provider === 'elevenlabs' && voices.length === 0 && !loadingVoices) {
          loadVoices();
        }
      }
    }
  }, [selectedNode, actors, sections, voices.length, loadingVoices]);

  const loadVoices = async () => {
    try {
      setLoadingVoices(true);
      setError(null);
      const result = await getVoices();
      setVoices(result.voices || []);
      if (!result.voices || result.voices.length === 0) {
        setError('No voices available from ElevenLabs');
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
      let errorMessage = err.message || String(err);
      
      if (errorMessage.includes('missing_permissions') || errorMessage.includes('voices_read')) {
        errorMessage = 'ElevenLabs API key is missing voices_read permission. Please check your API key permissions in the ElevenLabs dashboard.';
      } else if (errorMessage.includes('Failed to fetch voices')) {
        errorMessage = 'Cannot connect to ElevenLabs API. Check your internet connection and API key configuration.';
      }
      
      setError(`Failed to load voices: ${errorMessage}`);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const createContentItem = async (actorId, contentType) => {
    try {
      setCreatingContent(true);
      setError(null);
      
      // If no prompt provided, use the item ID as the default prompt (with title case)
      const defaultPrompt = contentItemId
        .split(',')
        .map(id => id.trim())
        .filter(id => id)
        .map(id => id.charAt(0).toUpperCase() + id.slice(1))
        .join(', ');
      
      const result = await createContent({
        actor_id: actorId,
        content_type: contentType,
        item_id: contentItemId,
        prompt: contentPrompt || defaultPrompt,
      });
      if (result && result.content && onContentCreated) {
        if (Array.isArray(result.content)) {
          result.content.forEach(item => onContentCreated(item));
        } else {
          onContentCreated(result.content);
        }
        
        // Auto-expand to show the new content
        if (expandNode) {
          expandNode('actors');
          expandNode(`actor-${actorId}`);
          const section = sections.find(s => s.actor_id === actorId && s.content_type === contentType);
          if (section) {
            expandNode(`section-${section.id}`);
          }
        }
        
        if (result.message) {
          setError(result.message);
        }
      }
      setContentPrompt('');
      setContentItemId('');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setCreatingContent(false);
    }
  };

  const createSectionForActor = async (actorId, contentType, customName = null) => {
    try {
      setCreatingContent(true);
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
      setCreatingContent(false);
    }
  };

  // Sanitize provider settings to only include valid schema properties
  const sanitizeProviderSettings = (settings, contentType) => {
    if (!settings || settings.provider === 'inherit') {
      return { provider: 'inherit' };
    }
    
    // Valid keys per content type
    const validKeys = contentType === 'dialogue'
      ? ['provider', 'voice_id', 'batch_generate', 'approval_count_default', 'stability', 'similarity_boost']
      : ['provider', 'batch_generate', 'approval_count_default'];
    
    const sanitized = {};
    for (const key of validKeys) {
      if (settings[key] !== undefined) {
        sanitized[key] = settings[key];
      }
    }
    return sanitized;
  };

  const updateProviderSettings = async (actorId, contentType, newSettings) => {
    try {
      console.log('[useDataOperations] updateProviderSettings called:', { actorId, contentType, newSettings });
      const actor = actors.find(a => a.id === actorId);
      if (!actor) return;

      // Sanitize each content type's settings
      const sanitizedNewSettings = sanitizeProviderSettings(newSettings, contentType);
      
      const updatedProviderSettings = {};
      
      // Copy and sanitize existing settings for other content types
      if (actor.provider_settings) {
        for (const ct of ['dialogue', 'music', 'sfx']) {
          if (ct === contentType) {
            updatedProviderSettings[ct] = sanitizedNewSettings;
          } else if (actor.provider_settings[ct]) {
            updatedProviderSettings[ct] = sanitizeProviderSettings(actor.provider_settings[ct], ct);
          }
        }
      } else {
        updatedProviderSettings[contentType] = sanitizedNewSettings;
      }

      console.log('[useDataOperations] Sending to API:', { provider_settings: updatedProviderSettings });
      const result = await updateActor(actorId, {
        provider_settings: updatedProviderSettings
      });

      console.log('[useDataOperations] API result:', result);
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
    } catch (err) {
      console.error('[useDataOperations] Error:', err);
      setError(err.message || String(err));
    }
  };

  const updateSectionName = async (sectionId, newName) => {
    try {
      const result = await updateSection(sectionId, { name: newName });
      if (result && result.section && onSectionUpdated) {
        onSectionUpdated(result.section);
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const updateBaseFilename = async (actorId, newBaseFilename) => {
    try {
      const result = await updateActor(actorId, { base_filename: newBaseFilename });
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const updateDisplayName = async (actorId, newDisplayName) => {
    try {
      const result = await updateActor(actorId, { display_name: newDisplayName });
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  return {
    // State
    contentPrompt,
    contentItemId,
    creatingContent,
    voices,
    loadingVoices,
    error,
    setError,
    
    // Handlers
    setContentPrompt,
    setContentItemId,
    createContent: createContentItem,
    createSection: createSectionForActor,
    updateProviderSettings,
    updateSectionName,
    updateBaseFilename,
    updateDisplayName
  };
}
