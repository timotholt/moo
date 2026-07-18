import Fastify from 'fastify';
import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { clearConfigCache, setGlobalConfigPathForTesting } from '../src/services/global-config.js';
import { registerProviderRoutes } from '../src/server/routes/provider.js';

const roots: string[] = [];

afterEach(async () => {
  setGlobalConfigPathForTesting();
  clearConfigCache();
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

async function createApp() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-provider-routes-'));
  roots.push(root);
  setGlobalConfigPathForTesting(join(root, '.moo-config.json'));
  const app = Fastify();
  registerProviderRoutes(app, () => null);
  return app;
}

describe('generation provider settings routes', () => {
  it('returns full API keys intentionally and keeps OpenAI and Google settings independent', async () => {
    const app = await createApp();
    await app.inject({ method: 'PUT', url: '/api/generation/providers/openai/settings', payload: { api_key: 'openai-full-key', enabled: true, model: 'gpt-image-1' } });
    await app.inject({ method: 'PUT', url: '/api/generation/providers/google/settings', payload: { api_key: 'google-full-key', config: { region: 'us-central1' } } });

    const response = await app.inject({ method: 'GET', url: '/api/generation/providers/settings' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providers: {
        openai: { api_key: 'openai-full-key', enabled: true, model: 'gpt-image-1' },
        google: { api_key: 'google-full-key', config: { region: 'us-central1' } },
      },
    });
  });

  it('partially merges an individual provider setting record', async () => {
    const app = await createApp();
    await app.inject({ method: 'PUT', url: '/api/generation/providers/openai/settings', payload: { api_key: 'openai-full-key', model: 'gpt-image-1', config: { size: '1024x1024' } } });
    const response = await app.inject({ method: 'PUT', url: '/api/generation/providers/openai/settings', payload: { enabled: false } });
    const read = await app.inject({ method: 'GET', url: '/api/generation/providers/openai/settings' });
    await app.close();

    expect(response.json()).toEqual({ providerId: 'openai', settings: { api_key: 'openai-full-key', model: 'gpt-image-1', config: { size: '1024x1024' }, enabled: false } });
    expect(read.json()).toEqual(response.json());
  });

  it('keeps legacy ElevenLabs routes compatible with generic settings', async () => {
    const app = await createApp();
    await app.inject({ method: 'PUT', url: '/api/generation/providers/elevenlabs/settings', payload: { api_key: 'eleven-full-key', model: 'eleven_v3' } });
    const legacyRead = await app.inject({ method: 'GET', url: '/api/provider/api-key' });
    const legacyWrite = await app.inject({ method: 'POST', url: '/api/provider/api-key', payload: { apiKey: 'replacement-key' } });
    const genericRead = await app.inject({ method: 'GET', url: '/api/generation/providers/elevenlabs/settings' });
    await app.close();

    expect(legacyRead.json()).toEqual({ hasKey: true, apiKey: 'eleven-full-key' });
    expect(legacyWrite.json()).toEqual({ success: true });
    expect(genericRead.json()).toEqual({ providerId: 'elevenlabs', settings: { api_key: 'replacement-key', model: 'eleven_v3' } });
  });

  it('returns clear 400s for blank IDs and invalid settings bodies', async () => {
    const app = await createApp();
    const blank = await app.inject({ method: 'PUT', url: '/api/generation/providers/%20/settings', payload: { enabled: true } });
    const malformed = await app.inject({ method: 'PUT', url: '/api/generation/providers/openai/settings', payload: { enabled: 'yes' } });
    const unsupported = await app.inject({ method: 'PUT', url: '/api/generation/providers/openai/settings', payload: { unexpected: true } });
    await app.close();

    expect(blank).toMatchObject({ statusCode: 400 });
    expect(blank.json()).toEqual({ error: 'Provider ID is required' });
    expect(malformed).toMatchObject({ statusCode: 400 });
    expect(malformed.json()).toEqual({ error: 'enabled must be a boolean' });
    expect(unsupported).toMatchObject({ statusCode: 400 });
    expect(unsupported.json()).toEqual({ error: 'Unsupported settings field: unexpected' });
  });
});
