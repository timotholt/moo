import fs from 'fs-extra';
import { dirname, join } from 'path';

// Global config stored in app root (not per-project)
const DEFAULT_GLOBAL_CONFIG_PATH = join(process.cwd(), '.moo-config.json');

export interface GenerationProviderSettings {
  /** Stored locally and intentionally returned verbatim to the local authoring UI. */
  api_key?: string;
  enabled?: boolean;
  model?: string;
  config?: Record<string, unknown>;
}

export interface GlobalConfig {
  elevenlabs_api_key?: string;
  generation_providers?: Record<string, GenerationProviderSettings>;
  llm?: {
    provider: string;
    api_key: string;
    model?: string;
    system_prompts?: { generate?: string; improve?: string };
  };
}

let cachedConfig: GlobalConfig | null = null;
let globalConfigPath = DEFAULT_GLOBAL_CONFIG_PATH;
let saveQueue = Promise.resolve();

function cloneConfig(config: GlobalConfig): GlobalConfig {
  return structuredClone(config);
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  if (cachedConfig) {
    return cloneConfig(cachedConfig);
  }

  try {
    if (await fs.pathExists(globalConfigPath)) {
      cachedConfig = await fs.readJson(globalConfigPath);
      return cloneConfig(cachedConfig || {});
    }
  } catch (err) {
    console.error('Failed to load global config:', err);
  }

  return {};
}

export function saveGlobalConfig(config: Partial<GlobalConfig>): Promise<void> {
  const write = saveQueue.then(async () => {
    const existing = await loadGlobalConfig();
    const merged: GlobalConfig = {
      ...existing,
      ...config,
      ...(config.generation_providers
        ? {
            generation_providers: {
              ...existing.generation_providers,
              ...config.generation_providers,
            },
          }
        : {}),
    };
    const tempPath = `${globalConfigPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.ensureDir(dirname(globalConfigPath));
    try {
      await fs.writeJson(tempPath, merged, { spaces: 2 });
      await fs.move(tempPath, globalConfigPath, { overwrite: true });
      cachedConfig = merged;
    } catch (error) {
      await fs.remove(tempPath);
      throw error;
    }
  });
  saveQueue = write.catch(() => undefined);
  return write;
}

export async function getElevenLabsApiKey(): Promise<string | undefined> {
  const config = await loadGlobalConfig();
  return config.generation_providers?.elevenlabs?.api_key ?? config.elevenlabs_api_key;
}

export async function setElevenLabsApiKey(apiKey: string): Promise<void> {
  await setGenerationProviderSettings('elevenlabs', { api_key: apiKey });
}

export async function getGenerationProviderSettings(providerId: string): Promise<GenerationProviderSettings | undefined> {
  const settings = (await loadGlobalConfig()).generation_providers?.[providerId];
  return settings ? structuredClone(settings) : undefined;
}

export async function listGenerationProviderSettings(): Promise<Record<string, GenerationProviderSettings>> {
  const config = await loadGlobalConfig();
  const providers = structuredClone(config.generation_providers || {});
  if (config.elevenlabs_api_key && !providers.elevenlabs?.api_key) {
    providers.elevenlabs = {
      ...providers.elevenlabs,
      api_key: config.elevenlabs_api_key,
    };
  }
  return providers;
}

export async function setGenerationProviderSettings(
  providerId: string,
  settings: GenerationProviderSettings,
): Promise<void> {
  if (!providerId.trim()) {
    throw new Error('Generation provider ID is required');
  }

  const existing = await loadGlobalConfig();
  const current = existing.generation_providers?.[providerId] || {};
  const providerSettings = { ...current, ...settings };
  const generation_providers = {
    ...existing.generation_providers,
    [providerId]: providerSettings,
  };

  // Keep legacy consumers and already-written config files compatible while
  // making the generic provider map the canonical location for new writes.
  await saveGlobalConfig({
    generation_providers,
    ...(providerId === 'elevenlabs' && settings.api_key !== undefined
      ? { elevenlabs_api_key: settings.api_key }
      : {}),
  });
}

export async function getLLMSettings(): Promise<NonNullable<GlobalConfig['llm']> | undefined> {
  return (await loadGlobalConfig()).llm;
}

export async function setLLMSettings(settings: NonNullable<GlobalConfig['llm']>): Promise<void> {
  await saveGlobalConfig({ llm: settings });
}

// Clear cache (useful for testing)
export function clearConfigCache(): void {
  cachedConfig = null;
}

/** Test-only override; production callers always use the app-root config file. */
export function setGlobalConfigPathForTesting(path?: string): void {
  globalConfigPath = path || DEFAULT_GLOBAL_CONFIG_PATH;
  clearConfigCache();
}
