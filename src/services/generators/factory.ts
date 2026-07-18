import { getAudioProvider } from '../provider-factory.js';
import type { AudioProvider } from '../providers/provider-interface.js';
import { ElevenLabsGeneratorAdapter } from './elevenlabs-adapter.js';
import { GeneratorRegistry } from './registry.js';

export type AudioProviderLoader = (projectRoot: string) => Promise<AudioProvider>;

export interface DefaultGeneratorRegistryDependencies {
  loadAudioProvider?: AudioProviderLoader;
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
  const elevenLabs = new ElevenLabsGeneratorAdapter(await loadAudioProvider(projectRoot));

  return new GeneratorRegistry([elevenLabs]);
}
