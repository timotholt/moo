/**
 * Provider interface for audio generation services
 */

export interface VoiceSettings {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
}

export interface MusicSettings {
    duration_seconds?: number;
    prompt_influence?: number;
}

export interface SFXSettings {
    duration_seconds?: number;
    prompt_influence?: number;
}

export interface QuotaInfo {
    character_count: number;
    character_limit: number;
    can_extend_character_limit: boolean;
    allowed_to_extend_character_limit: boolean;
    next_character_count_reset_unix: number;
    voice_limit: number;
    professional_voice_limit: number;
    can_extend_voice_limit: boolean;
    can_use_instant_voice_cloning: boolean;
    can_use_professional_voice_cloning: boolean;
    currency: string;
    status: string;
}

export interface AudioProvider {
    /**
     * Generate dialogue audio from text
     */
    generateDialogue(
        text: string,
        voiceId: string,
        settings?: VoiceSettings
    ): Promise<Buffer>;

    /**
     * Generate music audio from prompt
     */
    generateMusic(prompt: string, settings?: MusicSettings): Promise<Buffer>;

    /**
     * Generate SFX audio from prompt
     */
    generateSFX(prompt: string, settings?: SFXSettings): Promise<Buffer>;

    /**
     * Get current quota/usage information
     */
    getQuota(): Promise<QuotaInfo>;
}
