/**
 * Default Block Resolution
 * 
 * Resolves provider settings for content generation by walking up the
 * inheritance chain: Section → Owner (Actor/Scene) → Global → Hardcoded
 */

import type { ContentType, DefaultBlock, DefaultBlocks } from '../shared/schemas/index.js';
import type { Actor } from '../shared/schemas/actor.schema.js';
import type { Scene } from '../shared/schemas/scene.schema.js';
import type { Section } from '../shared/schemas/section.schema.js';
import type { Defaults } from '../shared/schemas/defaults.schema.js';

/**
 * Hardcoded fallback defaults (used when nothing else is configured)
 */
const HARDCODED_DEFAULTS: Record<ContentType, DefaultBlock> = {
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
    resolvedFrom: 'section' | 'owner' | 'global' | 'hardcoded';
    sourceName?: string;
};

/**
 * Resolve default block for a content type
 * 
 * Resolution order:
 * 1. Section's default_blocks[contentType] (if not "inherit")
 * 2. Owner's (Actor/Scene) default_blocks[contentType] (if not "inherit")
 * 3. Global defaults.content_types[contentType]
 * 4. Hardcoded fallback
 * 
 * @param contentType - Type of content being generated
 * @param section - Section containing the content
 * @param owner - Owner (Actor or Scene) of the section
 * @param globalDefaults - Global defaults from defaults.json
 * @returns Resolved settings and provenance info
 */
export function resolveDefaultBlock(
    contentType: ContentType,
    section?: Section | null,
    owner?: Actor | Scene | null,
    globalDefaults?: Defaults | null
): ResolvedBlock {
    // 1. Check section
    if (section?.default_blocks?.[contentType]) {
        const sectionBlock = section.default_blocks[contentType];
        if (sectionBlock.provider !== 'inherit') {
            return {
                settings: sectionBlock,
                resolvedFrom: 'section',
                sourceName: section.name,
            };
        }
    }

    // 2. Check owner (Actor or Scene)
    if (owner?.default_blocks?.[contentType]) {
        const ownerBlock = owner.default_blocks[contentType];
        if (ownerBlock.provider !== 'inherit') {
            return {
                settings: ownerBlock,
                resolvedFrom: 'owner',
                sourceName: 'display_name' in owner ? owner.display_name : owner.name,
            };
        }
    }

    // 3. Check global defaults
    if (globalDefaults?.content_types?.[contentType]) {
        return {
            settings: globalDefaults.content_types[contentType],
            resolvedFrom: 'global',
            sourceName: 'Global Defaults',
        };
    }

    // 4. Hardcoded fallback
    return {
        settings: HARDCODED_DEFAULTS[contentType],
        resolvedFrom: 'hardcoded',
        sourceName: 'System Defaults',
    };
}

/**
 * Merge default block with overrides
 * Useful for applying content-specific overrides on top of inherited settings
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
 * Get all content types that have default blocks configured
 */
export function getConfiguredContentTypes(
    defaultBlocks?: DefaultBlocks | null
): ContentType[] {
    if (!defaultBlocks) return [];
    return Object.keys(defaultBlocks).filter(
        (key) => !isInheritBlock(defaultBlocks[key as ContentType])
    ) as ContentType[];
}
