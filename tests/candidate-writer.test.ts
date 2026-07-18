import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';

import { writeCandidate } from '../src/services/candidate-writer.js';
import { ProviderOutputStore } from '../src/services/provider-output-store.js';
import type { ProviderOperation } from '../src/services/generators/types.js';
import { getProjectPaths } from '../src/utils/paths.js';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const now = '2026-07-17T00:00:00.000Z';

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
}

function png(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 0]))), chunk('IEND', Buffer.alloc(0))]);
}

function opaquePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, 0, 0, 0, 255, 0, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
}

function base(mediaType: 'dialogue' | 'image' | 'video' = 'dialogue') {
  const media = { id: 'media-1', owner_type: 'global' as const, owner_id: null, bin_id: 'bin-1', media_type: mediaType, name: 'Hero Asset', prompt: 'make it', created_at: now, updated_at: now };
  const bin = { id: 'bin-1', owner_type: 'global' as const, owner_id: null, media_type: mediaType, name: 'Main', default_blocks: {}, created_at: now, updated_at: now };
  const operation: ProviderOperation = {
    providerId: 'provider',
    operationId: 'operation-1',
    requestId: 'request-1',
    status: 'completed',
  };
  return { media, bin, operation, settings: { provider: 'provider' } };
}

function probe(output: unknown) {
  return async () => ({ ...output }) as never;
}

async function input(mediaType: 'dialogue' | 'image' | 'video', bytes: Buffer, mimeType: string, inspection?: unknown) {
  const root = await mkdtemp(join(tmpdir(), 'moo-candidate-'));
  const project = base(mediaType);
  return {
    ...project,
    projectRoot: root,
    paths: getProjectPaths(root),
    takeNumber: 1,
    generatedAsset: { bytes, mimeType, providerMetadata: { provider_asset: 'asset-1' } },
    providerOperation: project.operation,
    resolvedFrom: 'global' as const,
    dependencies: { now: () => new Date(now), generateId: () => '018f53e2-9ac1-7000-8000-000000000001', inspectWithFFprobe: inspection ? probe(inspection) : undefined, hashFile: async () => 'hash' },
  };
}

const audio = { mediaKind: 'audio' as const, format: 'mp3', mimeType: 'audio/mpeg', byteLength: 3, durationSeconds: 1, sampleRate: 44100, channels: 2, codec: 'mp3', container: 'mp3', bitrate: 128, audioTrackCount: 1 };
const portrait = { mediaKind: 'video' as const, format: 'mp4', mimeType: 'video/mp4', byteLength: 3, durationSeconds: 5, width: 1080, height: 1920, frameRate: 24, codec: 'h264', container: 'mp4', bitrate: 128, audioTrackCount: 0 };

