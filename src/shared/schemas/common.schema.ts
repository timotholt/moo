import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const OwnerTypeSchema = z.enum(['actor', 'scene', 'global']);
export const MediaTypeSchema = z.enum(['dialogue', 'music', 'sfx', 'image', 'video']);
export const TakeStatusSchema = z.enum(['new', 'approved', 'rejected', 'hidden']);
export const ProviderSchema = z.enum(['elevenlabs', 'openai', 'runway', 'manual', 'inherit']);

// ============================================================================
// Common Fields
// ============================================================================

export const TimestampSchema = z.string().datetime();
export const IdSchema = z.string().min(1);

// ============================================================================
// Default Block (Universal for all content types)
// ============================================================================

export const DefaultBlockSchema = z.object({
    provider: ProviderSchema,

    // Dialogue-specific
    voice_id: z.string().optional(),
    model_id: z.string().optional(),
    stability: z.number().min(0).max(1).optional(),
    similarity_boost: z.number().min(0).max(1).optional(),

    // Music-specific
    duration_seconds: z.number().positive().optional(),

    // Image-specific
    model: z.string().optional(),
    style: z.string().optional(),
    quality: z.string().optional(),
    size: z.string().optional(),
    negative_prompt: z.string().optional(),

    // Video-specific
    motion_strength: z.number().min(0).max(1).optional(),
    aspect_ratio: z.string().optional(),
    fps: z.number().int().positive().optional(),

    // Common generation settings
    min_candidates: z.number().int().min(1).max(10).optional(),
    approval_count_default: z.number().int().min(1).max(5).optional(),

    // Field-level derivation templates (e.g., prompt patterns, filename patterns)
    templates: z.object({
        prompt: z.string().optional(),
        filename: z.string().optional(),
    }).optional(),
}).passthrough(); // Allow extra fields for future expansion

export const DefaultBlocksSchema = z.object({
    dialogue: DefaultBlockSchema.optional(),
    music: DefaultBlockSchema.optional(),
    sfx: DefaultBlockSchema.optional(),
    image: DefaultBlockSchema.optional(),
    video: DefaultBlockSchema.optional(),
}).optional();

// ============================================================================
// Type Inference
// ============================================================================

export type OwnerType = z.infer<typeof OwnerTypeSchema>;
export type MediaType = z.infer<typeof MediaTypeSchema>;
export type TakeStatus = z.infer<typeof TakeStatusSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type DefaultBlock = z.infer<typeof DefaultBlockSchema>;
export type DefaultBlocks = z.infer<typeof DefaultBlocksSchema>;
