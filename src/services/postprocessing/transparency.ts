import { getGenerationProviderSettings } from '../global-config.js';
import type {
  DeliveryRequirements,
  GeneratedAsset,
  MediaCapability,
} from '../generators/types.js';
import { analyzePngAlpha } from '../inspection/png-alpha.js';
import {
  LocalBackgroundRemovalPostprocessor,
  type GeneratedAssetPostprocessor,
} from './background-removal.js';

export async function createConfiguredTransparencyPostprocessor(): Promise<
  GeneratedAssetPostprocessor | undefined
> {
  const settings = await getGenerationProviderSettings('background-removal');
  if (settings?.enabled !== true) return undefined;

  const executable = stringConfig(settings.config, 'executable');
  const version = stringConfig(settings.config, 'version');
  const configLabel = stringConfig(settings.config, 'config_label');
  return new LocalBackgroundRemovalPostprocessor({
    ...(executable ? { executable } : {}),
    ...(version ? { version } : {}),
    ...(configLabel ? { configLabel } : {}),
  });
}

/**
 * Providers that cannot create alpha receive the same delivery contract with
 * only the transparency flag removed. The original requested contract remains
 * durable in MOO's operation ledger.
 */
export function providerDeliveryRequirements(
  delivery: DeliveryRequirements | undefined,
  capability: MediaCapability | undefined,
  postprocessorConfigured: boolean,
): DeliveryRequirements | undefined {
  if (!delivery?.transparency || capability?.supportsTransparency === true) return delivery;
  if (!postprocessorConfigured) {
    throw new Error('Transparent image generation requires configured background removal');
  }
  return { ...delivery, transparency: undefined };
}

/** Return an already-transparent PNG unchanged; otherwise run and validate the configured tool. */
export async function ensureRequestedTransparency(
  asset: GeneratedAsset,
  delivery: DeliveryRequirements | undefined,
  postprocessor: GeneratedAssetPostprocessor | undefined,
): Promise<GeneratedAsset> {
  if (!delivery?.transparency) return asset;

  if (canonicalMime(asset.mimeType) === 'image/png') {
    const alpha = analyzePngAlpha(asset.bytes);
    if (alpha.hasTransparentPixels) return asset;
  }
  if (!postprocessor) {
    throw new Error('Generated image has no transparent pixels and background removal is not configured');
  }

  const processed = await postprocessor.process(asset);
  if (canonicalMime(processed.mimeType) !== 'image/png') {
    throw new Error('Transparency post-processing did not produce a PNG');
  }
  const alpha = analyzePngAlpha(processed.bytes);
  if (!alpha.hasTransparentPixels) {
    throw new Error('Transparency post-processing produced no transparent pixels');
  }
  return processed;
}

function canonicalMime(value: string): string {
  return value.split(';', 1)[0].trim().toLowerCase();
}

function stringConfig(
  config: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
