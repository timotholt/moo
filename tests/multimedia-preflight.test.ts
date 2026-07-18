import { describe, expect, it } from 'vitest';
import { evaluateMultimediaPreflight } from '../src/services/multimedia-preflight.js';
import type { MultimediaPreflightInput } from '../src/services/multimedia-preflight.js';

const audioInput: MultimediaPreflightInput = {
  request: { id: 'line-1', assetKind: 'dialogue', prompt: 'Hold.', settings: { voiceId: 'voice-1' } },
  providerId: 'elevenlabs',
  capabilities: { providerId: 'elevenlabs', media: { dialogue: {} } },
  credentialConfigured: true,
  tools: { ffprobe: true },
  candidateCount: 2,
  perOperationCost: 0.12,
  currency: 'USD',
};

function evaluate(input: Partial<MultimediaPreflightInput> = {}) {
  return evaluateMultimediaPreflight({ ...audioInput, ...input });
}

describe('multimedia preflight', () => {
  it('readies audio and calculates maximum exposure', () => {
    expect(evaluate()).toMatchObject({
      status: 'ready',
      estimate: { providerRequests: 2, perOperation: 0.12, maximumExposure: 0.24, currency: 'USD', known: true },
    });
  });

  it('blocks when credentials are missing', () => {
    expect(evaluate({ credentialConfigured: false })).toMatchObject({ status: 'blocked' });
    expect(evaluate({ credentialConfigured: false }).checks).toContainEqual(expect.objectContaining({ code: 'credential-missing' }));
  });

  it('blocks unsupported kinds', () => {
    expect(evaluate({ request: { id: 'image-1', assetKind: 'image', prompt: 'goblin' } })).toMatchObject({ status: 'blocked' });
  });

  it('requires transparency support or a working configured postprocessor', () => {
    const request = { id: 'image-1', assetKind: 'image' as const, prompt: 'goblin', delivery: { transparency: true } };
    const capabilities = { providerId: 'image', media: { image: {} } };
    expect(evaluate({ request, providerId: 'image', capabilities })).toMatchObject({ status: 'blocked' });
    expect(evaluate({ request, providerId: 'image', capabilities, transparencyPostprocessConfigured: true, tools: { backgroundRemoval: true } })).toMatchObject({ status: 'ready' });
  });

  it.each([
    ['16:9', 1920, 1080],
    ['9:16', 1080, 1920],
  ] as const)('accepts %s video', (aspectRatio, width, height) => {
    expect(evaluate({
      request: { id: 'video-1', assetKind: 'video', prompt: 'hero', delivery: { aspectRatio, width, height, durationSeconds: 3, frameRate: 24 } },
      providerId: 'video', capabilities: { providerId: 'video', media: { video: { aspectRatios: ['16:9', '9:16'] } } }, tools: { ffprobe: true, ffmpeg: true },
    })).toMatchObject({ status: 'ready' });
  });

  it('blocks video dimensions that miss their declared ratio', () => {
    expect(evaluate({
      request: { id: 'video-1', assetKind: 'video', prompt: 'hero', delivery: { aspectRatio: '16:9', width: 1000, height: 1000 } },
      providerId: 'video', capabilities: { providerId: 'video', media: { video: { aspectRatios: ['16:9'] } } }, tools: { ffprobe: true, ffmpeg: true },
    })).toMatchObject({ status: 'blocked' });
  });

  it('warns when cost is unknown', () => {
    const result = evaluate({ perOperationCost: undefined, currency: undefined });
    expect(result).toMatchObject({ status: 'warning', estimate: { known: false } });
    expect(result.checks).toContainEqual(expect.objectContaining({ code: 'cost-estimate-unknown', status: 'warning' }));
  });

  it('blocks when the maximum exposure exceeds the budget', () => {
    expect(evaluate({ jobBudget: 0.2 })).toMatchObject({ status: 'blocked' });
    expect(evaluate({ jobBudget: 0.2 }).checks).toContainEqual(expect.objectContaining({ code: 'budget-exceeded' }));
  });
});
