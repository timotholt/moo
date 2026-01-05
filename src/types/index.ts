/**
 * MOO V3 Type System
 * 
 * This file consolidates types from Zod schemas for application-wide use.
 */

// Re-export all types from schemas
export type {
    OwnerType,
    MediaType,
    TakeStatus,
    Provider,
    DefaultBlock,
    DefaultBlocks,
    Actor,
    CreateActorInput,
    UpdateActorInput,
    Scene,
    CreateSceneInput,
    UpdateSceneInput,
    Bin,
    CreateBinInput,
    UpdateBinInput,
    Media,
    CreateMediaInput,
    UpdateMediaInput,
    Take,
    CreateTakeInput,
    UpdateTakeInput,
    GenerationParams,
    Defaults
} from '../shared/schemas/index.js';

// Legacy / App-specific types not in JSONL core
export interface ProjectSettings {
    sample_rate: 44100 | 48000;
    bit_depth: 16 | 24;
    channels: 1 | 2;
    lufs_target: number;
    peak_ceiling_db: number;
    lra_max: number;
}

export interface ProjectInfo {
    name: string;
    path: string;
    schema_version: string;
    created_at: string;
    updated_at: string;
}

export interface GenerationJobItemSummary {
    media_id: string;
    generated_takes: number;
    error?: string;
}

export interface GenerationJob {
    id: string;
    started_at: string;
    completed_at?: string;
    status: 'running' | 'completed' | 'failed';
    total_media: number;
    total_takes_created: number;
    items: GenerationJobItemSummary[];
}
