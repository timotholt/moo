/**
 * Content Type Labels
 * 
 * Maps generic "content" terminology to content-type-specific labels
 * for better UX across different media types.
 */

import type { ContentType } from '../shared/schemas/index.js';

/**
 * Get singular label for content type
 * @example getContentLabel('dialogue') → 'Cue'
 * @example getContentLabel('image') → 'Image'
 */
export function getContentLabel(contentType: ContentType): string {
    switch (contentType) {
        case 'dialogue':
            return 'Cue';
        case 'music':
            return 'Track';
        case 'sfx':
            return 'Sound';
        case 'image':
            return 'Image';
        case 'video':
            return 'Clip';
        default:
            return 'Content';
    }
}

/**
 * Get plural label for content type
 * @example getContentLabelPlural('dialogue') → 'Cues'
 * @example getContentLabelPlural('image') → 'Images'
 */
export function getContentLabelPlural(contentType: ContentType): string {
    switch (contentType) {
        case 'dialogue':
            return 'Cues';
        case 'music':
            return 'Tracks';
        case 'sfx':
            return 'Sounds';
        case 'image':
            return 'Images';
        case 'video':
            return 'Clips';
        default:
            return 'Content';
    }
}

/**
 * Get action label for creating content
 * @example getContentCreateLabel('dialogue') → 'Add New Cue'
 * @example getContentCreateLabel('image') → 'Add New Image'
 */
export function getContentCreateLabel(contentType: ContentType): string {
    return `Add New ${getContentLabel(contentType)}`;
}

/**
 * Get field label for content identifier
 * @example getContentIdLabel('dialogue') → 'Cue ID'
 * @example getContentIdLabel('image') → 'Image ID'
 */
export function getContentIdLabel(contentType: ContentType): string {
    return `${getContentLabel(contentType)} ID`;
}

/**
 * Get label for take/variant
 * @example getTakeLabel('dialogue') → 'Take'
 * @example getTakeLabel('image') → 'Variant'
 */
export function getTakeLabel(contentType: ContentType): string {
    switch (contentType) {
        case 'dialogue':
        case 'music':
        case 'sfx':
            return 'Take';
        case 'image':
        case 'video':
            return 'Variant';
        default:
            return 'Take';
    }
}

/**
 * Get plural label for takes/variants
 * @example getTakeLabelPlural('dialogue') → 'Takes'
 * @example getTakeLabelPlural('image') → 'Variants'
 */
export function getTakeLabelPlural(contentType: ContentType): string {
    switch (contentType) {
        case 'dialogue':
        case 'music':
        case 'sfx':
            return 'Takes';
        case 'image':
        case 'video':
            return 'Variants';
        default:
            return 'Takes';
    }
}
