import { describe, expect, it } from 'vitest';
import { inspectPng, PNGInspectionError } from '../src/services/inspection/png-inspector.js';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngIhdr(width: number, height: number, colorType: number): Buffer {
  const header = Buffer.alloc(25);
  header.writeUInt32BE(13, 0);
  header.write('IHDR', 4, 'ascii');
  header.writeUInt32BE(width, 8);
  header.writeUInt32BE(height, 12);
  header[16] = 8; // bit depth
  header[17] = colorType;
  header[18] = 0; // compression method
  header[19] = 0; // filter method
  header[20] = 0; // interlace method
  // The final four bytes are the IHDR CRC. This inspector intentionally does
  // not validate CRCs because it only establishes deterministic header facts.
  return Buffer.concat([Buffer.from(PNG_SIGNATURE), header]);
}

describe('inspectPng', () => {
  it('inspects RGB PNG dimensions without an alpha channel', () => {
    expect(inspectPng(pngIhdr(640, 360, 2))).toMatchObject({
      mediaKind: 'image',
      format: 'png',
      mimeType: 'image/png',
      width: 640,
      height: 360,
      hasAlphaChannel: false,
      hasAlpha: false,
    });
  });

  it('reports an RGBA alpha channel without claiming transparent pixels', () => {
    expect(inspectPng(pngIhdr(1024, 1024, 6))).toMatchObject({
      width: 1024,
      height: 1024,
      hasAlphaChannel: true,
      hasAlpha: true,
    });
  });

  it('rejects invalid signatures and truncated IHDR chunks', () => {
    expect(() => inspectPng(Buffer.from('not-a-png'))).toThrow(PNGInspectionError);
    expect(() => inspectPng(Buffer.from(PNG_SIGNATURE))).toThrow('Truncated PNG IHDR chunk');
  });

  it('rejects zero dimensions', () => {
    expect(() => inspectPng(pngIhdr(0, 10, 6))).toThrow('dimensions must be greater than zero');
  });
});
