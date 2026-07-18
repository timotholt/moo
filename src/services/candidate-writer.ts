import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

import fs from 'fs-extra';

import type { Actor } from '../shared/schemas/actor.schema.js';
import type { Bin } from '../shared/schemas/bin.schema.js';
import type { DefaultBlock } from '../shared/schemas/common.schema.js';
import type { Media } from '../shared/schemas/media.schema.js';
import type { Scene } from '../shared/schemas/scene.schema.js';
import type { Card } from '../shared/schemas/card.schema.js';
import {
  TakeSchema,
  type Take,
  type TakeTechnicalIssue,
} from '../shared/schemas/take.schema.js';
import type { GeneratedAsset, ProviderOperation, DeliveryRequirements } from './generators/types.js';
import {
  FFprobeInspectionError,
  inspectWithFFprobe,
  type FFprobeInspectionResult,
} from './inspection/ffprobe-inspector.js';
import { analyzePngAlpha, type PNGAlphaAnalysis } from './inspection/png-alpha.js';
import { inspectPng, PNGInspectionError } from './inspection/png-inspector.js';
import type { ImageInspectionResult } from './inspection/types.js';
import { constructTakePath } from '../utils/pathConstruction.js';
import type { getProjectPaths } from '../utils/paths.js';
import { generateId } from '../utils/ids.js';
import { appendJsonl, ensureJsonlFile, readJsonl } from '../utils/jsonl.js';
import {
  ProviderOutputStore,
  providerOutputReferenceFromMetadata,
  type ArchivedProviderSource,
} from './provider-output-store.js';

type ProjectPaths = ReturnType<typeof getProjectPaths>;
type CandidateOwner = Actor | Scene | Card;
type CandidateInspection = FFprobeInspectionResult | ImageInspectionResult;

export interface CandidateWriterDependencies {
  inspectWithFFprobe?: (filePath: string) => Promise<FFprobeInspectionResult>;
  hashFile?: (filePath: string) => Promise<string>;
  now?: () => Date;
  generateId?: () => string;
}

export interface CandidateWriterInput {
  projectRoot: string;
  paths: ProjectPaths;
  media: Media;
  bin: Bin;
  owner?: CandidateOwner;
  takeNumber: number;
  generatedAsset: GeneratedAsset;
  providerOperation: ProviderOperation;
  settings: DefaultBlock;
  resolvedFrom: 'media' | 'bin' | 'owner' | 'global' | 'hardcoded';
  delivery?: DeliveryRequirements;
  dependencies?: CandidateWriterDependencies;
}

export interface CandidateTechnicalFacts {
  inspection?: CandidateInspection;
  alpha?: PNGAlphaAnalysis;
  issues: TakeTechnicalIssue[];
  requestedDelivery?: DeliveryRequirements;
  validated: {
    mime: boolean;
    dimensions: boolean;
    aspectRatio: boolean;
    transparency: boolean;
  };
}

export interface CandidateWriterResult {
  take: Take;
  facts: CandidateTechnicalFacts;
  existing: boolean;
}

/**
 * Promotes a downloaded provider asset into a durable, reviewable take.
 *
 * The provider operation ID is the idempotency key: retries return the prior
 * catalog entry before touching bytes. New bytes are first staged beside their
 * canonical destination, inspected, and only then renamed and cataloged. If a
 * prior process promoted the exact bytes but failed before catalog append, the
 * retry adopts that orphaned file and completes the catalog transaction.
 */
