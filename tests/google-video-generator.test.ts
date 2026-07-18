import { describe, expect, it, vi } from 'vitest';
import { GoogleVideoGenerator } from '../src/services/generators/google-video.js';
import type { GenerationRequest, ProviderOperation } from '../src/services/generators/types.js';

const operationName = 'models/veo-3.1-generate-preview/operations/op-123';
const videoUri = 'https://generativelanguage.googleapis.com/download/video-123';

function videoRequest(
  aspectRatio: '16:9' | '9:16' = '16:9',
  durationSeconds = 8,
  resolution: '720p' | '1080p' = '720p',
): GenerationRequest {
  return {
    id: `video-${aspectRatio}`,
    assetKind: 'video',
    prompt: 'A dramatic card reveal with no text.',
    delivery: { aspectRatio, durationSeconds },
    settings: { resolution },
  };
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function submittedOperation(): ProviderOperation {
  return {
    providerId: 'google-video',
    operationId: operationName,
    requestId: 'video-16:9',
    status: 'submitted',
    providerMetadata: {
      model: 'veo-3.1-generate-preview',
      aspectRatio: '16:9',
      durationSeconds: '8',
      resolution: '720p',
    },
  };
}

describe('GoogleVideoGenerator', () => {
  it.each([
    ['16:9', 8, '1080p'],
    ['9:16', 6, '720p'],
  ] as const)('submits %s Veo video with the documented parameters', async (aspectRatio, duration, resolution) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ name: operationName }));
    const generator = new GoogleVideoGenerator('google-key', { fetch });

    const operation = await generator.submit(videoRequest(aspectRatio, duration, resolution));

    expect(operation).toMatchObject({
      providerId: 'google-video',
      operationId: operationName,
      status: 'submitted',
      providerMetadata: { aspectRatio, durationSeconds: String(duration), resolution },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:predictLongRunning',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'x-goog-api-key': 'google-key',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      instances: [{ prompt: 'A dramatic card reveal with no text.' }],
      parameters: {
        aspectRatio,
        durationSeconds: String(duration),
        resolution,
      },
    });
  });

  it('maps processing, failed, and completed long-running operations', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ name: operationName, done: false }))
      .mockResolvedValueOnce(jsonResponse({
        name: operationName,
        done: true,
        error: { code: 13, message: 'The video could not be generated', status: 'INTERNAL' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        name: operationName,
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: videoUri } }],
          },
        },
      }));
    const generator = new GoogleVideoGenerator('google-key', { fetch });
    const operation = submittedOperation();

    await expect(generator.poll(operation)).resolves.toMatchObject({ status: 'processing' });
    await expect(generator.poll(operation)).resolves.toMatchObject({
      status: 'failed',
      error: 'The video could not be generated',
    });
    await expect(generator.poll(operation)).resolves.toMatchObject({
      status: 'completed',
      providerMetadata: { videoUri },
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      { method: 'GET', headers: { 'x-goog-api-key': 'google-key' } },
    );
  });

  it('downloads a completed video with authentication and redirects enabled', async () => {
    const bytes = Buffer.from('mp4-video');
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(bytes, { status: 200 }));
    const generator = new GoogleVideoGenerator('google-key', { fetch });
    const operation: ProviderOperation = {
      ...submittedOperation(),
      status: 'completed',
      providerMetadata: { ...submittedOperation().providerMetadata, videoUri },
    };

    await expect(generator.download(operation)).resolves.toEqual({
      bytes,
      mimeType: 'video/mp4',
      providerMetadata: {
        ...operation.providerMetadata,
        provider: 'google-video',
        operationId: operationName,
      },
    });
    expect(fetch).toHaveBeenCalledWith(videoUri, {
      method: 'GET',
      headers: { 'x-goog-api-key': 'google-key' },
      redirect: 'follow',
    });
    expect(generator.capabilities()).toEqual({
      providerId: 'google-video',
      media: {
        video: {
          formats: ['video/mp4'],
          aspectRatios: ['16:9', '9:16'],
          supportsDuration: true,
          supportsFrameRate: false,
        },
      },
    });
  });

  it.each([
    [{ ...videoRequest(), assetKind: 'image' }, 'does not support image'],
    [{ ...videoRequest(), delivery: { aspectRatio: undefined, durationSeconds: 8 } }, 'aspect ratio'],
    [{ ...videoRequest(), delivery: { aspectRatio: '16:9', durationSeconds: 5 } }, '4, 6, or 8'],
    [{ ...videoRequest(), settings: { resolution: '4k' } }, '720p or 1080p'],
    [videoRequest('9:16', 6, '1080p'), 'requires an 8-second duration'],
  ] as const)('rejects invalid parameters before making an API call', async (request, message) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const generator = new GoogleVideoGenerator('google-key', { fetch });

    await expect(generator.submit(request as GenerationRequest)).rejects.toThrow(message);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports non-2xx and malformed provider responses clearly', async () => {
    const failedFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse(
      { error: { message: 'Quota exhausted' } },
      { status: 429, statusText: 'Too Many Requests' },
    ));
    await expect(new GoogleVideoGenerator('google-key', { fetch: failedFetch }).submit(videoRequest()))
      .rejects.toThrow('429 Too Many Requests - Quota exhausted');

    const malformedFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{not json', { status: 200 }));
    await expect(new GoogleVideoGenerator('google-key', { fetch: malformedFetch }).submit(videoRequest()))
      .rejects.toThrow('malformed JSON');
  });

  it('rejects malformed completed operations and invalid downloads', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse({ done: true, response: {} }));
    const generator = new GoogleVideoGenerator('google-key', { fetch });

    await expect(generator.poll(submittedOperation())).rejects.toThrow('completed without a video URI');
    await expect(generator.download(submittedOperation())).rejects.toThrow('Cannot download submitted operation');
    await expect(generator.download({
      ...submittedOperation(),
      status: 'completed',
    })).rejects.toThrow('has no video URI');
  });
});
