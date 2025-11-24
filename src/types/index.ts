export interface ProjectSettings {
    media_root: string;
    sample_rate: 44100 | 48000;
    bit_depth: 16 | 24;
    channels: 1 | 2;
    lufs_target: number;
    peak_ceiling_db: number;
    lra_max: number;
}

export interface Project {
    id: string;
    name: string;
    schema_version: '2.0.0';
    created_at: string;
    updated_at: string;
    settings: ProjectSettings;
}

export interface Actor {
    id: string;
    display_name: string;
    base_filename: string;
    all_approved: boolean;
    provider_settings: {
        dialogue?: {
            provider: 'elevenlabs' | 'manual';
            voice_id?: string;
            batch_generate?: number;
            approval_count_default?: number;
            stability?: number;
            similarity_boost?: number;
        };
        music?: {
            provider: 'elevenlabs' | 'manual';
            batch_generate?: number;
            approval_count_default?: number;
        };
        sfx?: {
            provider: 'elevenlabs' | 'manual';
            batch_generate?: number;
            approval_count_default?: number;
        };
    };
    aliases: string[];
    notes: string;
    created_at: string;
    updated_at: string;
}

export type ContentType = 'dialogue' | 'music' | 'sfx';

export interface Content {
    id: string;
    actor_id: string;
    content_type: ContentType;
    item_id: string;
    prompt: string;
    complete: boolean;
    all_approved: boolean;
    tags: string[];
    created_at: string;
    updated_at: string;
}

export interface Section {
    id: string;
    actor_id: string;
    content_type: ContentType;
    created_at: string;
    updated_at: string;
}

export interface Take {
    id: string;
    content_id: string;
    take_number: number;
    filename: string;
    status: 'new' | 'approved' | 'rejected' | 'hidden';
    path: string;
    hash_sha256: string;
    duration_sec: number;
    format: 'wav' | 'flac' | 'aiff' | 'mp3';
    sample_rate: 44100 | 48000;
    bit_depth: 16 | 24;
    channels: 1 | 2;
    lufs_integrated: number;
    peak_dbfs: number;
    generated_by: 'elevenlabs' | 'manual' | null;
    generation_params: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface GenerationJobItemSummary {
    content_id: string;
    generated_takes: number;
    error?: string;
}

export interface GenerationJob {
    id: string;
    started_at: string;
    completed_at?: string;
    status: 'running' | 'completed' | 'failed';
    total_content: number;
    total_takes_created: number;
    items: GenerationJobItemSummary[];
}
