import { useState, useEffect, useCallback } from 'react';
import { getVoices } from '../api/client.js';

interface Voice {
  voice_id: string;
  name: string;
  [key: string]: unknown;
}

interface SelectedNode {
  type: string;
  id: string;
}

interface Actor {
  id: string;
  display_name: string;
  provider_settings?: Record<string, { provider?: string }>;
}

interface Section {
  id: string;
  actor_id: string;
  content_type: string;
}

interface UseVoicesProps {
  selectedNode: SelectedNode | null;
  actors: Actor[];
  sections: Section[];
}

interface UseVoicesReturn {
  voices: Voice[];
  loadingVoices: boolean;
  voiceError: string | null;
  loadVoices: () => Promise<void>;
}

/**
 * Hook for loading and managing ElevenLabs voices
 */
export function useVoices({ selectedNode, actors, sections }: UseVoicesProps): UseVoicesReturn {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // Determine if voices are needed based on current selection
  const needsVoices = useCallback(() => {
    if (selectedNode?.type === 'provider-default') {
      return true;
    }

    if (selectedNode?.type?.endsWith('-section')) {
      const contentType = selectedNode.type.replace('-section', '');
      const sectionData = sections.find(s => s.id === selectedNode.id);
      if (sectionData) {
        const actor = actors.find((a) => a.id === sectionData.actor_id);
        const providerSettings = actor?.provider_settings?.[contentType];
        return providerSettings?.provider === 'elevenlabs';
      }
    }

    return false;
  }, [selectedNode, actors, sections]);

  const loadVoices = useCallback(async () => {
    try {
      setLoadingVoices(true);
      setVoiceError(null);
      const result = await getVoices();
      setVoices((result.voices || []) as Voice[]);
      if (!result.voices || result.voices.length === 0) {
        setVoiceError('No voices available from ElevenLabs');
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
      let errorMessage = (err as Error).message || String(err);
      
      if (errorMessage.includes('missing_permissions') || errorMessage.includes('voices_read')) {
        errorMessage = 'ElevenLabs API key is missing voices_read permission. Please check your API key permissions in the ElevenLabs dashboard.';
      } else if (errorMessage.includes('Failed to fetch voices')) {
        errorMessage = 'Cannot connect to ElevenLabs API. Check your internet connection and API key configuration.';
      }
      
      setVoiceError(`Failed to load voices: ${errorMessage}`);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  // Auto-load voices when needed
  useEffect(() => {
    if (needsVoices() && voices.length === 0 && !loadingVoices) {
      loadVoices();
    }
  }, [needsVoices, voices.length, loadingVoices, loadVoices]);

  return {
    voices,
    loadingVoices,
    voiceError,
    loadVoices,
  };
}
