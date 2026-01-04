import { z } from 'zod';
import { IdSchema, TimestampSchema, OwnerTypeSchema, ContentTypeSchema, DefaultBlocksSchema } from './common.schema.js';

// ============================================================================
// Section Schema
// ============================================================================

export const SectionSchema = z.object({
    id: IdSchema,

    // Owner (Actor, Scene, or Global)
    owner_type: OwnerTypeSchema,
    owner_id: IdSchema.nullable(),

    // Content type this section generates
    content_type: ContentTypeSchema,

    // Section name
    name: z.string().min(1).max(100),

    // Default blocks (can override owner's blocks)
    default_blocks: DefaultBlocksSchema,

    // Completion tracking
    section_complete: z.boolean().default(false),

    // Optional: Scene linkage (for actor sections used in specific scenes)
    scene_id: IdSchema.optional(),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateSectionSchema = SectionSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    default_blocks: true,
    section_complete: true,
    scene_id: true,
});

export const UpdateSectionSchema = SectionSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Section = z.infer<typeof SectionSchema>;
export type CreateSectionInput = z.infer<typeof CreateSectionSchema>;
export type UpdateSectionInput = z.infer<typeof UpdateSectionSchema>;
