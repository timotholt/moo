/**
 * Path Construction Utilities
 * 
 * Constructs file paths for media files based on the v2 schema:
 * {owner_folder}/{media_type}/{bin_name}/{name}_{take_number}.{ext}
 */

import { join } from 'path';
import type { MediaType, OwnerType } from '../shared/schemas/index.js';
import type { Actor } from '../shared/schemas/actor.schema.js';
import type { Scene } from '../shared/schemas/scene.schema.js';
import type { Bin } from '../shared/schemas/bin.schema.js';
import type { Media } from '../shared/schemas/media.schema.js';

/**
 * Get file extension for media type
 */
export function getExtensionForType(mediaType: MediaType): string {
    switch (mediaType) {
        case 'dialogue':
        case 'music':
        case 'sfx':
            return 'mp3';
        case 'image':
            return 'png';
        case 'video':
            return 'mp4';
        default:
            return 'bin';
    }
}

/**
 * Get owner folder name based on owner type and ID
 */
export function getOwnerFolder(
    ownerType: OwnerType,
    ownerId: string | null,
    ownerBaseFilename?: string
): string {
    switch (ownerType) {
        case 'actor':
            return `actors/${ownerBaseFilename || ownerId || 'unknown'}`;
        case 'scene':
            return `scenes/${ownerId || 'unknown'}`;
        case 'global':
            return 'global';
        default:
            return 'unknown';
    }
}

/**
 * Sanitize filename component (remove special characters)
 */
export function sanitizeFilename(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/**
 * Construct full path for a take file
 * 
 * @param media - Media object
 * @param bin - Bin object
 * @param takeNumber - Take number
 * @param ownerBaseFilename - Base filename for actor (optional)
 * @returns Relative path from project root
 */
export function constructTakePath(
    media: Media,
    bin: Bin,
    takeNumber: number,
    ownerBaseFilename?: string
): string {
    const ownerFolder = getOwnerFolder(
        media.owner_type,
        media.owner_id,
        ownerBaseFilename
    );

    const mediaType = media.media_type;
    const binName = sanitizeFilename(bin.name);
    const mediaName = sanitizeFilename(media.name);
    const takeNum = String(takeNumber).padStart(3, '0');
    const ext = getExtensionForType(mediaType);

    return join(ownerFolder, mediaType, binName, `${mediaName}_${takeNum}.${ext}`);
}

/**
 * Construct directory path for a bin
 */
export function constructBinPath(
    bin: Bin,
    ownerBaseFilename?: string
): string {
    const ownerFolder = getOwnerFolder(
        bin.owner_type,
        bin.owner_id,
        ownerBaseFilename
    );

    const mediaType = bin.media_type;
    const binName = sanitizeFilename(bin.name);

    return join(ownerFolder, mediaType, binName);
}

/**
 * Construct directory path for an owner
 */
export function constructOwnerPath(
    ownerType: OwnerType,
    ownerId: string | null,
    ownerBaseFilename?: string
): string {
    return getOwnerFolder(ownerType, ownerId, ownerBaseFilename);
}

/**
 * Parse take path to extract components
 */
export function parseTakePath(path: string): {
    ownerType: OwnerType;
    ownerId: string;
    mediaType: string;
    binName: string;
    mediaName: string;
    takeNumber: number;
    ext: string;
} | null {
    const parts = path.split(/[/\\]/);

    if (parts.length < 5) return null;

    const [ownerTypeFolder, ownerId, mediaType, binName, filename] = parts;

    const ownerType: OwnerType =
        ownerTypeFolder === 'actors' ? 'actor' :
            ownerTypeFolder === 'scenes' ? 'scene' :
                ownerTypeFolder === 'global' ? 'global' : 'actor';

    const filenameParts = filename.match(/^(.+)_(\d{3})\.([^.]+)$/);
    if (!filenameParts) return null;

    const [, mediaName, takeNumStr, ext] = filenameParts;
    const takeNumber = parseInt(takeNumStr, 10);

    return {
        ownerType,
        ownerId,
        mediaType,
        binName,
        mediaName,
        takeNumber,
        ext,
    };
}
