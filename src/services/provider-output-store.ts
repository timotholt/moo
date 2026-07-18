import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve, sep } from 'node:path';

import fs from 'fs-extra';

const STAGED_OUTPUT_KEY = 'moo_provider_output';
const REFERENCE_VERSION = 1;

export interface DurableProviderOutputReference {
  version: typeof REFERENCE_VERSION;
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArchivedProviderSource {
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  finalSha256: string;
  relation: 'source-of-postprocessed-candidate';
}

export interface StageProviderOutputInput {
  providerId: string;
  operationId: string;
  bytes: Buffer;
  mimeType: string;
}

/**
 * Project-scoped durable storage for synchronous provider responses.
 *
 * Files are content-addressed and atomically promoted from a sibling temporary
 * file. Persisted references are always relative to the project root and are
 * re-derived before reads, so operation metadata cannot escape the project.
 */
export class ProviderOutputStore {
  constructor(private readonly projectRoot: string) {
    if (!projectRoot.trim()) throw new Error('Provider output storage requires a project root');
  }

  async stage(input: StageProviderOutputInput): Promise<DurableProviderOutputReference> {
    const mimeType = canonicalMimeType(input.mimeType);
    const sha256 = sha256Bytes(input.bytes);
    const providerDirectory = safeProviderDirectory(input.providerId);
    const relativePath = join(
      '.moo',
      'provider-output-staging',
      providerDirectory,
      `${sha256}${extensionForMime(mimeType)}`,
    );
    const reference: DurableProviderOutputReference = {
      version: REFERENCE_VERSION,
      path: portablePath(relativePath),
      mimeType,
      sizeBytes: input.bytes.length,
      sha256,
    };

    await this.atomicWrite(reference.path, input.bytes);
    await this.verify(reference);
    return reference;
  }

  attach(
    metadata: Record<string, unknown>,
    reference: DurableProviderOutputReference,
  ): Record<string, unknown> {
    return {
      ...metadata,
      [STAGED_OUTPUT_KEY]: { ...reference },
    };
  }

  referenceFrom(
    metadata: Record<string, unknown> | undefined,
  ): DurableProviderOutputReference {
    const value = metadata?.[STAGED_OUTPUT_KEY];
    if (!isRecord(value)) {
      throw new Error('Completed provider operation has no durable output reference');
    }
    if (
      value.version !== REFERENCE_VERSION
      || typeof value.path !== 'string'
      || typeof value.mimeType !== 'string'
      || typeof value.sizeBytes !== 'number'
      || !Number.isSafeInteger(value.sizeBytes)
      || value.sizeBytes < 0
      || typeof value.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(value.sha256)
    ) {
      throw new Error('Completed provider operation has an invalid durable output reference');
    }
    return {
      version: REFERENCE_VERSION,
      path: value.path,
      mimeType: canonicalMimeType(value.mimeType),
      sizeBytes: value.sizeBytes,
      sha256: value.sha256,
    };
  }

  async read(reference: DurableProviderOutputReference): Promise<Buffer> {
    const validated = this.validatedReference(reference);
    const bytes = await fs.readFile(this.absoluteStagingPath(validated));
    this.assertIntegrity(validated, bytes);
    return bytes;
  }

  async download(
    metadata: Record<string, unknown> | undefined,
  ): Promise<{ bytes: Buffer; mimeType: string; reference: DurableProviderOutputReference }> {
    const reference = this.referenceFrom(metadata);
    return {
      bytes: await this.read(reference),
      mimeType: reference.mimeType,
      reference,
    };
  }

  async archivePostprocessedSource(
    reference: DurableProviderOutputReference,
    finalSha256: string,
  ): Promise<ArchivedProviderSource> {
    if (!/^[a-f0-9]{64}$/.test(finalSha256)) {
      throw new Error('Final candidate SHA-256 is invalid');
    }
    const validated = this.validatedReference(reference);
    const bytes = await this.read(validated);
    const archivePath = portablePath(join(
      'source-art',
      'archive',
      `${validated.sha256}${extensionForMime(validated.mimeType)}`,
    ));
    await this.atomicWrite(archivePath, bytes);
    const archivedBytes = await fs.readFile(resolve(this.projectRoot, archivePath));
    this.assertIntegrity(validated, archivedBytes);

    return {
      path: archivePath,
      mimeType: validated.mimeType,
      sizeBytes: validated.sizeBytes,
      sha256: validated.sha256,
      finalSha256,
      relation: 'source-of-postprocessed-candidate',
    };
  }

