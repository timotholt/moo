import { z } from 'zod';
import { ContentTypeSchema, DefaultBlockSchema } from './common.schema.js';

// ============================================================================
// Defaults.json Schema
// ============================================================================

export const DefaultsSchema = z.object({
    schema_version: z.string().default('2.0.0'),

    // Global defaults for each content type
    content_types: z.record(
        ContentTypeSchema,
        DefaultBlockSchema
    ),

    // Templates for creating new entities
    templates: z.object({
        actor: z.object({
            auto_add_blocks: z.array(ContentTypeSchema).default(['dialogue']),
        }).optional(),

        scene: z.object({
            auto_add_blocks: z.array(ContentTypeSchema).default([]),
        }).optional(),
    }).optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

export type Defaults = z.infer<typeof DefaultsSchema>;
