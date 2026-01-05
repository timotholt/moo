import { z } from 'zod';
import { IdSchema, TimestampSchema, OwnerTypeSchema, MediaTypeSchema, DefaultBlocksSchema } from './common.schema.js';

// ============================================================================
// Media Schema (formerly Content)
// ============================================================================

export const MediaSchema = z.object({
    id: IdSchema,

    // Owner (Actor, Scene, or Global)
    owner_type: OwnerTypeSchema,
    owner_id: IdSchema.nullable(),

    // Bin this media belongs to
    bin_id: IdSchema,

    // Media type
    media_type: MediaTypeSchema,

    // Media identifier (cue/clip/image/track name)
    name: z.string().min(1).max(100),

    // Prompt/text for generation
    prompt: z.string().optional(),

    // Filename (without take number)
    filename: z.string().optional(),

    // Default blocks (overrides for this specific item)
    default_blocks: DefaultBlocksSchema.optional(),

    // Completion tracking
    all_approved: z.boolean().default(false),

    // Optional: Scene linkage (for actor media used in specific scenes)
    scene_id: IdSchema.optional(),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateMediaSchema = MediaSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    prompt: true,
    filename: true,
    all_approved: true,
    scene_id: true,
    default_blocks: true,
});

export const UpdateMediaSchema = MediaSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Media = z.infer<typeof MediaSchema>;
export type CreateMediaInput = z.infer<typeof CreateMediaSchema>;
export type UpdateMediaInput = z.infer<typeof UpdateMediaSchema>;
