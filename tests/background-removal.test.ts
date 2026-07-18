import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BackgroundRemovalError,
  LocalBackgroundRemovalPostprocessor,
  type BackgroundRemovalFileSystem,
  type BackgroundRemovalRunRequest,
  type BackgroundRemovalRunner,
} from '../src/services/postprocessing/background-removal.js';
import type { GeneratedAsset } from '../src/services/generators/types.js';

const temporaryRoots: string[] = [];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

function rgbaPng(alpha: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.from([0, 20, 30, 40, alpha]);
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(row)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function testRoot(): Promise<string> {
  const root = await fs.mkdtemp(join(tmpdir(), 'moo-background-removal-test-'));
  temporaryRoots.push(root);
  return root;
}

function asset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    bytes: Buffer.from('original-image'),
    mimeType: 'image/jpeg',
    providerMetadata: {
      provider: 'test-image-provider',
      postprocess: [{ kind: 'prior-step' }],
    },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe('LocalBackgroundRemovalPostprocessor', () => {
  it('runs with argument arrays, validates alpha, records provenance, and cleans up', async () => {
    const root = await testRoot();
    const requests: BackgroundRemovalRunRequest[] = [];
    const removed: string[] = [];
    const fileSystem: BackgroundRemovalFileSystem = {
      mkdtemp: prefix => fs.mkdtemp(prefix),
      writeFile: (path, bytes) => fs.writeFile(path, bytes),
      readFile: path => fs.readFile(path),
      rm: async (path, options) => {
        removed.push(path);
        await fs.rm(path, options);
      },
    };
    const runner: BackgroundRemovalRunner = async request => {
      requests.push(request);
      expect(request.args).toHaveLength(3);
      expect(request.args[0]).toBe('i');
      expect(request.args[1]).toMatch(/input\.jpg$/);
      expect(request.args[2]).toMatch(/output\.png$/);
      await fs.writeFile(request.args[2], rgbaPng(0));
      return { exitCode: 0, signal: null, stderr: '' };
    };
    const original = asset();
    const processor = new LocalBackgroundRemovalPostprocessor(
      {
        executable: '/opt/tools/rembg',
        version: '2.0.0',
        configLabel: 'cards-v1',
      },
      { runner, fileSystem, tempRoot: root },
    );

    const result = await processor.process(original);

    expect(requests[0]).toMatchObject({
      executable: '/opt/tools/rembg',
      cwd: removed[0],
    });
    expect(result.mimeType).toBe('image/png');
    expect(result.bytes).toEqual(rgbaPng(0));
    expect(result.providerMetadata.provider).toBe('test-image-provider');
    expect(result.providerMetadata.postprocess).toEqual([
      { kind: 'prior-step' },
      expect.objectContaining({
        kind: 'background-removal',
        tool: 'rembg',
        version: '2.0.0',
        configLabel: 'cards-v1',
        originalMime: 'image/jpeg',
        originalSha256: createHash('sha256').update(original.bytes).digest('hex'),
        transparentPixels: 1,
        alphaCoverage: 1,
      }),
    ]);
    expect(removed).toHaveLength(1);
    await expect(fs.access(removed[0])).rejects.toThrow();
  });

  it('rejects non-image input before creating files or invoking the runner', async () => {
    let invoked = false;
    let created = false;
    const runner: BackgroundRemovalRunner = async () => {
      invoked = true;
      return { exitCode: 0, signal: null, stderr: '' };
    };
    const fileSystem: BackgroundRemovalFileSystem = {
      mkdtemp: async () => {
        created = true;
        return '/unused';
      },
      writeFile: async () => undefined,
      readFile: async () => Buffer.alloc(0),
      rm: async () => undefined,
    };
    const processor = new LocalBackgroundRemovalPostprocessor({}, { runner, fileSystem });

    await expect(processor.process(asset({ mimeType: 'audio/mpeg' }))).rejects.toThrow(
      'requires an image asset',
    );
    expect(invoked).toBe(false);
    expect(created).toBe(false);
  });

  it('rejects opaque output and still removes the isolated directory', async () => {
    const root = await testRoot();
    let workDirectory = '';
    const runner: BackgroundRemovalRunner = async request => {
      workDirectory = request.cwd;
      await fs.writeFile(request.args[2], rgbaPng(255));
      return { exitCode: 0, signal: null, stderr: '' };
    };
    const processor = new LocalBackgroundRemovalPostprocessor({}, { runner, tempRoot: root });

    await expect(processor.process(asset())).rejects.toThrow('contains no transparent pixels');
    await expect(fs.access(workDirectory)).rejects.toThrow();
  });

  it('bounds tool stderr in failures and cleans up', async () => {
    const root = await testRoot();
    let workDirectory = '';
    const runner: BackgroundRemovalRunner = async request => {
      workDirectory = request.cwd;
      return {
        exitCode: 7,
        signal: null,
        stderr: '0123456789abcdefghijklmnopqrstuvwxyz',
      };
    };
    const processor = new LocalBackgroundRemovalPostprocessor(
      { maxStderrBytes: 10 },
      { runner, tempRoot: root },
    );

    let failure: unknown;
    try {
      await processor.process(asset());
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(BackgroundRemovalError);
    expect((failure as Error).message).toContain('0123456789 [truncated]');
    expect((failure as Error).message).not.toContain('abcdefghijklmnopqrstuvwxyz');
    await expect(fs.access(workDirectory)).rejects.toThrow();
  });
});
