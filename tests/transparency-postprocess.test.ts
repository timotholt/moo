import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

import type { GeneratedAssetPostprocessor } from '../src/services/postprocessing/background-removal.js';
import {
  ensureRequestedTransparency,
  providerDeliveryRequirements,
} from '../src/services/postprocessing/transparency.js';

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function rgbaPng(alpha: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 1, 2, 3, alpha]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const opaquePng = rgbaPng(255);
const transparentPng = rgbaPng(0);

describe('transparency post-processing integration', () => {
  it('removes only the provider-facing transparency flag when fallback is configured', () => {
    const requested = { format: 'png', width: 1024, height: 1024, transparency: true };
    expect(providerDeliveryRequirements(
      requested,
      { formats: ['png'], supportsTransparency: false },
      true,
    )).toEqual({ format: 'png', width: 1024, height: 1024, transparency: undefined });
    expect(() => providerDeliveryRequirements(
      requested,
      { formats: ['png'], supportsTransparency: false },
      false,
    )).toThrow('requires configured background removal');
  });

  it('runs the configured processor for an opaque provider result', async () => {
    const processor: GeneratedAssetPostprocessor = {
      process: vi.fn().mockResolvedValue({
        bytes: transparentPng,
        mimeType: 'image/png',
        providerMetadata: { postprocess: ['test'] },
      }),
    };
    const result = await ensureRequestedTransparency({
      bytes: opaquePng,
      mimeType: 'image/jpeg',
      providerMetadata: {},
    }, { transparency: true }, processor);

    expect(processor.process).toHaveBeenCalledOnce();
    expect(result.providerMetadata).toEqual({ postprocess: ['test'] });
  });
});
