import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { analyzePngAlpha, PNGAlphaAnalysisError } from '../src/services/inspection/png-alpha.js';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function png(options: {
  width: number;
  height: number;
  colorType: 2 | 4 | 6;
  rows: Buffer[];
  bitDepth?: number;
  interlace?: number;
}): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(options.width, 0);
  header.writeUInt32BE(options.height, 4);
  header[8] = options.bitDepth ?? 8;
  header[9] = options.colorType;
  header[10] = 0;
  header[11] = 0;
  header[12] = options.interlace ?? 0;
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(options.rows))), chunk('IEND', Buffer.alloc(0))]);
}

describe('analyzePngAlpha', () => {
  it('reports fully opaque RGBA pixels', () => {
    expect(analyzePngAlpha(png({ width: 2, height: 1, colorType: 6, rows: [Buffer.from([0, 1, 2, 3, 255, 4, 5, 6, 255])] }))).toMatchObject({
      hasAlphaChannel: true,
      totalPixels: 2,
      transparentPixels: 0,
      alphaCoverage: 0,
      hasTransparentPixels: false,
    });
  });

  it('counts partially transparent RGBA pixels', () => {
    expect(analyzePngAlpha(png({ width: 2, height: 1, colorType: 6, rows: [Buffer.from([0, 1, 2, 3, 254, 4, 5, 6, 0])] }))).toMatchObject({
      transparentPixels: 2,
      alphaCoverage: 1,
      hasTransparentPixels: true,
    });
  });

  it('counts gray+alpha pixels', () => {
    expect(analyzePngAlpha(png({ width: 2, height: 1, colorType: 4, rows: [Buffer.from([0, 80, 255, 81, 127])] }))).toMatchObject({
      transparentPixels: 1,
      alphaCoverage: 0.5,
      hasTransparentPixels: true,
    });
  });

  it('reports RGB without an alpha channel as having no pixel alpha transparency', () => {
    expect(analyzePngAlpha(png({ width: 1, height: 1, colorType: 2, rows: [Buffer.from([0, 1, 2, 3])] }))).toMatchObject({
      hasAlphaChannel: false,
      transparentPixels: 0,
      alphaCoverage: 0,
      hasTransparentPixels: false,
    });
  });

  it('reverses nonzero scanline filters before checking alpha', () => {
    const first = [10, 20, 30, 255];
    const second = [5, 6, 7, 0];
    const filteredSecond = second.map((value, index) => (value - first[index] + 256) & 0xff);
    const result = analyzePngAlpha(png({ width: 2, height: 1, colorType: 6, rows: [Buffer.from([1, ...first, ...filteredSecond])] }));
    expect(result.transparentPixels).toBe(1);
    expect(result.alphaCoverage).toBe(0.5);
  });

  it('rejects malformed and truncated PNG data', () => {
    expect(() => analyzePngAlpha(Buffer.from('not-a-png'))).toThrow(PNGAlphaAnalysisError);
    expect(() => analyzePngAlpha(SIGNATURE)).toThrow('missing an IHDR');
    const valid = png({ width: 1, height: 1, colorType: 6, rows: [Buffer.from([0, 0, 0, 0, 255])] });
    expect(() => analyzePngAlpha(valid.subarray(0, -2))).toThrow(PNGAlphaAnalysisError);
  });

  it('rejects unsupported bit depths and interlaced PNGs', () => {
    expect(() => analyzePngAlpha(png({ width: 1, height: 1, colorType: 6, bitDepth: 16, rows: [Buffer.alloc(9)] }))).toThrow('bit depth 16');
    expect(() => analyzePngAlpha(png({ width: 1, height: 1, colorType: 6, interlace: 1, rows: [Buffer.alloc(5)] }))).toThrow('Interlaced');
  });

  it('enforces the pixel bounds before decompression', () => {
    expect(() => analyzePngAlpha(png({ width: 4_001, height: 4_000, colorType: 6, rows: [Buffer.alloc(0)] }))).toThrow('pixel limit');
  });
});
