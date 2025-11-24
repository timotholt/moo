import type {
    AudioProvider,
    VoiceSettings,
    MusicSettings,
    SFXSettings,
    QuotaInfo,
} from './provider-interface.js';

/**
 * ElevenLabs API client
 * Implements the AudioProvider interface for ElevenLabs text-to-speech and sound generation
 */

const DEFAULT_API_URL = 'https://api.elevenlabs.io/v1';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class ElevenLabsProvider implements AudioProvider {
    private apiKey: string;
    private apiUrl: string;

    constructor(apiKey: string, apiUrl: string = DEFAULT_API_URL) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
    }

    /**
     * Generate dialogue audio using ElevenLabs TTS
     */
    async generateDialogue(
        text: string,
        voiceId: string,
        settings?: VoiceSettings
    ): Promise<Buffer> {
        const url = `${this.apiUrl}/text-to-speech/${voiceId}`;

        const body = {
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: settings || {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        };

        return this.fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'xi-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    /**
     * Generate music audio using ElevenLabs (placeholder - API may differ)
     */
    async generateMusic(prompt: string, settings?: MusicSettings): Promise<Buffer> {
        // Note: ElevenLabs may not have a direct music API yet
        // This is a placeholder for future implementation
        throw new Error('Music generation not yet implemented for ElevenLabs');
    }

    /**
     * Generate SFX audio using ElevenLabs sound effects API
     */
    async generateSFX(prompt: string, settings?: SFXSettings): Promise<Buffer> {
        const url = `${this.apiUrl}/sound-generation`;

        const body = {
            text: prompt,
            duration_seconds: settings?.duration_seconds || 5,
            prompt_influence: settings?.prompt_influence || 0.3,
        };

        return this.fetchWithRetry(url, {
            method: 'POST',
            headers: {
                'xi-api-key': this.apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
    }

    /**
     * Get current quota information
     */
    async getQuota(): Promise<QuotaInfo> {
        const url = `${this.apiUrl}/user/subscription`;

        const response = await fetch(url, {
            headers: {
                'xi-api-key': this.apiKey,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to get quota: ${response.statusText}`);
        }

        const data = await response.json();
        return data as QuotaInfo;
    }

    /**
     * Fetch with retry logic
     */
    private async fetchWithRetry(url: string, options: RequestInit): Promise<Buffer> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await fetch(url, options);

                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                return Buffer.from(arrayBuffer);
            } catch (error) {
                lastError = error as Error;
                console.error(`Attempt ${attempt}/${MAX_RETRIES} failed:`, error);

                if (attempt < MAX_RETRIES) {
                    await this.delay(RETRY_DELAY_MS * attempt); // Exponential backoff
                }
            }
        }

        throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
    }

    /**
     * Delay helper for retry logic
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

/**
 * Create an ElevenLabs provider instance from config
 */
export function createElevenLabsProvider(apiKey: string, apiUrl?: string): AudioProvider {
    return new ElevenLabsProvider(apiKey, apiUrl);
}
