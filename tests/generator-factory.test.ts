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

    const registry = await createDefaultGeneratorRegistry('/projects/moo', { loadAudioProvider });

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
    });

    expect(registry.list()).toEqual([]);
    expect(registry.supports('elevenlabs', 'dialogue')).toBe(false);
  });
});
