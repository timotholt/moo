import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import {
  clearConfigCache,
  getElevenLabsApiKey,
  getGenerationProviderSettings,
  getLLMSettings,
  listGenerationProviderSettings,
  setElevenLabsApiKey,
  setGenerationProviderSettings,
  setGlobalConfigPathForTesting,
  setLLMSettings,
} from '../src/services/global-config.js';

const testDirectory = join(process.cwd(), `test-global-config-${Date.now()}`);
const configPath = join(testDirectory, '.moo-config.json');

describe('global generator credentials', () => {
  beforeEach(async () => {
    await fs.ensureDir(testDirectory);
    setGlobalConfigPathForTesting(configPath);
  });

  afterEach(async () => {
    setGlobalConfigPathForTesting();
    await fs.remove(testDirectory);
  });

  it('reads an existing legacy ElevenLabs key', async () => {
    await fs.writeJson(configPath, { elevenlabs_api_key: 'legacy-key' });
    clearConfigCache();

    await expect(getElevenLabsApiKey()).resolves.toBe('legacy-key');
  });

  it('writes ElevenLabs credentials in both generic and legacy-compatible locations', async () => {
    await setElevenLabsApiKey('eleven-key');

    await expect(getElevenLabsApiKey()).resolves.toBe('eleven-key');
    await expect(getGenerationProviderSettings('elevenlabs')).resolves.toEqual({ api_key: 'eleven-key' });
    await expect(fs.readJson(configPath)).resolves.toMatchObject({
      elevenlabs_api_key: 'eleven-key',
      generation_providers: { elevenlabs: { api_key: 'eleven-key' } },
    });
  });

  it('keeps independent OpenAI and Google provider settings', async () => {
    await setGenerationProviderSettings('openai', { api_key: 'openai-key', enabled: true, model: 'gpt-image-1' });
    await setGenerationProviderSettings('google', { api_key: 'google-key', enabled: false, config: { region: 'us-central1' } });

    await expect(listGenerationProviderSettings()).resolves.toEqual({
      openai: { api_key: 'openai-key', enabled: true, model: 'gpt-image-1' },
      google: { api_key: 'google-key', enabled: false, config: { region: 'us-central1' } },
    });
  });

  it('preserves LLM settings when provider credentials change', async () => {
    const llm = { provider: 'groq', api_key: 'groq-key', model: 'llama', system_prompts: { improve: 'Improve it' } };
    await setLLMSettings(llm);
    await setGenerationProviderSettings('openai', { api_key: 'openai-key' });

    await expect(getLLMSettings()).resolves.toEqual(llm);
  });

  it('resets cache when the test config path changes', async () => {
    await setElevenLabsApiKey('first-key');
    const secondPath = join(testDirectory, 'second-config.json');
    await fs.writeJson(secondPath, { elevenlabs_api_key: 'second-key' });

    setGlobalConfigPathForTesting(secondPath);
    await expect(getElevenLabsApiKey()).resolves.toBe('second-key');
  });
});