describe('writeCandidate', () => {
  it('creates an inspected audio take and catalogs it after promotion', async () => {
    const value = await input('dialogue', Buffer.from('mp3'), 'audio/mpeg', audio);
    const result = await writeCandidate(value);
    expect(result.take).toMatchObject({ format: 'mp3', duration_sec: 1, sample_rate: 44100, channels: 2, hash_sha256: 'hash' });
    expect(result.take.generation_params?.api_request_id).toBe('operation-1');
    await expect(readFile(join(value.projectRoot, result.take.path))).resolves.toEqual(Buffer.from('mp3'));
    await expect(readFile(value.paths.catalog.takes, 'utf8')).resolves.toContain(result.take.id);
  });

  it('records transparent PNG facts', async () => {
    const value = await input('image', png(), 'image/png');
    value.delivery = { width: 2, height: 1, transparency: true };
    const result = await writeCandidate(value);
    expect(result.take).toMatchObject({
      format: 'png',
      width: 2,
      height: 1,
      technical_status: 'valid',
      technical_issues: [],
    });
    expect(result.facts.alpha).toMatchObject({ hasTransparentPixels: true, transparentPixels: 1 });
  });

  it('preserves an opaque PNG as technically invalid when transparency was requested', async () => {
    const value = await input('image', opaquePng(), 'image/png');
    value.delivery = { width: 2, height: 1, transparency: true };

    const result = await writeCandidate(value);

    expect(result.take).toMatchObject({
      status: 'new',
      technical_status: 'invalid',
      technical_issues: [
        expect.objectContaining({
          code: 'transparency_missing',
          stage: 'delivery',
        }),
      ],
    });
    await expect(readFile(join(value.projectRoot, result.take.path))).resolves.toEqual(opaquePng());
    await expect(readFile(value.paths.catalog.takes, 'utf8')).resolves.toContain('transparency_missing');

    const repeated = await writeCandidate(value);
    expect(repeated).toMatchObject({ existing: true, take: { id: result.take.id, technical_status: 'invalid' } });
    expect((await readFile(value.paths.catalog.takes, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('preserves uninspectable downloaded image bytes with explicit diagnostics', async () => {
    const bytes = Buffer.from('not-a-png');
    const value = await input('image', bytes, 'image/png');

    const result = await writeCandidate(value);

    expect(result.take).toMatchObject({
      format: 'png',
      technical_status: 'invalid',
      technical_issues: [
        expect.objectContaining({
          code: 'inspection_failed',
          stage: 'inspection',
          message: 'Invalid PNG signature',
        }),
      ],
    });
    await expect(readFile(join(value.projectRoot, result.take.path))).resolves.toEqual(bytes);
  });

  it('archives original provider bytes and links source to a postprocessed candidate', async () => {
    const value = await input('image', png(), 'image/png');
    const original = opaquePng();
    const store = new ProviderOutputStore(value.projectRoot);
    const reference = await store.stage({
      providerId: 'provider',
      operationId: 'operation-1',
      bytes: original,
      mimeType: 'image/png',
    });
    value.providerOperation.providerMetadata = store.attach({}, reference);
    value.delivery = { width: 2, height: 1, transparency: true };

    const result = await writeCandidate(value);
    const source = result.take.generation_params?.provider_metadata?.source as Record<string, unknown>;
    const finalSha256 = createHash('sha256').update(png()).digest('hex');
    expect(source).toEqual({
      path: `source-art/archive/${reference.sha256}.png`,
      mimeType: 'image/png',
      sizeBytes: original.length,
      sha256: reference.sha256,
      finalSha256,
      relation: 'source-of-postprocessed-candidate',
    });
    await expect(readFile(join(value.projectRoot, String(source.path)))).resolves.toEqual(original);

    const repeated = await writeCandidate(value);
    expect(repeated).toMatchObject({ existing: true, take: { id: result.take.id } });
    await expect(readFile(join(value.projectRoot, String(source.path)))).resolves.toEqual(original);
  });

  it('validates portrait video delivery', async () => {
    const value = await input('video', Buffer.from('mp4'), 'video/mp4', portrait);
    value.delivery = { aspectRatio: '9:16', width: 1080, height: 1920 };
    const result = await writeCandidate(value);
    expect(result.take).toMatchObject({ width: 1080, height: 1920, fps: 24 });
  });

  it('is idempotent for the same provider operation', async () => {
    const value = await input('dialogue', Buffer.from('mp3'), 'audio/mpeg', audio);
    const first = await writeCandidate(value);
    const second = await writeCandidate(value);
    expect(second).toMatchObject({ existing: true, take: { id: first.take.id } });
    expect((await readFile(value.paths.catalog.takes, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('adopts exact promoted bytes after an interrupted catalog write', async () => {
    const value = await input('dialogue', Buffer.from('mp3'), 'audio/mpeg', audio);
    const orphanPath = join(value.projectRoot, 'global/dialogue/main/hero_asset_001.mp3');
    await fs.outputFile(orphanPath, value.generatedAsset.bytes);

    const result = await writeCandidate(value);

    expect(result).toMatchObject({
      existing: false,
      take: { technical_status: 'valid', path: 'global/dialogue/main/hero_asset_001.mp3' },
    });
    await expect(readFile(orphanPath)).resolves.toEqual(value.generatedAsset.bytes);
    expect((await readFile(value.paths.catalog.takes, 'utf8')).trim().split('\n')).toHaveLength(1);
  });

  it('does not confuse identical operation IDs from different providers', async () => {
    const firstInput = await input('dialogue', Buffer.from('mp3'), 'audio/mpeg', audio);
    const first = await writeCandidate(firstInput);
    const secondInput = {
      ...firstInput,
      takeNumber: 2,
      providerOperation: {
        ...firstInput.providerOperation,
        providerId: 'other-provider',
      },
      settings: { provider: 'other-provider' },
      dependencies: {
        ...firstInput.dependencies,
        generateId: () => '018f53e2-9ac1-7000-8000-000000000002',
      },
    };

    const second = await writeCandidate(secondInput);
    expect(second.existing).toBe(false);
    expect(second.take.id).not.toBe(first.take.id);
    expect((await readFile(firstInput.paths.catalog.takes, 'utf8')).trim().split('\n')).toHaveLength(2);
  });

  it('preserves a dimension or aspect-ratio mismatch as a technically invalid take', async () => {
    const value = await input('video', Buffer.from('mp4'), 'video/mp4', portrait);
    value.delivery = { aspectRatio: '16:9', width: 1920, height: 1080 };

    const result = await writeCandidate(value);

    expect(result.take.technical_status).toBe('invalid');
    expect(result.take.technical_issues.map(issue => issue.code)).toEqual([
      'dimensions_mismatch',
      'dimensions_mismatch',
      'aspect_ratio_mismatch',
    ]);
    await expect(readFile(join(value.projectRoot, result.take.path))).resolves.toEqual(Buffer.from('mp4'));
  });

  it('preserves a provider media mismatch as a technically invalid take', async () => {
    const value = await input('dialogue', Buffer.from('png'), 'image/png', audio);
    const result = await writeCandidate(value);

    expect(result.take).toMatchObject({
      status: 'new',
      technical_status: 'invalid',
    });
    expect(result.take.technical_issues.map(issue => issue.code)).toContain('media_type_mismatch');
    await expect(readFile(join(value.projectRoot, result.take.path))).resolves.toEqual(Buffer.from('png'));
  });

  it('does not disguise an inspector infrastructure failure as an invalid candidate', async () => {
    const value = await input('dialogue', Buffer.from('mp3'), 'audio/mpeg', audio);
    value.dependencies.inspectWithFFprobe = async () => {
      throw new Error('inspection service unavailable');
    };

    await expect(writeCandidate(value)).rejects.toThrow('inspection service unavailable');
    await expect(fs.pathExists(value.paths.catalog.takes)).resolves.toBe(false);
    await expect(fs.pathExists(join(value.projectRoot, 'global/dialogue/main/hero_asset_001.mp3'))).resolves.toBe(false);
  });
});
