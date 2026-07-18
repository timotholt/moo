import { createHash } from 'node:crypto';
import { promises as nodeFs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawn } from 'node:child_process';
import type { GeneratedAsset } from '../generators/types.js';
import { analyzePngAlpha } from '../inspection/png-alpha.js';

const DEFAULT_EXECUTABLE = 'rembg';
const DEFAULT_MAX_STDERR_BYTES = 32 * 1024;

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/tiff': '.tiff',
  'image/vnd.microsoft.icon': '.ico',
  'image/webp': '.webp',
  'image/x-icon': '.ico',
};

export class BackgroundRemovalError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'BackgroundRemovalError';
  }
}

export interface GeneratedAssetPostprocessor {
  process(asset: GeneratedAsset): Promise<GeneratedAsset>;
}

export interface BackgroundRemovalProvenance {
  kind: 'background-removal';
  tool: string;
  version?: string;
  configLabel?: string;
  originalSha256: string;
  originalMime: string;
  transparentPixels: number;
  alphaCoverage: number;
}

export interface BackgroundRemovalRunRequest {
  executable: string;
  args: readonly string[];
  cwd: string;
  maxStderrBytes: number;
}

export interface BackgroundRemovalRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stderrTruncated?: boolean;
}

export type BackgroundRemovalRunner = (
  request: BackgroundRemovalRunRequest,
) => Promise<BackgroundRemovalRunResult>;

export interface BackgroundRemovalFileSystem {
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, data: Buffer): Promise<void>;
  readFile(path: string): Promise<Buffer>;
  rm(path: string, options: { recursive: true; force: true }): Promise<void>;
}

export interface BackgroundRemovalConfig {
  executable?: string;
  toolLabel?: string;
  version?: string;
  configLabel?: string;
  maxStderrBytes?: number;
  buildArgs?: (inputPath: string, outputPath: string) => readonly string[];
}

export interface BackgroundRemovalDependencies {
  runner?: BackgroundRemovalRunner;
  fileSystem?: BackgroundRemovalFileSystem;
  tempRoot?: string;
}

const defaultFileSystem: BackgroundRemovalFileSystem = {
  mkdtemp: prefix => nodeFs.mkdtemp(prefix),
  writeFile: (path, data) => nodeFs.writeFile(path, data),
  readFile: path => nodeFs.readFile(path),
  rm: (path, options) => nodeFs.rm(path, options),
};

function canonicalMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0].trim().toLowerCase();
}

function imageExtension(mimeType: string): string {
  return IMAGE_EXTENSIONS[mimeType] ?? '.img';
}

function boundedText(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value);
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  return {
    text: bytes.subarray(0, maxBytes).toString('utf8'),
    truncated: true,
  };
}

