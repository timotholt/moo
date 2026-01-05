import { z } from 'zod';
import { IdSchema, TimestampSchema, OwnerTypeSchema, MediaTypeSchema, DefaultBlocksSchema } from './common.schema.js';

// ============================================================================
// Bin Schema (formerly Section)
// ============================================================================

export const BinSchema = z.object({
    id: IdSchema,

    // Owner (Actor, Scene, or Global)
    owner_type: OwnerTypeSchema,
    owner_id: IdSchema.nullable(),

    // Media type this bin holds
    media_type: MediaTypeSchema,

    // Bin name
    name: z.string().min(1).max(100),

    // Default blocks (can override owner's blocks)
    default_blocks: DefaultBlocksSchema,

    // Completion tracking
    bin_complete: z.boolean().default(false),

    // Optional: Scene linkage (for actor bins used in specific scenes)
    scene_id: IdSchema.optional(),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateBinSchema = BinSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    default_blocks: true,
    bin_complete: true,
    scene_id: true,
});

export const UpdateBinSchema = BinSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Bin = z.infer<typeof BinSchema>;
export type CreateBinInput = z.infer<typeof CreateBinSchema>;
export type UpdateBinInput = z.infer<typeof UpdateBinSchema>;
