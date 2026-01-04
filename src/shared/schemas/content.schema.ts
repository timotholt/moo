import { z } from 'zod';
import { IdSchema, TimestampSchema, OwnerTypeSchema, ContentTypeSchema } from './common.schema.js';

// ============================================================================
// Content Schema
// ============================================================================

export const ContentSchema = z.object({
    id: IdSchema,

    // Owner (Actor, Scene, or Global)
    owner_type: OwnerTypeSchema,
    owner_id: IdSchema.nullable(),

    // Section this content belongs to
    section_id: IdSchema,

    // Content type
    content_type: ContentTypeSchema,

    // Content identifier (cue/clip/image/track name)
    name: z.string().min(1).max(100),

    // Prompt/text for generation
    prompt: z.string().optional(),

    // Filename (without take number)
    filename: z.string().optional(),

    // Completion tracking
    all_approved: z.boolean().default(false),

    // Optional: Scene linkage (for actor content used in specific scenes)
    scene_id: IdSchema.optional(),

    // Timestamps
    created_at: TimestampSchema,
    updated_at: TimestampSchema,
});

// ============================================================================
// Create/Update Schemas
// ============================================================================

export const CreateContentSchema = ContentSchema.omit({
    id: true,
    created_at: true,
    updated_at: true,
}).partial({
    prompt: true,
    filename: true,
    all_approved: true,
    scene_id: true,
});

export const UpdateContentSchema = ContentSchema.partial().omit({
    id: true,
    created_at: true,
});

// ============================================================================
// Type Inference
// ============================================================================

export type Content = z.infer<typeof ContentSchema>;
export type CreateContentInput = z.infer<typeof CreateContentSchema>;
export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;