export const spawnBackgroundRemovalRunner: BackgroundRemovalRunner = request =>
  new Promise((resolve, reject) => {
    const child = spawn(request.executable, [...request.args], {
      cwd: request.cwd,
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const stderrChunks: Buffer[] = [];
    let capturedBytes = 0;
    let stderrTruncated = false;

    child.stderr?.on('data', (value: Buffer | string) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const available = request.maxStderrBytes - capturedBytes;
      if (available > 0) {
        const retained = chunk.subarray(0, available);
        stderrChunks.push(retained);
        capturedBytes += retained.length;
      }
      if (chunk.length > available) stderrTruncated = true;
    });
    child.once('error', error => reject(new BackgroundRemovalError(
      `Could not start background-removal tool "${request.executable}"`,
      { cause: error },
    )));
    child.once('close', (exitCode, signal) => {
      resolve({
        exitCode,
        signal,
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        stderrTruncated,
      });
    });
  });

/**
 * Local image postprocessor. The default argument shape matches:
 * `rembg i <input> <output>`. No shell is involved.
 */
export class LocalBackgroundRemovalPostprocessor implements GeneratedAssetPostprocessor {
  private readonly executable: string;
  private readonly toolLabel: string;
  private readonly maxStderrBytes: number;
  private readonly buildArgs: (inputPath: string, outputPath: string) => readonly string[];
  private readonly runner: BackgroundRemovalRunner;
  private readonly fileSystem: BackgroundRemovalFileSystem;
  private readonly tempRoot: string;

  constructor(
    private readonly config: BackgroundRemovalConfig = {},
    dependencies: BackgroundRemovalDependencies = {},
  ) {
    this.executable = config.executable ?? DEFAULT_EXECUTABLE;
    this.toolLabel = config.toolLabel ?? basename(this.executable);
    this.maxStderrBytes = config.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    if (!Number.isSafeInteger(this.maxStderrBytes) || this.maxStderrBytes <= 0) {
      throw new BackgroundRemovalError('maxStderrBytes must be a positive safe integer');
    }
    this.buildArgs = config.buildArgs ?? ((inputPath, outputPath) => ['i', inputPath, outputPath]);
    this.runner = dependencies.runner ?? spawnBackgroundRemovalRunner;
    this.fileSystem = dependencies.fileSystem ?? defaultFileSystem;
    this.tempRoot = dependencies.tempRoot ?? tmpdir();
  }

  async process(asset: GeneratedAsset): Promise<GeneratedAsset> {
    const originalMime = canonicalMimeType(asset.mimeType);
    if (!originalMime.startsWith('image/') || originalMime.length === 'image/'.length) {
      throw new BackgroundRemovalError(`Background removal requires an image asset; received "${asset.mimeType}"`);
    }

    let workDirectory: string | undefined;
    let operationFailed = false;
    let operationError: unknown;
    let cleanupError: unknown;
    let result: GeneratedAsset | undefined;
    try {
      workDirectory = await this.fileSystem.mkdtemp(join(this.tempRoot, 'moo-background-removal-'));
      const inputPath = join(workDirectory, `input${imageExtension(originalMime)}`);
      const outputPath = join(workDirectory, 'output.png');
      await this.fileSystem.writeFile(inputPath, asset.bytes);

      const args = [...this.buildArgs(inputPath, outputPath)];
      const runResult = await this.runner({
        executable: this.executable,
        args,
        cwd: workDirectory,
        maxStderrBytes: this.maxStderrBytes,
      });
      if (runResult.exitCode !== 0) {
        const bounded = boundedText(runResult.stderr, this.maxStderrBytes);
        const truncation = runResult.stderrTruncated || bounded.truncated ? ' [truncated]' : '';
        const termination = runResult.signal
          ? `signal ${runResult.signal}`
          : `exit code ${String(runResult.exitCode)}`;
        throw new BackgroundRemovalError(
          `Background-removal tool failed with ${termination}: ${bounded.text}${truncation}`,
        );
      }

      const bytes = await this.fileSystem.readFile(outputPath);
      const alpha = analyzePngAlpha(bytes);
      if (!alpha.hasTransparentPixels) {
        throw new BackgroundRemovalError('Background-removal output contains no transparent pixels');
      }

      const provenance: BackgroundRemovalProvenance = {
        kind: 'background-removal',
        tool: this.toolLabel,
        ...(this.config.version === undefined ? {} : { version: this.config.version }),
        ...(this.config.configLabel === undefined ? {} : { configLabel: this.config.configLabel }),
        originalSha256: createHash('sha256').update(asset.bytes).digest('hex'),
        originalMime,
        transparentPixels: alpha.transparentPixels,
        alphaCoverage: alpha.alphaCoverage,
      };
      const priorPostprocess = asset.providerMetadata.postprocess;
      const postprocess = priorPostprocess === undefined
        ? []
        : Array.isArray(priorPostprocess)
          ? [...priorPostprocess]
          : [priorPostprocess];

      result = {
        bytes,
        mimeType: 'image/png',
        providerMetadata: {
          ...asset.providerMetadata,
          postprocess: [...postprocess, provenance],
        },
      };
    } catch (error) {
      operationFailed = true;
      operationError = error;
    } finally {
      if (workDirectory !== undefined) {
        try {
          await this.fileSystem.rm(workDirectory, { recursive: true, force: true });
        } catch (error) {
          cleanupError = error;
        }
      }
    }

    if (operationFailed) throw operationError;
    if (cleanupError !== undefined) {
      throw new BackgroundRemovalError('Could not clean up background-removal temporary files', {
        cause: cleanupError,
      });
    }
    if (result === undefined) {
      throw new BackgroundRemovalError('Background removal completed without producing an asset');
    }
    return result;
  }
}
