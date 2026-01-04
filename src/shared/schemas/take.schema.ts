import { z } from 'zod';
import { IdSchema, TimestampSchema, TakeStatusSchema, ProviderSchema, OwnerTypeSchema, ContentTypeSchema, DefaultBlockSchema } from './common.schema.js';

// ============================================================================
// Generation Params Schema
// ============================================================================

export const GenerationParamsSchema = z.object({
    // Provider info
    provider: ProviderSchema,
    model_id: z.string().optional(),
    model: z.string().optional(),

    // Content
    prompt: z.string().optional(),
    negative_prompt: z.string().optional(),

    // Provenance: Where settings came from
    resolved_from: z.enum(['section', 'owner', 'global', 'hardcoded']),

    // Full settings snapshot (for reproducibility)
    full_settings: DefaultBlockSchema,

    // Context at generation time
    owner_type: OwnerTypeSchema,
    owner_id: IdSchema.nullable(),
    owner_name: z.string(),
    section_id: IdSchema.optional(),
    section_name: z.string().optional(),
    scene_id: IdSchema.optional(),
    scene_name: z.string().optional(),

    // API metadata
    api_request_id: z.string().optional(),
    api_cost_credits: z.number().optional(),
    api_latency_ms: z.number().optional(),
}).passthrough();

// ============================================================================
// Take Schema
// ============================================================================

export const TakeSchema = z.object({
    id: IdSchema,
    content_id: IdSchema,
    take_number: z.number().int().positive(),

    // File info
    filename: z.string().min(1),
    path: z.string().min(1),
    format: z.string(),
    size_bytes: z.number().int().nonnegative(),

    // Media-specific metadata
    duration_sec: z.number().nonnegative().optional(),
    sample_rate: z.number().int().positive().optional(),
    bit_depth: z.number().int().positive().optional(),
    channels: z.number().int().positive().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fps: z.number().positive().optional(),

    // Hash for deduplication
    hash_sha256: z.string().optional(),

    // Status
    status: TakeStatusSchema.default('new'),
    status_changed_at: TimestampSchema.optional(),

    // Generation metadata
    generated_by: ProviderSchema.optional(),
    generated_at: TimestampSchema.optional(),
    generation_params: GenerationParamsSchema.optional(),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateTakeSchema = TakeSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    status: true,
    status_changed_at: true,
    generated_by: true,
    generated_at: true,
    generation_params: true,
    duration_sec: true,
    sample_rate: true,
    bit_depth: true,
    channels: true,
    width: true,
    height: true,
    fps: true,
    hash_sha256: true,
});

export const UpdateTakeSchema = TakeSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Take = z.infer<typeof TakeSchema>;
export type GenerationParams = z.infer<typeof GenerationParamsSchema>;
export type CreateTakeInput = z.infer<typeof CreateTakeSchema>;
export type UpdateTakeInput = z.infer<typeof UpdateTakeSchema>;
