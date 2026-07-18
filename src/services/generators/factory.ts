import { getAudioProvider } from '../provider-factory.js';
import {
  getGenerationProviderSettings,
  type GenerationProviderSettings,
} from '../global-config.js';
import type { AudioProvider } from '../providers/provider-interface.js';
import { ElevenLabsGeneratorAdapter } from './elevenlabs-adapter.js';
import { GoogleImageGenerator } from './google-image.js';
import { GoogleVideoGenerator } from './google-video.js';
import { OpenAIImageGenerator } from './openai-image.js';
import { OpenAIVideoGenerator } from './openai-video.js';
import { ProviderFamilyGenerator } from './provider-family.js';
import { GeneratorRegistry } from './registry.js';
import { ProviderOutputStore } from '../provider-output-store.js';

export type AudioProviderLoader = (projectRoot: string) => Promise<AudioProvider>;
export type GenerationProviderSettingsLoader = (
  providerId: string,
) => Promise<GenerationProviderSettings | undefined>;

export interface DefaultGeneratorRegistryDependencies {
  loadAudioProvider?: AudioProviderLoader;
  loadProviderSettings?: GenerationProviderSettingsLoader;
}

/**
 * Build MOO's baseline provider registry for a project.
 *
 * New providers are appended here as independent registrations, so callers
 * continue to ask this factory for one registry rather than learning each
 * provider's construction details.
 */
export async function createDefaultGeneratorRegistry(
  projectRoot: string,
  dependencies: DefaultGeneratorRegistryDependencies = {},
): Promise<GeneratorRegistry> {
  const loadAudioProvider = dependencies.loadAudioProvider ?? getAudioProvider;
  const loadProviderSettings = dependencies.loadProviderSettings ?? getGenerationProviderSettings;
  const registry = new GeneratorRegistry();
  const providerOutputStore = new ProviderOutputStore(projectRoot);
  try {
    registry.register(new ElevenLabsGeneratorAdapter(await loadAudioProvider(projectRoot)));
  } catch {
    // Provider availability is a capability/preflight concern. Returning the
    // remaining registry lets projects open and reconcile other providers even
    // when ElevenLabs is not configured.
  }

  const [openai, google] = await Promise.all([
    loadProviderSettings('openai'),
    loadProviderSettings('google'),
  ]);

  if (providerIsEnabled(openai)) {
    const imageModel = configuredModel(openai, 'image_model', 'gpt-image');
    const videoModel = configuredModel(openai, 'video_model', 'sora');
    registry.register(new ProviderFamilyGenerator('openai', [
      new OpenAIImageGenerator({
        apiKey: openai.api_key!,
        outputStore: providerOutputStore,
        ...(imageModel ? { model: imageModel } : {}),
      }),
      new OpenAIVideoGenerator({ apiKey: openai.api_key!, ...(videoModel ? { model: videoModel } : {}) }),
    ]));
  }

  if (providerIsEnabled(google)) {
    const imageModel = configuredModel(google, 'image_model', 'gemini');
    const videoModel = configuredModel(google, 'video_model', 'veo');
    registry.register(new ProviderFamilyGenerator('google', [
      new GoogleImageGenerator(google.api_key!, imageModel, globalThis.fetch, providerOutputStore),
      new GoogleVideoGenerator(google.api_key!, videoModel ? { model: videoModel } : {}),
    ]));
  }

  return registry;
}

function providerIsEnabled(
  settings: GenerationProviderSettings | undefined,
): settings is GenerationProviderSettings & { api_key: string } {
  return settings?.enabled !== false && Boolean(settings?.api_key?.trim());
}

function configuredModel(
  settings: GenerationProviderSettings,
  configKey: string,
  expectedPrefix: string,
): string | undefined {
  const scoped = settings.config?.[configKey];
  if (typeof scoped === 'string' && scoped.trim()) return scoped.trim();
  if (settings.model?.trim().startsWith(expectedPrefix)) return settings.model.trim();
  return undefined;
}
