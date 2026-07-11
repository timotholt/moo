import fs from 'fs-extra';
import { join } from 'path';

// Global config stored in app root (not per-project)
const GLOBAL_CONFIG_PATH = join(process.cwd(), '.moo-config.json');

interface GlobalConfig {
  elevenlabs_api_key?: string;
  llm?: {
    provider: string;
    api_key: string;
    model?: string;
    system_prompts?: { generate?: string; improve?: string };
  };
}

let cachedConfig: GlobalConfig | null = null;

export async function loadGlobalConfig(): Promise<GlobalConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    if (await fs.pathExists(GLOBAL_CONFIG_PATH)) {
      cachedConfig = await fs.readJson(GLOBAL_CONFIG_PATH);
      return cachedConfig || {};
    }
  } catch (err) {
    console.error('Failed to load global config:', err);
  }

  return {};
}

export async function saveGlobalConfig(config: Partial<GlobalConfig>): Promise<void> {
  const existing = await loadGlobalConfig();
  const merged = { ...existing, ...config };
  await fs.writeJson(GLOBAL_CONFIG_PATH, merged, { spaces: 2 });
  cachedConfig = merged;
}

export async function getElevenLabsApiKey(): Promise<string | undefined> {
  const config = await loadGlobalConfig();
  return config.elevenlabs_api_key;
}

export async function setElevenLabsApiKey(apiKey: string): Promise<void> {
  await saveGlobalConfig({ elevenlabs_api_key: apiKey });
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