export async function writeCandidate(input: CandidateWriterInput): Promise<CandidateWriterResult> {
  if (resolve(input.paths.root) !== resolve(input.projectRoot)) {
    throw new Error('Candidate project root does not match its catalog paths');
  }
  const existingTakes = await readJsonl<Take>(input.paths.catalog.takes, TakeSchema);
  const existing = existingTakes.find((take) =>
    take.generation_params?.provider === input.providerOperation.providerId
    && take.generation_params?.api_request_id === input.providerOperation.operationId);
  if (existing) {
    return {
      take: existing,
      facts: {
        inspection: inspectionFromTake(existing),
        issues: existing.technical_issues,
        validated: validationFlags(existing.technical_issues),
      },
      existing: true,
    };
  }

  assertSupportedMedia(input.media.media_type);

  const actorBaseFilename = input.owner && 'base_filename' in input.owner ? input.owner.base_filename : undefined;
  const relativePath = constructTakePath(input.media, input.bin, input.takeNumber, actorBaseFilename);
  const finalPath = join(input.projectRoot, relativePath);
  const temporaryPath = join(
    dirname(finalPath),
    `.${basename(finalPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.candidate.tmp`,
  );

  const finalAlreadyPresent = await fs.pathExists(finalPath);
  if (finalAlreadyPresent) {
    const existingBytes = await fs.readFile(finalPath);
    if (!existingBytes.equals(input.generatedAsset.bytes)) {
      throw new Error(`Candidate destination already exists and has no matching provider operation: ${relativePath}`);
    }
  }

  try {
    if (!finalAlreadyPresent) {
      await fs.ensureDir(dirname(finalPath));
      await fs.writeFile(temporaryPath, input.generatedAsset.bytes, { flag: 'wx' });
    }

    const inspectionPath = finalAlreadyPresent ? finalPath : temporaryPath;
    const { inspection, alpha, issues, validated } = await inspectAndValidate(inspectionPath, input);
    const hash = await (input.dependencies?.hashFile ?? defaultHashFile)(inspectionPath);
    const sourceArchive = await archivePostprocessedSource(input);
    if (!finalAlreadyPresent) await fs.move(temporaryPath, finalPath, { overwrite: false });

    const now = (input.dependencies?.now ?? (() => new Date()))().toISOString();
    const take = TakeSchema.parse({
      id: (input.dependencies?.generateId ?? generateId)(),
      media_id: input.media.id,
      take_number: input.takeNumber,
      filename: basename(relativePath),
      path: relativePath,
      format: inspection?.format ?? formatFromMime(input.generatedAsset.mimeType, input.media.media_type),
      size_bytes: input.generatedAsset.bytes.length,
      status: 'new',
      technical_status: issues.length > 0 ? 'invalid' : 'valid',
      technical_issues: issues,
      ...(inspection ? takeFacts(inspection) : {}),
      hash_sha256: hash,
      generated_by: input.providerOperation.providerId,
      generated_at: now,
      generation_params: {
        provider: input.providerOperation.providerId,
        model_id: modelId(input.settings),
        prompt: input.media.prompt,
        resolved_from: input.resolvedFrom,
        full_settings: input.settings,
        owner_type: input.media.owner_type,
        owner_id: input.media.owner_id,
        owner_name: ownerName(input.owner),
        bin_id: input.bin.id,
        bin_name: input.bin.name,
        scene_id: input.media.scene_id,
        api_request_id: input.providerOperation.operationId,
        provider_metadata: {
          operation: input.providerOperation.providerMetadata,
          asset: input.generatedAsset.providerMetadata,
          delivery: input.delivery,
          technical_validation: {
            status: issues.length > 0 ? 'invalid' : 'valid',
            issues,
          },
          ...(sourceArchive ? { source: sourceArchive } : {}),
        },
      },
      created_at: now,
      updated_at: now,
    });

    await fs.ensureDir(dirname(input.paths.catalog.takes));
    await ensureJsonlFile(input.paths.catalog.takes);
    await appendJsonl(input.paths.catalog.takes, take, TakeSchema);
    return {
      take,
      facts: { inspection, alpha, issues, requestedDelivery: input.delivery, validated },
      existing: false,
    };
  } catch (error) {
    await fs.remove(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function archivePostprocessedSource(
  input: CandidateWriterInput,
): Promise<ArchivedProviderSource | undefined> {
  if (input.delivery?.transparency !== true) return undefined;
  const reference = providerOutputReferenceFromMetadata(input.providerOperation.providerMetadata);
  if (!reference) return undefined;

  const finalSha256 = createHash('sha256').update(input.generatedAsset.bytes).digest('hex');
  if (reference.sha256 === finalSha256) return undefined;

  const store = new ProviderOutputStore(input.projectRoot);
  return store.archivePostprocessedSource(reference, finalSha256);
}

async function inspectAndValidate(
  temporaryPath: string,
  input: CandidateWriterInput,
): Promise<{
  inspection?: CandidateInspection;
  alpha?: PNGAlphaAnalysis;
  issues: TakeTechnicalIssue[];
  validated: CandidateTechnicalFacts['validated'];
}> {
  const delivery = input.delivery;
  const issues: TakeTechnicalIssue[] = [];
  const providerMimeIssue = providerMimeIssueFor(input.media.media_type, input.generatedAsset.mimeType);
  if (providerMimeIssue) issues.push(providerMimeIssue);

  if (input.media.media_type === 'image') {
    let inspection: ImageInspectionResult | undefined;
    let alpha: PNGAlphaAnalysis | undefined;
    try {
      inspection = inspectPng(input.generatedAsset.bytes);
    } catch (error) {
      if (!(error instanceof PNGInspectionError)) throw error;
      issues.push(technicalIssue('inspection_failed', 'inspection', error.message));
    }
    if (inspection) {
      const mimeIssue = mimeAgreementIssue(input.generatedAsset.mimeType, inspection.mimeType);
      if (mimeIssue) issues.push(mimeIssue);
      issues.push(...dimensionIssues(inspection.width, inspection.height, delivery));
      try {
        alpha = analyzePngAlpha(input.generatedAsset.bytes);
        const transparencyIssue = transparencyIssueFor(alpha, delivery);
        if (transparencyIssue) issues.push(transparencyIssue);
      } catch (error) {
        issues.push(technicalIssue(
          'inspection_failed',
          'inspection',
          `PNG alpha inspection failed: ${errorMessage(error)}`,
        ));
      }
    }
    return {
      inspection,
      alpha,
      issues,
      validated: validationFlags(issues),
    };
  }

  const inspect = input.dependencies?.inspectWithFFprobe ?? inspectWithFFprobe;
  let inspection: FFprobeInspectionResult | undefined;
  try {
    inspection = await inspect(temporaryPath);
  } catch (error) {
    if (!(error instanceof FFprobeInspectionError) || isFFprobeInfrastructureFailure(error)) throw error;
    issues.push(technicalIssue('inspection_failed', 'inspection', error.message));
  }
  const expectedKind = input.media.media_type === 'video' ? 'video' : 'audio';
  if (inspection) {
    if (inspection.mediaKind !== expectedKind) {
      issues.push(technicalIssue(
        'media_type_mismatch',
        'inspection',
        `Generated ${inspection.mediaKind} does not match ${input.media.media_type} media`,
        expectedKind,
        inspection.mediaKind,
      ));
    }
    const mimeIssue = mimeAgreementIssue(input.generatedAsset.mimeType, inspection.mimeType);
    if (mimeIssue) issues.push(mimeIssue);
    if (inspection.mediaKind === 'video') {
      issues.push(...dimensionIssues(inspection.width, inspection.height, delivery));
    }
  }
  return {
    inspection,
    issues,
    validated: validationFlags(issues),
  };
}

function assertSupportedMedia(mediaType: Media['media_type']): void {
  if (mediaType === 'text') throw new Error('Text media does not produce a binary candidate take');
}

function providerMimeIssueFor(
  mediaType: Media['media_type'],
  mimeType: string,
): TakeTechnicalIssue | undefined {
  const normalized = mimeType.toLowerCase().split(';', 1)[0].trim();
  const valid = mediaType === 'image'
    ? normalized === 'image/png'
    : mediaType === 'video'
      ? normalized.startsWith('video/')
      : normalized.startsWith('audio/');
  if (valid) return undefined;
  return technicalIssue(
    'media_type_mismatch',
    'delivery',
    `Provider MIME ${mimeType} does not match ${mediaType} media`,
    mediaType,
    normalized || 'empty MIME',
  );
}

function mimeAgreementIssue(
  providerMime: string,
  inspectedMime: string,
): TakeTechnicalIssue | undefined {
  const provider = providerMime.toLowerCase().split(';', 1)[0].trim();
  const inspected = inspectedMime.toLowerCase();
  if (provider === inspected) return undefined;
  return technicalIssue(
    'mime_mismatch',
    'inspection',
    `Provider MIME ${providerMime} does not match inspected MIME ${inspectedMime}`,
    inspected,
    provider,
  );
}

function dimensionIssues(
  width: number | undefined,
  height: number | undefined,
  delivery?: DeliveryRequirements,
): TakeTechnicalIssue[] {
  const issues: TakeTechnicalIssue[] = [];
  if (delivery?.width !== undefined && width !== delivery.width) {
    issues.push(technicalIssue(
      'dimensions_mismatch',
      'delivery',
      `Generated width ${width ?? 'unknown'} does not meet requested width ${delivery.width}`,
      String(delivery.width),
      String(width ?? 'unknown'),
    ));
  }
  if (delivery?.height !== undefined && height !== delivery.height) {
    issues.push(technicalIssue(
      'dimensions_mismatch',
      'delivery',
      `Generated height ${height ?? 'unknown'} does not meet requested height ${delivery.height}`,
      String(delivery.height),
      String(height ?? 'unknown'),
    ));
  }
  if (!delivery?.aspectRatio) return issues;
  if (!width || !height) {
    issues.push(technicalIssue(
      'aspect_ratio_mismatch',
      'delivery',
      `Generated asset has no dimensions for requested ${delivery.aspectRatio} aspect ratio`,
      delivery.aspectRatio,
      'unknown',
    ));
    return issues;
  }
  const [requestedWidth, requestedHeight] = delivery.aspectRatio.split(':').map(Number);
  if (width * requestedHeight !== height * requestedWidth) {
    issues.push(technicalIssue(
      'aspect_ratio_mismatch',
      'delivery',
      `Generated ${width}:${height} does not meet requested ${delivery.aspectRatio} aspect ratio`,
      delivery.aspectRatio,
      `${width}:${height}`,
    ));
  }
  return issues;
}

function transparencyIssueFor(
  alpha: PNGAlphaAnalysis,
  delivery?: DeliveryRequirements,
): TakeTechnicalIssue | undefined {
  if (delivery?.transparency && !alpha.hasTransparentPixels) {
    return technicalIssue(
      'transparency_missing',
      'delivery',
      'Generated PNG does not contain transparent pixels as requested',
      'transparent pixels',
      'fully opaque',
    );
  }
  return undefined;
}

function takeFacts(inspection: CandidateInspection): Partial<Take> {
  if (inspection.mediaKind === 'image') return { width: inspection.width, height: inspection.height };
  if (inspection.mediaKind === 'video') {
    return { duration_sec: inspection.durationSeconds, width: inspection.width, height: inspection.height, fps: inspection.frameRate };
  }
  return { duration_sec: inspection.durationSeconds, sample_rate: inspection.sampleRate, channels: inspection.channels };
}

function validationFlags(issues: TakeTechnicalIssue[]): CandidateTechnicalFacts['validated'] {
  const codes = new Set(issues.map(issue => issue.code));
  return {
    mime: !codes.has('media_type_mismatch') && !codes.has('mime_mismatch') && !codes.has('inspection_failed'),
    dimensions: !codes.has('dimensions_mismatch') && !codes.has('inspection_failed'),
    aspectRatio: !codes.has('aspect_ratio_mismatch') && !codes.has('inspection_failed'),
    transparency: !codes.has('transparency_missing') && !codes.has('inspection_failed'),
  };
}

function technicalIssue(
  code: TakeTechnicalIssue['code'],
  stage: TakeTechnicalIssue['stage'],
  message: string,
  expected?: string,
  actual?: string,
): TakeTechnicalIssue {
  return {
    code,
    stage,
    message,
    ...(expected ? { expected } : {}),
    ...(actual ? { actual } : {}),
  };
}

function isFFprobeInfrastructureFailure(error: FFprobeInspectionError): boolean {
  const cause = error.cause;
  if (!cause || typeof cause !== 'object') return false;
  const code = 'code' in cause ? String(cause.code) : '';
  return ['ENOENT', 'EACCES', 'EPERM'].includes(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatFromMime(mimeType: string, mediaType: Media['media_type']): string {
  const mime = mimeType.toLowerCase().split(';', 1)[0].trim();
  const known: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return known[mime]
    ?? mime.split('/')[1]?.replace(/[^a-z0-9.+-]/g, '')
    ?? (mediaType === 'image' ? 'png' : mediaType === 'video' ? 'mp4' : 'mp3');
}

function inspectionFromTake(take: Take): CandidateInspection | undefined {
  if (take.technical_issues.some(issue => issue.code === 'inspection_failed')) return undefined;
  const kind = take.format === 'png' ? 'image' : take.format === 'mp4' ? 'video' : 'audio';
  if (kind === 'image') {
    if (!take.width || !take.height) return undefined;
    return { mediaKind: 'image', format: take.format, mimeType: 'image/png', byteLength: take.size_bytes, width: take.width, height: take.height, hasAlphaChannel: false, hasAlpha: false };
  }
  if (kind === 'video') {
    return { mediaKind: 'video', format: take.format, mimeType: 'video/mp4', byteLength: take.size_bytes, durationSeconds: take.duration_sec, width: take.width, height: take.height, frameRate: take.fps, codec: 'unknown', container: take.format, bitrate: 0, audioTrackCount: 0 };
  }
  return { mediaKind: 'audio', format: take.format, mimeType: 'audio/mpeg', byteLength: take.size_bytes, durationSeconds: take.duration_sec, sampleRate: take.sample_rate, channels: take.channels, codec: 'unknown', container: take.format, bitrate: 0, audioTrackCount: 0 };
}

function ownerName(owner?: CandidateOwner): string {
  if (!owner) return 'Global';
  return 'display_name' in owner ? owner.display_name : owner.name;
}

function modelId(settings: DefaultBlock): string | undefined {
  return settings.model_id ?? settings.model;
}

async function defaultHashFile(filePath: string): Promise<string> {
  const bytes = await fs.readFile(filePath);
  return createHash('sha256').update(bytes).digest('hex');
}
