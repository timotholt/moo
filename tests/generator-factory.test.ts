import { describe, expect, it, vi } from 'vitest';
import { createDefaultGeneratorRegistry } from '../src/services/generators/factory.js';
import type { AudioProvider } from '../src/services/providers/provider-interface.js';

function makeAudioProvider(): AudioProvider {
  return {
    generateDialogue: vi.fn(),
    generateMusic: vi.fn(),
    generateSFX: vi.fn(),
    getQuota: vi.fn(),
    getVoices: vi.fn(),
  };
}

describe('default generator registry factory', () => {
  it('injects the audio-provider loader and registers ElevenLabs audio capabilities', async () => {
    const audioProvider = makeAudioProvider();
    const loadAudioProvider = vi.fn().mockResolvedValue(audioProvider);

    const registry = await createDefaultGeneratorRegistry('/projects/moo', {
      loadAudioProvider,
      loadProviderSettings: vi.fn().mockResolvedValue(undefined),
    });

    expect(loadAudioProvider).toHaveBeenCalledOnce();
    expect(loadAudioProvider).toHaveBeenCalledWith('/projects/moo');
    expect(registry.get('elevenlabs')?.capabilities()).toMatchObject({
      providerId: 'elevenlabs',
      media: { dialogue: {}, music: {}, sfx: {} },
      voices: true,
      quota: true,
    });
  });

  it('does not advertise image or video support from the ElevenLabs adapter', async () => {
    const registry = await createDefaultGeneratorRegistry('/projects/moo', {
      loadAudioProvider: vi.fn().mockResolvedValue(makeAudioProvider()),
      loadProviderSettings: vi.fn().mockResolvedValue(undefined),
    });

    expect(registry.supports('elevenlabs', 'dialogue')).toBe(true);
    expect(registry.supports('elevenlabs', 'music')).toBe(true);
    expect(registry.supports('elevenlabs', 'sfx')).toBe(true);
    expect(registry.supports('elevenlabs', 'image')).toBe(false);
    expect(registry.supports('elevenlabs', 'video')).toBe(false);
  });

  it('still creates a usable empty registry when ElevenLabs is unconfigured', async () => {
    const registry = await createDefaultGeneratorRegistry('/projects/moo', {
      loadAudioProvider: vi.fn().mockRejectedValue(new Error('ElevenLabs API key not configured')),
      loadProviderSettings: vi.fn().mockResolvedValue(undefined),
    });

    expect(registry.list()).toEqual([]);
    expect(registry.supports('elevenlabs', 'dialogue')).toBe(false);
  });

  it('registers OpenAI and Google provider families from shared credentials', async () => {
    const loadProviderSettings = vi.fn(async (providerId: string) => (
      providerId === 'openai'
        ? {
            api_key: 'openai-key',
            enabled: true,
            config: { image_model: 'gpt-image-2', video_model: 'sora-2-pro' },
          }
        : {
            api_key: 'google-key',
            enabled: true,
            config: {
              image_model: 'gemini-3.1-flash-image',
              video_model: 'veo-3.1-generate-preview',
            },
          }
    ));
    const registry = await createDefaultGeneratorRegistry('/projects/moo', {
      loadAudioProvider: vi.fn().mockRejectedValue(new Error('not configured')),
      loadProviderSettings,
    });

    expect(registry.supports('openai', 'image')).toBe(true);
    expect(registry.supports('openai', 'video')).toBe(true);
    expect(registry.supports('google', 'image')).toBe(true);
    expect(registry.supports('google', 'video')).toBe(true);
    expect(registry.get('openai')?.capabilities().media.image?.supportsTransparency).toBe(false);
    expect(loadProviderSettings).toHaveBeenCalledWith('openai');
    expect(loadProviderSettings).toHaveBeenCalledWith('google');
  });

  it('does not register disabled or keyless provider families', async () => {
    const registry = await createDefaultGeneratorRegistry('/projects/moo', {
      loadAudioProvider: vi.fn().mockRejectedValue(new Error('not configured')),
      loadProviderSettings: vi.fn(async (providerId: string) => (
        providerId === 'openai' ? { api_key: 'key', enabled: false } : { enabled: true }
      )),
    });

    expect(registry.list()).toEqual([]);
  });
});
