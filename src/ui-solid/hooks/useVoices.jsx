import { createSignal, createEffect } from 'solid-js';
import { getVoices } from '../api/client.js';

export function useVoices(props) {
    const [voices, setVoices] = createSignal([]);
    const [loadingVoices, setLoadingVoices] = createSignal(false);
    const [voiceError, setVoiceError] = createSignal(null);

    // Determine if voices are needed based on current selection
    const needsVoices = () => {
        const node = props.selectedNode;
        if (node?.type === 'provider-default') {
            return true;
        }

        if (node?.type?.endsWith('-bin')) {
            const mediaType = node.type.replace('-bin', '');
            const binData = props.bins.find(b => b.id === node.id);
            if (binData) {
                const actor = props.actors.find((a) => a.id === binData.owner_id);
                const providerSettings = actor?.provider_settings?.[mediaType];
                // Default to elevenlabs if not specified, or if explicitly set
                return !providerSettings?.provider || providerSettings.provider === 'elevenlabs';
            }
        }

        return false;
    };

    const loadVoices = async () => {
        try {
            setLoadingVoices(true);
            setVoiceError(null);
            const result = await getVoices();
            setVoices(result.voices || []);
            if (!result.voices || result.voices.length === 0) {
                setVoiceError('No voices available from ElevenLabs');
            }
        } catch (err) {
            console.error('Failed to load voices:', err);
            let errorMessage = err.message || String(err);

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
    };

    // Auto-load voices when needed
    createEffect(() => {
        if (needsVoices() && voices().length === 0 && !loadingVoices()) {
            loadVoices();
        }
    });

    return {
        voices,
        loadingVoices,
        voiceError,
        loadVoices,
    };
}
