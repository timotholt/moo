import type { AssetKind } from './generators/types.js';

export const PROVIDER_COST_SOURCE_AS_OF = '2026-07-17' as const;
export const PROVIDER_COST_CURRENCY = 'USD' as const;

export interface ProviderCostInput {
  providerId: string;
  assetKind: AssetKind;
  model?: string;
  quality?: string;
  width?: number;
  height?: number;
  imageSize?: string;
  durationSeconds?: number;
  resolution?: string;
  profile?: string;
}

export interface ProviderOperationCostEstimate {
  known: boolean;
  currency: typeof PROVIDER_COST_CURRENCY;
  sourceAsOf: typeof PROVIDER_COST_SOURCE_AS_OF;
  model?: string;
  profile?: string;
  unit?: 'image' | 'second';
  rate?: number;
  perOperation?: number;
}

const OPENAI_IMAGE_RATES = {
  low: { square: 0.006, rectangular: 0.005 },
  medium: { square: 0.053, rectangular: 0.041 },
  high: { square: 0.211, rectangular: 0.165 },
} as const;

const GOOGLE_IMAGE_RATES: Readonly<Record<string, number>> = {
  '0.5K': 0.045,
  '1K': 0.067,
  '2K': 0.101,
  '4K': 0.151,
};

const GOOGLE_VIDEO_RATES = {
  standard: { '720p': 0.40, '1080p': 0.40 },
  fast: { '720p': 0.10, '1080p': 0.12 },
  lite: { '720p': 0.05, '1080p': 0.08 },
} as const;

/**
 * Conservative provider-cost lookup. A price is returned only when every
 * billable dimension maps to the dated table; unknown models and profiles are
 * intentionally not approximated.
 */
export function estimateProviderOperationCost(
  input: ProviderCostInput,
): ProviderOperationCostEstimate {
  const providerId = input.providerId.trim().toLowerCase();
  const model = input.model?.trim();
  const base = {
    known: false,
    currency: PROVIDER_COST_CURRENCY,
    sourceAsOf: PROVIDER_COST_SOURCE_AS_OF,
    ...(model ? { model } : {}),
  } satisfies ProviderOperationCostEstimate;

  if (providerId === 'openai' && input.assetKind === 'image') {
    if (model !== 'gpt-image-2') return base;
    const quality = input.quality?.trim().toLowerCase();
    if (quality !== 'low' && quality !== 'medium' && quality !== 'high') return base;
    const shape = openAIImageShape(input.width, input.height);
    if (!shape) return base;
    return knownImageCost(base, OPENAI_IMAGE_RATES[quality][shape], quality);
  }

  if (providerId === 'openai' && input.assetKind === 'video') {
    const resolution = normalizeResolution(input.resolution);
    const durationSeconds = positiveDuration(input.durationSeconds);
    if (!resolution || durationSeconds === undefined) return base;

    let rate: number | undefined;
    if (model === 'sora-2' && resolution === '720p') rate = 0.10;
    if (model === 'sora-2-pro') rate = resolution === '720p' ? 0.30 : 0.70;
    if (rate === undefined) return base;
    return knownTimedCost(base, rate, durationSeconds, resolution);
  }

  if (providerId === 'google' && input.assetKind === 'image') {
    if (model !== 'gemini-3.1-flash-image') return base;
    const imageSize = normalizeImageSize(input.imageSize);
    const rate = imageSize ? GOOGLE_IMAGE_RATES[imageSize] : undefined;
    if (rate === undefined || imageSize === undefined) return base;
    return knownImageCost(base, rate, imageSize);
  }

  if (providerId === 'google' && input.assetKind === 'video') {
    const resolution = normalizeResolution(input.resolution);
    const durationSeconds = positiveDuration(input.durationSeconds);
    const profile = googleVideoProfile(model, input.profile);
    if (!resolution || durationSeconds === undefined || !profile) return base;
    const rate = GOOGLE_VIDEO_RATES[profile][resolution];
    return knownTimedCost(base, rate, durationSeconds, `${profile}/${resolution}`);
  }

  return base;
}

function openAIImageShape(
  width: number | undefined,
  height: number | undefined,
): 'square' | 'rectangular' | undefined {
  if (width === 1024 && height === 1024) return 'square';
  if (
    (width === 1024 && height === 1536)
    || (width === 1536 && height === 1024)
  ) return 'rectangular';
  return undefined;
}

function normalizeImageSize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  return Object.hasOwn(GOOGLE_IMAGE_RATES, normalized) ? normalized : undefined;
}

function normalizeResolution(value: string | undefined): '720p' | '1080p' | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === '720p' || normalized === '1080p' ? normalized : undefined;
}

function positiveDuration(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function googleVideoProfile(
  model: string | undefined,
  explicitProfile: string | undefined,
): keyof typeof GOOGLE_VIDEO_RATES | undefined {
  const normalizedModel = model?.trim().toLowerCase();
  const inferred = normalizedModel && /^veo-3\.1(?:-(fast|lite))?(?:-generate)?(?:-preview|-\d+)?$/.exec(normalizedModel);
  if (!inferred) return undefined;
  const modelProfile = inferred[1] === 'fast' || inferred[1] === 'lite'
    ? inferred[1]
    : 'standard';
  if (explicitProfile === undefined) return modelProfile;
  const normalizedProfile = explicitProfile.trim().toLowerCase();
  if (
    normalizedProfile !== 'standard'
    && normalizedProfile !== 'fast'
    && normalizedProfile !== 'lite'
  ) return undefined;
  return normalizedProfile === modelProfile ? normalizedProfile : undefined;
}

function knownImageCost(
  base: ProviderOperationCostEstimate,
  rate: number,
  profile: string,
): ProviderOperationCostEstimate {
  return {
    ...base,
    known: true,
    profile,
    unit: 'image',
    rate,
    perOperation: rate,
  };
}

function knownTimedCost(
  base: ProviderOperationCostEstimate,
  rate: number,
  durationSeconds: number,
  profile: string,
): ProviderOperationCostEstimate {
  return {
    ...base,
    known: true,
    profile,
    unit: 'second',
    rate,
    perOperation: roundUsd(rate * durationSeconds),
  };
}

function roundUsd(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}
