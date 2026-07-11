
// Re-export specific validation result type if needed, or import from main validation file
// For now, we'll keep the interface here for self-containment/clean imports
export interface ReferenceValidationResult {
    valid: boolean;
    errors?: string[];
}

type IdRecord = { id: string };
type ReferenceCatalog = {
    actors: IdRecord[];
    scenes: IdRecord[];
    bins: IdRecord[];
    media: IdRecord[];
};

/**
 * Validates Referential Integrity (RI)
 * 
 * Automatically scans the input object for keys that strictly verify against the catalog.
 * Supported Keys:
 * - actor_id
 * - scene_id
 * - bin_id
 * - media_id
 * - owner_id + owner_type context
 * 
 * @param data The object to validate (e.g. body of a POST request)
 * @param catalog The full loaded catalog (actors, scenes, bins, etc)
 */
export function validateReferences(data: Record<string, unknown> | null | undefined, catalog: ReferenceCatalog): ReferenceValidationResult {
    const errors: string[] = [];

    if (!data) {
        return { valid: true }; // Nothing to check
    }
    const stringValue = (key: string) => typeof data[key] === 'string' ? data[key] : undefined;
    const actorId = stringValue('actor_id');
    const sceneId = stringValue('scene_id');
    const binId = stringValue('bin_id');
    const mediaId = stringValue('media_id');
    const ownerId = stringValue('owner_id');
    const ownerType = stringValue('owner_type');

    // 1. Check explicit ID fields
    if (actorId && !catalog.actors.some((actor) => actor.id === actorId)) {
        errors.push(`Invalid actor_id: ${actorId}`);
    }

    if (sceneId && !catalog.scenes.some((scene) => scene.id === sceneId)) {
        errors.push(`Invalid scene_id: ${sceneId}`);
    }

    if (Array.isArray(data.actor_ids)) {
        for (const id of data.actor_ids.filter((value): value is string => typeof value === 'string')) {
            if (!catalog.actors.some((actor) => actor.id === id)) {
                errors.push(`Invalid actor_id in actor_ids: ${id}`);
            }
        }
    }

    if (binId && !catalog.bins.some((bin) => bin.id === binId)) {
        errors.push(`Invalid bin_id: ${binId}`);
    }

    if (mediaId && !catalog.media.some((media) => media.id === mediaId)) {
        errors.push(`Invalid media_id: ${mediaId}`);
    }

    // 2. Check Polymorphic Owner Fields
    if (ownerId && ownerType) {
        if (ownerType === 'actor') {
            if (!catalog.actors.some((actor) => actor.id === ownerId)) {
                errors.push(`Invalid owner_id (Actor): ${ownerId}`);
            }
        } else if (ownerType === 'scene') {
            if (!catalog.scenes.some((scene) => scene.id === ownerId)) {
                errors.push(`Invalid owner_id (Scene): ${ownerId}`);
            }
        }
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return { valid: true };
}
