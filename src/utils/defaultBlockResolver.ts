/**
 * Default Block Resolution
 * 
 * Resolves provider settings for media generation by walking up the
 * inheritance chain: Bin → Owner (Actor/Scene) → Global → Hardcoded
 */

import type { MediaType, DefaultBlock, DefaultBlocks } from '../shared/schemas/index.js';
import type { Media } from '../shared/schemas/media.schema.js';
import type { Actor } from '../shared/schemas/actor.schema.js';
import type { Scene } from '../shared/schemas/scene.schema.js';
import type { Bin } from '../shared/schemas/bin.schema.js';
import type { Defaults } from '../shared/schemas/defaults.schema.js';

/**
 * Hardcoded fallback defaults (used when nothing else is configured)
 */
const HARDCODED_DEFAULTS: Record<MediaType, DefaultBlock> = {
    dialogue: {
        provider: 'elevenlabs',
        model_id: 'eleven_multilingual_v2',
        stability: 0.5,
        similarity_boost: 0.75,
        min_candidates: 1,
        approval_count_default: 1,
    },
    music: {
        provider: 'elevenlabs',
        duration_seconds: 30,
        min_candidates: 1,
        approval_count_default: 1,
    },
    sfx: {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
    },
    image: {
        provider: 'openai',
        model: 'dall-e-3',
        style: 'natural',
        quality: 'standard',
        size: '1024x1024',
        min_candidates: 1,
        approval_count_default: 1,
    },
    video: {
        provider: 'runway',
        model: 'gen-3-alpha',
        duration_seconds: 5,
        aspect_ratio: '16:9',
        fps: 24,
        min_candidates: 1,
        approval_count_default: 1,
    },
};

export type ResolvedBlock = {
    settings: DefaultBlock;
    resolvedFrom: 'media' | 'bin' | 'owner' | 'global' | 'hardcoded';
    sourceName?: string;
};

/**
 * Deep merge templates object
 */
function mergeTemplates(base: any, overrides: any) {
    if (!overrides) return base;
    return {
        ...(base || {}),
        ...overrides
    };
}

/**
 * Resolve default block for a media type using property-level inheritance
 * 
 * Resolution Order:
 * 1. Hardcoded Fallback (Base)
 * 2. Global Defaults
 * 3. Owner (Actor/Scene) Overrides
 * 4. Bin Overrides
 * 5. Media Overrides
 * 
 * A property is only overridden if it is explicitly defined and not set to "inherit"
 * (Note: "inherit" primarily applies to the "provider" field in this version)
 */
export function resolveDefaultBlock(
    mediaType: MediaType,
    media?: Media | null,
    bin?: Bin | null,
    owner?: Actor | Scene | null,
    globalDefaults?: Defaults | null
): ResolvedBlock {
    let settings = { ...HARDCODED_DEFAULTS[mediaType] };
    let resolvedFrom: ResolvedBlock['resolvedFrom'] = 'hardcoded';
    let sourceName = 'System Defaults';

    // 1. Global Defaults
    if (globalDefaults?.content_types?.[mediaType]) {
        const globalBlock = globalDefaults.content_types[mediaType];
        const { templates, ...rest } = globalBlock;
        settings = {
            ...settings,
            ...rest,
            templates: mergeTemplates(settings.templates, templates)
        };
        resolvedFrom = 'global';
        sourceName = 'Global Defaults';
    }

    // 2. Owner Overrides
    if (owner?.default_blocks?.[mediaType]) {
        const ownerBlock = owner.default_blocks[mediaType];
        if (ownerBlock.provider !== 'inherit') {
            const { templates, ...rest } = ownerBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
            resolvedFrom = 'owner';
            sourceName = 'display_name' in owner ? owner.display_name : owner.name;
        } else {
            // Inherit provider from global, but merge other fields
            const { provider, templates, ...rest } = ownerBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
        }
    }

    // 3. Bin Overrides
    if (bin?.default_blocks?.[mediaType]) {
        const binBlock = bin.default_blocks[mediaType];
        if (binBlock.provider !== 'inherit') {
            const { templates, ...rest } = binBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
            resolvedFrom = 'bin';
            sourceName = bin.name;
        } else {
            const { provider, templates, ...rest } = binBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
        }
    }

    // 4. Media Overrides
    if (media?.default_blocks?.[mediaType]) {
        const mediaBlock = media.default_blocks[mediaType];
        if (mediaBlock.provider !== 'inherit') {
            const { templates, ...rest } = mediaBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
            resolvedFrom = 'media';
            sourceName = media.name;
        } else {
            const { provider, templates, ...rest } = mediaBlock;
            settings = {
                ...settings,
                ...rest,
                templates: mergeTemplates(settings.templates, templates)
            };
        }
    }

    return {
        settings,
        resolvedFrom,
        sourceName,
    };
}

/**
 * Merge default block with overrides
 * Useful for applying media-specific overrides on top of inherited settings
 */
export function mergeDefaultBlocks(
    base: DefaultBlock,
    overrides: Partial<DefaultBlock>
): DefaultBlock {
    return {
        ...base,
        ...overrides,
    };
}

/**
 * Check if a default block is set to inherit
 */
export function isInheritBlock(block?: DefaultBlock | null): boolean {
    return block?.provider === 'inherit';
}

/**
 * Get all media types that have default blocks configured
 */
export function getConfiguredMediaTypes(
    defaultBlocks?: DefaultBlocks | null
): MediaType[] {
    if (!defaultBlocks) return [];
    return Object.keys(defaultBlocks).filter(
        (key) => !isInheritBlock(defaultBlocks[key as MediaType])
    ) as MediaType[];
}
