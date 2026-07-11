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

    // Game-facing identity and library organization (all optional for V2
    // compatibility; new authoring flows should populate them deliberately).
    cue_key: z.string().min(1).max(160).optional(),
    tags: z.array(z.string().min(1).max(80)).optional(),
    variation_group: z.string().min(1).max(160).optional(),
    locale: z.string().min(2).max(35).optional(),
    looping: z.boolean().optional(),
    mix_bus: z.string().min(1).max(80).optional(),
    export_filename: z.string().min(1).max(255).optional(),

    // Explicitly chosen approved takes. Approval and selection are separate:
    // an approved take is a candidate; a selected take is a deliverable.
    selected_take_ids: z.array(IdSchema).optional(),

    // Default blocks (overrides for this specific item)
    default_blocks: DefaultBlocksSchema.optional(),

    // A human may stop generation early when the approved takes satisfy their
    // taste, even when the default approval target has not been reached.
    completion_override: z.boolean().optional(),

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
