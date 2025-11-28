import { loadConfig } from './config.js';
import { getElevenLabsApiKey } from './global-config.js';
import { createElevenLabsProvider } from './providers/elevenlabs.js';
import type { AudioProvider } from './providers/provider-interface.js';

/**
 * Create an AudioProvider instance based on project configuration.
 * Currently only supports ElevenLabs for all content types.
 * 
 * API key priority:
 * 1. Global config (shared across all projects)
 * 2. Project config (legacy, per-project)
 */
export async function getAudioProvider(projectRoot: string): Promise<AudioProvider> {
    // First try global config
    const globalApiKey = await getElevenLabsApiKey();
    if (globalApiKey) {
        return createElevenLabsProvider(globalApiKey);
    }
    
    // Fall back to project config (legacy)
    const config = await loadConfig(projectRoot);
    const elevenCfg = config.providers?.elevenlabs;

    if (!elevenCfg || !elevenCfg.api_key) {
        throw new Error('ElevenLabs API key not configured. Go to Settings → Provider to set your API key.');
    }

    return createElevenLabsProvider(elevenCfg.api_key, elevenCfg.api_url);
}
