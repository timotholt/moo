import { loadConfig } from './config.js';
import { createElevenLabsProvider } from './providers/elevenlabs.js';
import type { AudioProvider } from './providers/provider-interface.js';

/**
 * Create an AudioProvider instance based on project configuration.
 * Currently only supports ElevenLabs for all content types.
 */
export async function getAudioProvider(projectRoot: string): Promise<AudioProvider> {
    const config = await loadConfig(projectRoot);
    const elevenCfg = config.providers?.elevenlabs;

    if (!elevenCfg || !elevenCfg.api_key) {
        throw new Error('ElevenLabs API key not configured. Set providers.elevenlabs.api_key via `vof config set`.');
    }

    return createElevenLabsProvider(elevenCfg.api_key, elevenCfg.api_url);
}
