import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR_LENGTH = 13;
const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_CHUNKS = 10_000;
const MAX_PIXELS = 16_000_000;

export class PNGAlphaAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PNGAlphaAnalysisError';
  }
}

export interface PNGAlphaAnalysis {
  width: number;
  height: number;
  hasAlphaChannel: boolean;
  totalPixels: number;
  transparentPixels: number;
  alphaCoverage: number;
  hasTransparentPixels: boolean;
}

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  compressionMethod: number;
  filterMethod: number;
  interlaceMethod: number;
}

function assertPng(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new PNGAlphaAnalysisError(message);
  }
}

function readHeader(data: Buffer): PngHeader {
  assertPng(data.length === IHDR_LENGTH, 'PNG IHDR chunk must be 13 bytes');
  const header = {
    width: data.readUInt32BE(0),
    height: data.readUInt32BE(4),
    bitDepth: data[8],
    colorType: data[9],
    compressionMethod: data[10],
    filterMethod: data[11],
    interlaceMethod: data[12],
  };

  assertPng(header.width > 0 && header.height > 0, 'PNG dimensions must be greater than zero');
  assertPng(header.bitDepth === 8, `Unsupported PNG bit depth ${header.bitDepth}; only 8-bit PNGs are supported`);
  assertPng(
    header.colorType === 2 || header.colorType === 4 || header.colorType === 6,
    `Unsupported PNG color type ${header.colorType}; only RGB, gray+alpha, and RGBA are supported`,
  );
  assertPng(header.compressionMethod === 0, 'Unsupported PNG compression method');
  assertPng(header.filterMethod === 0, 'Unsupported PNG filter method');
  assertPng(header.interlaceMethod === 0, 'Interlaced PNGs are unsupported');
  return header;
}

function paeth(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function reverseFilters(data: Buffer, rowBytes: number, height: number, bytesPerPixel: number): Buffer {
  const expectedLength = height * (rowBytes + 1);
  assertPng(data.length === expectedLength, 'PNG IDAT decompressed length does not match its IHDR dimensions');
  const output = Buffer.allocUnsafe(height * rowBytes);

  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * (rowBytes + 1);
    const targetOffset = row * rowBytes;
    const filter = data[sourceOffset];
    assertPng(filter <= 4, `Unsupported PNG scanline filter ${filter}`);

    for (let column = 0; column < rowBytes; column += 1) {
      const filtered = data[sourceOffset + 1 + column];
      const left = column >= bytesPerPixel ? output[targetOffset + column - bytesPerPixel] : 0;
      const up = row > 0 ? output[targetOffset - rowBytes + column] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel ? output[targetOffset - rowBytes + column - bytesPerPixel] : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = filtered;
          break;
        case 1:
          value = filtered + left;
          break;
        case 2:
          value = filtered + up;
          break;
        case 3:
          value = filtered + Math.floor((left + up) / 2);
          break;
        case 4:
          value = filtered + paeth(left, up, upLeft);
          break;
        default:
          value = filtered;
      }
      output[targetOffset + column] = value & 0xff;
    }
  }

  return output;
}

/**
 * Determines whether a supported PNG stores any pixels with alpha below 255.
 * CRC fields are deliberately not validated; this is not a PNG integrity check.
 */
export function analyzePngAlpha(buffer: Buffer): PNGAlphaAnalysis {
  assertPng(buffer.length <= MAX_INPUT_BYTES, `PNG exceeds the ${MAX_INPUT_BYTES}-byte input limit`);
  assertPng(buffer.length >= PNG_SIGNATURE.length && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), 'Invalid PNG signature');

  let offset = PNG_SIGNATURE.length;
  let chunkCount = 0;
  let header: PngHeader | undefined;
  let sawIdat = false;
  let closedIdat = false;
  let sawIend = false;
  let sawTransparencyChunk = false;
  const idatParts: Buffer[] = [];

  while (offset < buffer.length) {
    assertPng(chunkCount < MAX_CHUNKS, `PNG exceeds the ${MAX_CHUNKS}-chunk limit`);
    assertPng(buffer.length - offset >= 12, 'Truncated PNG chunk header or CRC');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    assertPng(dataEnd >= dataStart && chunkEnd >= dataEnd && chunkEnd <= buffer.length, `Truncated PNG ${type} chunk`);
    chunkCount += 1;

    if (type === 'IHDR') {
      assertPng(header === undefined && !sawIend, 'PNG must contain exactly one initial IHDR chunk');
      header = readHeader(buffer.subarray(dataStart, dataEnd));
    } else {
      assertPng(header !== undefined, 'PNG must begin with an IHDR chunk');
      if (type === 'IDAT') {
        assertPng(!closedIdat && !sawIend, 'PNG IDAT chunks must be consecutive and precede IEND');
        sawIdat = true;
        idatParts.push(buffer.subarray(dataStart, dataEnd));
      } else if (type === 'IEND') {
        assertPng(length === 0 && !sawIend, 'PNG must contain one empty IEND chunk');
        sawIend = true;
        offset = chunkEnd;
        break;
      } else {
        if (sawIdat) closedIdat = true;
        if (type === 'tRNS') sawTransparencyChunk = true;
      }
    }
    offset = chunkEnd;
  }

  assertPng(header !== undefined, 'PNG is missing an IHDR chunk');
  assertPng(sawIdat, 'PNG is missing IDAT data');
  assertPng(sawIend, 'PNG is missing an IEND chunk');
  assertPng(offset === buffer.length, 'PNG has trailing bytes after IEND');
  assertPng(!sawTransparencyChunk, 'PNG tRNS transparency is unsupported by this analyzer');

  const channels = header.colorType === 2 ? 3 : header.colorType === 4 ? 2 : 4;
  const totalPixels = header.width * header.height;
  assertPng(totalPixels <= MAX_PIXELS, `PNG exceeds the ${MAX_PIXELS}-pixel limit`);
  const rowBytes = header.width * channels;
  const expectedInflatedLength = header.height * (rowBytes + 1);
  assertPng(expectedInflatedLength <= MAX_INPUT_BYTES, 'PNG decompressed scanlines exceed the safe limit');

  if (header.colorType === 2) {
    return {
      width: header.width,
      height: header.height,
      hasAlphaChannel: false,
      totalPixels,
      transparentPixels: 0,
      alphaCoverage: 0,
      hasTransparentPixels: false,
    };
  }

  let inflated: Buffer;
  try {
    inflated = inflateSync(Buffer.concat(idatParts), { maxOutputLength: expectedInflatedLength });
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : '';
    throw new PNGAlphaAnalysisError(`Could not safely decompress PNG IDAT data${detail}`);
  }
  const pixels = reverseFilters(inflated, rowBytes, header.height, channels);
  const alphaOffset = channels - 1;
  let transparentPixels = 0;
  for (let pixelOffset = alphaOffset; pixelOffset < pixels.length; pixelOffset += channels) {
    if (pixels[pixelOffset] < 255) transparentPixels += 1;
  }

  return {
    width: header.width,
    height: header.height,
    hasAlphaChannel: true,
    totalPixels,
    transparentPixels,
    alphaCoverage: transparentPixels / totalPixels,
    hasTransparentPixels: transparentPixels > 0,
  };
}
