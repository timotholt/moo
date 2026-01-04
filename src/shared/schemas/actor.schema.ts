import { z } from 'zod';
import { IdSchema, TimestampSchema, DefaultBlocksSchema } from './common.schema.js';

// ============================================================================
// Actor Schema
// ============================================================================

export const ActorSchema = z.object({
    id: IdSchema,
    display_name: z.string().min(1).max(100),
    base_filename: z.string().min(1).max(50),

    // Default blocks for any content type
    default_blocks: DefaultBlocksSchema,

    // Completion tracking
    actor_complete: z.boolean().default(false),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateActorSchema = ActorSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    default_blocks: true,
    actor_complete: true,
});

export const UpdateActorSchema = ActorSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Actor = z.infer<typeof ActorSchema>;
export type CreateActorInput = z.infer<typeof CreateActorSchema>;
export type UpdateActorInput = z.infer<typeof UpdateActorSchema>;
