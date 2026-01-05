import { z } from 'zod';
import * as Schemas from '../shared/schemas/index.js';
import type { ValidationResult } from './validation.js';

// Re-export specific validation result type if needed, or import from main validation file
// For now, we'll keep the interface here for self-containment/clean imports
export interface ReferenceValidationResult {
    valid: boolean;
    errors?: string[];
}

/**
 * Validates Referential Integrity (RI)
 * 
 * Automatically scans the input object for keys that strictly verify against the catalog.
 * Supported Keys:
 * - actor_id
 * - scene_id
 * - section_id
 * - content_id
 * - owner_id + owner_type context
 * 
 * @param data The object to validate (e.g. body of a POST request)
 * @param catalog The full loaded catalog (actors, scenes, sections, etc)
 */
export function validateReferences(data: any, catalog: any): ReferenceValidationResult {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
        return { valid: true }; // Nothing to check
    }

    // 1. Check explicit ID fields
    if (data.actor_id && !catalog.actors.some((a: any) => a.id === data.actor_id)) {
        errors.push(`Invalid actor_id: ${data.actor_id}`);
    }

    if (data.scene_id && !catalog.scenes.some((s: any) => s.id === data.scene_id)) {
        errors.push(`Invalid scene_id: ${data.scene_id}`);
    }

    if (data.actor_ids && Array.isArray(data.actor_ids)) {
        for (const id of data.actor_ids) {
            if (!catalog.actors.some((a: any) => a.id === id)) {
                errors.push(`Invalid actor_id in actor_ids: ${id}`);
            }
        }
    }

    if (data.section_id && !catalog.sections.some((s: any) => s.id === data.section_id)) {
        errors.push(`Invalid section_id: ${data.section_id}`);
    }

    if (data.content_id && !catalog.content.some((c: any) => c.id === data.content_id)) {
        errors.push(`Invalid content_id: ${data.content_id}`);
    }

    // 2. Check Polymorphic Owner Fields
    if (data.owner_id && data.owner_type) {
        if (data.owner_type === 'actor') {
            if (!catalog.actors.some((a: any) => a.id === data.owner_id)) {
                errors.push(`Invalid owner_id (Actor): ${data.owner_id}`);
            }
        } else if (data.owner_type === 'scene') {
            if (!catalog.scenes.some((s: any) => s.id === data.owner_id)) {
                errors.push(`Invalid owner_id (Scene): ${data.owner_id}`);
            }
        }
        // 'global' owner has no ID to check, so we ignore it
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true };
}
