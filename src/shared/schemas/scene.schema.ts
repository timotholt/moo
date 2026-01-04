import { z } from 'zod';
import { IdSchema, TimestampSchema, DefaultBlocksSchema } from './common.schema.js';

// ============================================================================
// Scene Schema
// ============================================================================

export const SceneSchema = z.object({
    id: IdSchema,
    name: z.string().min(1).max(100),
    description: z.string().optional(),

    // Default blocks for scene-level content
    default_blocks: DefaultBlocksSchema,

    // Completion tracking
    scene_complete: z.boolean().default(false),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateSceneSchema = SceneSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    description: true,
    default_blocks: true,
    scene_complete: true,
});

export const UpdateSceneSchema = SceneSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Scene = z.infer<typeof SceneSchema>;
export type CreateSceneInput = z.infer<typeof CreateSceneSchema>;
export type UpdateSceneInput = z.infer<typeof UpdateSceneSchema>;
