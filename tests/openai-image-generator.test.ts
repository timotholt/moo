import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';

import { OpenAIImageGenerator } from '../src/services/generators/openai-image.js';
import { ProviderOutputStore } from '../src/services/provider-output-store.js';

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.map(root => fs.remove(root)));
});

function outputStore(): ProviderOutputStore {
  const root = join(tmpdir(), `moo-openai-image-${process.pid}-${roots.length}`);
  roots.push(root);
  return new ProviderOutputStore(root);
}

function response(
  body: unknown,
  options: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    {
      status: options.status ?? 200,
      headers: {
        'content-type': 'application/json',
        ...options.headers,
      },
    },
  );
}

describe('OpenAIImageGenerator', () => {
  it('submits a whitelisted image request and downloads retained base64 bytes idempotently', async () => {
    const bytes = Buffer.from('generated-png');
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(
      {
        created: 1_725_000_000,
        data: [{ b64_json: bytes.toString('base64') }],
        usage: { total_tokens: 42 },
      },
      { headers: { 'x-request-id': 'req_openai_123' } },
    ));
    const generator = new OpenAIImageGenerator({
      apiKey: 'sk-test',
      fetch,
      outputStore: outputStore(),
    });

    const operation = await generator.submit({
      id: 'card-art-1',
      assetKind: 'image',
      prompt: 'A battle-worn orbital marine',
      delivery: { width: 1536, height: 1024, format: 'webp' },
      settings: {
        quality: 'high',
        output_format: 'webp',
        background: 'transparent',
        unknown_provider_field: 'must-not-leak',
      },
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer sk-test',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'gpt-image-2',
      prompt: 'A battle-worn orbital marine',
      output_format: 'webp',
      size: '1536x1024',
      quality: 'high',
    });
    expect(operation).toMatchObject({
      providerId: 'openai-image',
      operationId: 'openai-image:card-art-1',
      requestId: 'card-art-1',
      status: 'completed',
      providerMetadata: {
        provider: 'openai-image',
        model: 'gpt-image-2',
        apiRequestId: 'req_openai_123',
        created: 1_725_000_000,
        outputFormat: 'webp',
        usage: { total_tokens: 42 },
      },
    });

    const firstDownload = await generator.download(operation);
    firstDownload.bytes[0] = 0;
    firstDownload.providerMetadata.model = 'mutated';
    const secondDownload = await generator.download(operation);
    expect(secondDownload).toEqual({
      bytes,
      mimeType: 'image/webp',
      providerMetadata: expect.objectContaining({
        provider: 'openai-image',
        model: 'gpt-image-2',
        apiRequestId: 'req_openai_123',
      }),
    });
    expect(await generator.poll(operation)).toBe(operation);
  });

  it('advertises only truthful image capabilities', () => {
    const generator = new OpenAIImageGenerator({
      apiKey: 'sk-test',
      fetch: vi.fn<typeof globalThis.fetch>(),
      outputStore: outputStore(),
    });

    expect(generator.capabilities()).toEqual({
      providerId: 'openai-image',
      media: {
        image: {
          formats: ['png', 'jpeg', 'webp'],
          supportsTransparency: false,
        },
      },
    });
  });

  it('does not call OpenAI for unsupported media or transparent delivery', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const generator = new OpenAIImageGenerator({ apiKey: 'sk-test', fetch, outputStore: outputStore() });

    await expect(generator.submit({
      id: 'video-1',
      assetKind: 'video',
      prompt: 'A cinematic reveal',
    })).rejects.toThrow('openai-image does not support video generation');
    await expect(generator.submit({
      id: 'transparent-1',
      assetKind: 'image',
      prompt: 'A card character cutout',
      delivery: { format: 'png', transparency: true },
    })).rejects.toThrow('openai-image does not support transparent image generation');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns failed operations for malformed successful responses', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({ data: [{ b64_json: 'not base64' }] }));
    const generator = new OpenAIImageGenerator({ apiKey: 'sk-test', fetch, outputStore: outputStore() });

    const missing = await generator.submit({
      id: 'missing-data',
      assetKind: 'image',
      prompt: 'First image',
    });
    expect(missing).toMatchObject({
      status: 'failed',
      error: 'OpenAI image generation response is missing data[0].b64_json',
    });
    await expect(generator.download(missing)).rejects.toThrow('Cannot download failed operation');

    const malformed = await generator.submit({
      id: 'bad-base64',
      assetKind: 'image',
      prompt: 'Second image',
    });
    expect(malformed).toMatchObject({
      status: 'failed',
      error: 'OpenAI image generation returned invalid base64 image data',
    });
  });

  it('captures API and transport errors without retaining downloadable assets', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(
        { error: { message: 'Billing limit reached' } },
        { status: 429, headers: { 'x-request-id': 'req_limit' } },
      ))
      .mockRejectedValueOnce(new Error('socket closed'));
    const generator = new OpenAIImageGenerator({
      apiKey: 'sk-test',
      model: 'gpt-image-custom',
      fetch,
      outputStore: outputStore(),
    });

    const apiFailure = await generator.submit({
      id: 'limited',
      assetKind: 'image',
      prompt: 'An image',
    });
    expect(apiFailure).toMatchObject({
      status: 'failed',
      error: 'OpenAI image generation failed with HTTP 429: Billing limit reached (request req_limit)',
    });

    const transportFailure = await generator.submit({
      id: 'offline',
      assetKind: 'image',
      prompt: 'Another image',
    });
    expect(transportFailure).toMatchObject({
      status: 'failed',
      error: 'socket closed',
    });
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.openai.com/v1/images/generations',
      expect.objectContaining({
        body: JSON.stringify({
          model: 'gpt-image-custom',
          prompt: 'Another image',
          output_format: 'png',
        }),
      }),
    );
  });

  it('downloads completed bytes after the adapter is recreated', async () => {
    const bytes = Buffer.from('restart-safe-openai-image');
    const store = outputStore();
    const firstProcess = new OpenAIImageGenerator({
      apiKey: 'sk-test',
      outputStore: store,
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(response({
        data: [{ b64_json: bytes.toString('base64') }],
      })),
    });
    const operation = await firstProcess.submit({
      id: 'restart-openai',
      assetKind: 'image',
      prompt: 'Durable image',
    });

    expect(operation.providerMetadata?.moo_provider_output).toMatchObject({
      version: 1,
      mimeType: 'image/png',
      sizeBytes: bytes.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      path: expect.stringMatching(/^\.moo\/provider-output-staging\/openai-image-/),
    });

    const restarted = new OpenAIImageGenerator({
      apiKey: 'sk-test',
      outputStore: store,
      fetch: vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error('must not fetch')),
    });
    await expect(restarted.download(operation)).resolves.toMatchObject({
      bytes,
      mimeType: 'image/png',
    });
  });
});