  private async verify(reference: DurableProviderOutputReference): Promise<void> {
    const bytes = await fs.readFile(this.absoluteStagingPath(reference));
    this.assertIntegrity(reference, bytes);
  }

  private assertIntegrity(reference: DurableProviderOutputReference, bytes: Buffer): void {
    if (bytes.length !== reference.sizeBytes || sha256Bytes(bytes) !== reference.sha256) {
      throw new Error(`Durable provider output failed integrity validation: ${reference.path}`);
    }
  }

  private validatedReference(
    reference: DurableProviderOutputReference,
  ): DurableProviderOutputReference {
    const actual = portablePath(reference.path);
    const mimeType = canonicalMimeType(reference.mimeType);
    const expectedFilename = `${reference.sha256}${extensionForMime(mimeType)}`;
    if (
      reference.version !== REFERENCE_VERSION
      || !Number.isSafeInteger(reference.sizeBytes)
      || reference.sizeBytes < 0
      || !/^[a-f0-9]{64}$/.test(reference.sha256)
      || !/^\.moo\/provider-output-staging\/[^/]+\/[^/]+$/.test(actual)
      || basename(actual) !== expectedFilename
      || !this.isInsideProject(resolve(this.projectRoot, actual))
    ) {
      throw new Error('Durable provider output reference is outside project staging');
    }
    return {
      ...reference,
      path: actual,
      mimeType,
    };
  }

  private absoluteStagingPath(reference: DurableProviderOutputReference): string {
    const absolute = resolve(this.projectRoot, reference.path);
    const stagingRoot = resolve(this.projectRoot, '.moo', 'provider-output-staging');
    if (absolute !== stagingRoot && !absolute.startsWith(`${stagingRoot}${sep}`)) {
      throw new Error('Durable provider output reference is outside project staging');
    }
    return absolute;
  }

  private isInsideProject(path: string): boolean {
    const project = resolve(this.projectRoot);
    return path.startsWith(`${project}${sep}`);
  }

  private async atomicWrite(relativePath: string, bytes: Buffer): Promise<void> {
    const absolutePath = resolve(this.projectRoot, relativePath);
    if (!this.isInsideProject(absolutePath)) {
      throw new Error('Provider output destination is outside the project');
    }
    await fs.ensureDir(dirname(absolutePath));
    if (await fs.pathExists(absolutePath)) return;

    const temporaryPath = join(
      dirname(absolutePath),
      `.${basename(absolutePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    try {
      await fs.writeFile(temporaryPath, bytes, { flag: 'wx' });
      await fs.move(temporaryPath, absolutePath, { overwrite: false });
    } catch (error) {
      await fs.remove(temporaryPath).catch(() => undefined);
      if (!(await fs.pathExists(absolutePath))) throw error;
    }
  }
}

export function providerOutputReferenceFromMetadata(
  metadata: Record<string, unknown> | undefined,
): DurableProviderOutputReference | undefined {
  const value = metadata?.[STAGED_OUTPUT_KEY];
  if (!isRecord(value)) return undefined;
  if (
    value.version !== REFERENCE_VERSION
    || typeof value.path !== 'string'
    || typeof value.mimeType !== 'string'
    || typeof value.sizeBytes !== 'number'
    || !Number.isSafeInteger(value.sizeBytes)
    || value.sizeBytes < 0
    || typeof value.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    throw new Error('Completed provider operation has an invalid durable output reference');
  }
  return {
    version: REFERENCE_VERSION,
    path: value.path,
    mimeType: canonicalMimeType(value.mimeType),
    sizeBytes: value.sizeBytes,
    sha256: value.sha256,
  };
}

function sha256Bytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalMimeType(value: string): string {
  const mimeType = value.split(';', 1)[0].trim().toLowerCase();
  if (!mimeType || !mimeType.includes('/')) throw new Error(`Invalid provider output MIME type: ${value}`);
  return mimeType;
}

function extensionForMime(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return extensions[mimeType] ?? '.bin';
}

function safeProviderDirectory(providerId: string): string {
  const readable = providerId.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'provider';
  const suffix = createHash('sha256').update(providerId).digest('hex').slice(0, 12);
  return `${readable}-${suffix}`;
}

function portablePath(value: string): string {
  return value.split(sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
