import { describe, expect, it, vi } from 'vitest';
import { OpenAIVideoGenerator } from '../src/services/generators/openai-video.js';
import type { GenerationRequest, ProviderOperation } from '../src/services/generators/types.js';

function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  requestId?: string,
): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (requestId) {
    headers.set('x-request-id', requestId);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function videoRequest(
  delivery: GenerationRequest['delivery'] = {
    aspectRatio: '16:9',
    durationSeconds: 8,
    format: 'mp4',
  },
): GenerationRequest {
  return {
    id: 'request-1',
    assetKind: 'video',
    prompt: 'A slow orbital shot over a neon city.',
    delivery,
  };
}

describe('OpenAIVideoGenerator', () => {
  it('submits, polls, and downloads an asynchronous Sora video', async () => {
    const videoBytes = Buffer.from('mp4-video');
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({
        id: 'video_123',
        status: 'queued',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        progress: 0,
      }, {}, 'req_submit'))
      .mockResolvedValueOnce(jsonResponse({
        id: 'video_123',
        status: 'in_progress',
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        progress: 42,
      }, {}, 'req_poll'))
      .mockResolvedValueOnce(new Response(videoBytes, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'x-request-id': 'req_download',
        },
      }));
    const generator = new OpenAIVideoGenerator({ apiKey: 'openai-key', fetch });

    const submitted = await generator.submit(videoRequest());
    expect(submitted).toEqual({
      providerId: 'openai-video',
      operationId: 'video_123',
      requestId: 'request-1',
      status: 'submitted',
      providerMetadata: {
        progress: 0,
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        openaiRequestId: 'req_submit',
      },
    });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
      model: 'sora-2',
      prompt: 'A slow orbital shot over a neon city.',
      size: '1280x720',
      seconds: 8,
    });

    const processing = await generator.poll(submitted);
    expect(processing).toMatchObject({
      status: 'processing',
      providerMetadata: {
        progress: 42,
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        openaiRequestId: 'req_poll',
      },
    });

    const completed = { ...processing, status: 'completed' as const };
    await expect(generator.download(completed)).resolves.toEqual({
      bytes: videoBytes,
      mimeType: 'video/mp4',
      providerMetadata: {
        progress: 42,
        model: 'sora-2',
        size: '1280x720',
        seconds: 8,
        openaiRequestId: 'req_poll',
        downloadOpenaiRequestId: 'req_download',
      },
    });
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://api.openai.com/v1/videos',
      'https://api.openai.com/v1/videos/video_123',
      'https://api.openai.com/v1/videos/video_123/content',
    ]);
  });

  it('maps portrait and landscape profiles, including pro-only 1080p', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementation(async () => jsonResponse({ id: 'video_profile', status: 'queued' }));
    const generator = new OpenAIVideoGenerator({
      apiKey: 'openai-key',
      model: 'sora-2-pro',
      fetch,
    });

    await generator.submit(videoRequest({
      width: 720,
      height: 1280,
      aspectRatio: '9:16',
      durationSeconds: 4,
    }));
    await generator.submit(videoRequest({
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
      durationSeconds: 12,
    }));
    await generator.submit(videoRequest({
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      durationSeconds: 16,
    }));
    await generator.submit(videoRequest({
      width: 1280,
      height: 720,
      aspectRatio: '16:9',
      durationSeconds: 20,
    }));

    const bodies = fetch.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map((body) => body.size)).toEqual([
      '720x1280',
      '1920x1080',
      '1080x1920',
      '1280x720',
    ]);
    expect(bodies.map((body) => body.seconds)).toEqual([4, 12, 16, 20]);
  });

  it.each([
    ['queued', 'submitted'],
    ['in_progress', 'processing'],
    ['completed', 'completed'],
  ] as const)('maps provider status %s to %s', async (providerStatus, expectedStatus) => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValue(jsonResponse({ id: 'video_status', status: providerStatus }));
    const generator = new OpenAIVideoGenerator({ apiKey: 'openai-key', fetch });

    await expect(generator.submit(videoRequest())).resolves.toMatchObject({
      status: expectedStatus,
    });
  });

  it('maps failed operations and provider errors', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({
        id: 'video_failed',
        status: 'failed',
        error: { code: 'moderation_blocked', message: 'Prompt was rejected.' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        error: { message: 'Rate limit exceeded.' },
      }, { status: 429, statusText: 'Too Many Requests' }));
    const generator = new OpenAIVideoGenerator({ apiKey: 'openai-key', fetch });

    await expect(generator.submit(videoRequest())).resolves.toMatchObject({
      operationId: 'video_failed',
      status: 'failed',
      error: 'Prompt was rejected.',
    });
    await expect(generator.submit(videoRequest()))
      .rejects.toThrow('OpenAI video submission failed (429): Rate limit exceeded.');
  });

  it('rejects unsupported asset kinds and delivery profiles before an API call', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const generator = new OpenAIVideoGenerator({ apiKey: 'openai-key', fetch });
    const unsupportedRequests: GenerationRequest[] = [
      { id: 'image', assetKind: 'image', prompt: 'A card image.' },
      videoRequest({ aspectRatio: '16:9', width: 720, height: 1280 }),
      videoRequest({ aspectRatio: '16:9', width: 1920, height: 1080 }),
      videoRequest({ aspectRatio: '16:9', durationSeconds: 6 }),
      videoRequest({ aspectRatio: '16:9', format: 'webm' }),
    ];

    for (const request of unsupportedRequests) {
      await expect(generator.submit(request)).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(generator.capabilities()).toEqual({
      providerId: 'openai-video',
      media: {
        video: {
          formats: ['mp4'],
          aspectRatios: ['16:9', '9:16'],
          supportsDuration: true,
        },
      },
    });
  });

  it('rejects malformed responses and downloads before completion', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 'queued' }))
      .mockResolvedValueOnce(new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    const generator = new OpenAIVideoGenerator({ apiKey: 'openai-key', fetch });

    await expect(generator.submit(videoRequest()))
      .rejects.toThrow('OpenAI video response is missing id or status');
    await expect(generator.submit(videoRequest()))
      .rejects.toThrow('OpenAI video submission returned malformed JSON');

    const processing: ProviderOperation = {
      providerId: 'openai-video',
      operationId: 'video_processing',
      requestId: 'request-1',
      status: 'processing',
    };
    await expect(generator.download(processing))
      .rejects.toThrow('Cannot download processing operation video_processing');
  });
});
