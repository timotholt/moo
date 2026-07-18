import type { ImageInspectionResult } from './types.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_LENGTH = 13;
const IHDR_OFFSET = PNG_SIGNATURE.length;
const IHDR_DATA_OFFSET = IHDR_OFFSET + 8;
const MINIMUM_IHDR_BYTES = IHDR_DATA_OFFSET + IHDR_LENGTH + 4;

export class PNGInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PNGInspectionError';
  }
}

/**
 * Reads the PNG signature and IHDR only. It deliberately does not decompress
 * IDAT data, so this is safe for untrusted buffers and does not claim to know
 * whether any stored alpha values contain transparent pixels.
 */
export function inspectPng(buffer: Buffer): ImageInspectionResult {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new PNGInspectionError('Invalid PNG signature');
  }

  if (buffer.length < MINIMUM_IHDR_BYTES) {
    throw new PNGInspectionError('Truncated PNG IHDR chunk');
  }

  const ihdrLength = buffer.readUInt32BE(IHDR_OFFSET);
  const chunkType = buffer.toString('ascii', IHDR_OFFSET + 4, IHDR_DATA_OFFSET);
  if (ihdrLength !== IHDR_LENGTH || chunkType !== 'IHDR') {
    throw new PNGInspectionError('PNG must begin with a 13-byte IHDR chunk');
  }

  const width = buffer.readUInt32BE(IHDR_DATA_OFFSET);
  const height = buffer.readUInt32BE(IHDR_DATA_OFFSET + 4);
  if (width === 0 || height === 0) {
    throw new PNGInspectionError('PNG dimensions must be greater than zero');
  }

  const colorType = buffer[IHDR_DATA_OFFSET + 9];
  const hasAlphaChannel = colorType === 4 || colorType === 6;

  return {
    mediaKind: 'image',
    format: 'png',
    mimeType: 'image/png',
    byteLength: buffer.length,
    width,
    height,
    hasAlphaChannel,
    hasAlpha: hasAlphaChannel,
  };
}
