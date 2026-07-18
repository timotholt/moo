import { describe, expect, it, vi } from 'vitest';
import { GoogleImageGenerator } from '../src/services/generators/google-image.js';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('GoogleImageGenerator', () => {
  it('submits Gemini image requests and downloads the returned MIME and bytes', async () => {
    const bytes = Buffer.from('gemini-image');
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      candidates: [{
        content: {
          parts: [
            { text: 'Generated image.' },
            { inlineData: { mimeType: 'image/webp', data: bytes.toString('base64') } },
          ],
        },
        finishReason: 'STOP',
        safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'NEGLIGIBLE' }],
      }],
      responseId: 'response-123',
      modelVersion: 'gemini-3.1-flash-image-001',
      usageMetadata: { promptTokenCount: 7, totalTokenCount: 136 },
    }));
    const generator = new GoogleImageGenerator('google-secret', undefined, fetchImpl);

    const operation = await generator.submit({
      id: 'image-001',
      assetKind: 'image',
      prompt: 'A painted space cow.',
      delivery: { width: 1920, height: 1080 },
      settings: { imageSize: '2K', ignoredSetting: 'do-not-send' },
    });

    expect(operation).toMatchObject({
      providerId: 'google-image',
      operationId: 'google-image:image-001',
      requestId: 'image-001',
      status: 'completed',
      providerMetadata: {
        provider: 'google-image',
        mimeType: 'image/webp',
        aspectRatio: '16:9',
        imageSize: '2K',
        responseMetadata: {
          responseId: 'response-123',
          modelVersion: 'gemini-3.1-flash-image-001',
          usageMetadata: { promptTokenCount: 7, totalTokenCount: 136 },
          candidate: {
            index: 0,
            finishReason: 'STOP',
          },
        },
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent',
    );
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': 'google-secret',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      contents: [{ parts: [{ text: 'A painted space cow.' }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        responseFormat: {
          image: { aspectRatio: '16:9', imageSize: '2K' },
        },
      },
    });

    await expect(generator.download(operation)).resolves.toMatchObject({
      bytes,
      mimeType: 'image/webp',
    });
    await expect(generator.poll(operation)).resolves.toEqual(operation);

    // A stable request ID is an idempotency boundary and does not spend twice.
    await expect(generator.submit({
      id: 'image-001',
      assetKind: 'image',
      prompt: 'A changed prompt that must not resubmit.',
    })).resolves.toEqual(operation);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1024, 1024, '1:1'],
    [1536, 2048, '3:4'],
    [2048, 1536, '4:3'],
    [1920, 1080, '16:9'],
    [1080, 1920, '9:16'],
  ])('maps exact %sx%s dimensions to %s', async (width, height, expectedRatio) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      candidates: [{
        content: {
          parts: [{ inlineData: { mimeType: 'image/png', data: Buffer.from('x').toString('base64') } }],
        },
      }],
    }));
    const generator = new GoogleImageGenerator('key', 'gemini-custom', fetchImpl);

    await expect(generator.submit({
      id: `ratio-${expectedRatio}`,
      assetKind: 'image',
      prompt: 'Ratio test.',
      delivery: { width, height },
      settings: { imageSize: 'unknown-size' },
    })).resolves.toMatchObject({ status: 'completed' });

    const [, init] = fetchImpl.mock.calls[0];
    const requestBody = JSON.parse(String(init?.body));
    expect(requestBody.generationConfig.responseFormat.image).toEqual({
      aspectRatio: expectedRatio,
    });
  });

  it('rejects unsupported dimensions and transparency before making an API call', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const generator = new GoogleImageGenerator('key', undefined, fetchImpl);

    await expect(generator.submit({
      id: 'transparent',
      assetKind: 'image',
      prompt: 'Transparent pawn.',
      delivery: { transparency: true },
    })).rejects.toThrow('does not support transparent image generation');
    await expect(generator.submit({
      id: 'unsupported-ratio',
      assetKind: 'image',
      prompt: 'Wide pawn.',
      delivery: { width: 1000, height: 333 },
    })).resolves.toMatchObject({
      status: 'failed',
      error: expect.stringContaining('do not match a supported aspect ratio'),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(generator.capabilities()).toMatchObject({
      providerId: 'google-image',
      media: { image: { supportsTransparency: false } },
    });
  });

  it('returns a failed operation for non-2xx API responses', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded.' },
    }, { status: 429, statusText: 'Too Many Requests' }));
    const generator = new GoogleImageGenerator('key', undefined, fetchImpl);

    const operation = await generator.submit({
      id: 'quota',
      assetKind: 'image',
      prompt: 'A costly image.',
    });

    expect(operation).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('429 Too Many Requests'),
    });
    expect(operation.error).toContain('RESOURCE_EXHAUSTED: Quota exceeded.');
    await expect(generator.download(operation)).rejects.toThrow('Cannot download failed operation');
  });

  it('reports malformed and safety-blocked responses without storing an asset', async () => {
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      candidates: [{ content: { parts: [{ text: 'No image was returned.' }] } }],
    }));
    const malformed = new GoogleImageGenerator('key', undefined, malformedFetch);
    const malformedOperation = await malformed.submit({
      id: 'malformed',
      assetKind: 'image',
      prompt: 'Missing bytes.',
    });
    expect(malformedOperation).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('did not contain image data'),
    });

    const safetyFetch = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      promptFeedback: {
        blockReason: 'SAFETY',
        safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', blocked: true }],
      },
      candidates: [],
    }));
    const safety = new GoogleImageGenerator('key', undefined, safetyFetch);
    const safetyOperation = await safety.submit({
      id: 'safety',
      assetKind: 'image',
      prompt: 'Blocked prompt.',
    });
    expect(safetyOperation).toMatchObject({
      status: 'failed',
      error: 'Google Gemini image generation was safety-blocked: SAFETY',
    });
    await expect(safety.download(safetyOperation)).rejects.toThrow(
      'Cannot download failed operation',
    );
  });
});
