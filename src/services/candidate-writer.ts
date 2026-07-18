import { createHash } from 'node:crypto';
import { basename, dirname, join, resolve } from 'node:path';

import fs from 'fs-extra';

import type { Actor } from '../shared/schemas/actor.schema.js';
import type { Bin } from '../shared/schemas/bin.schema.js';
import type { DefaultBlock } from '../shared/schemas/common.schema.js';
import type { Media } from '../shared/schemas/media.schema.js';
import type { Scene } from '../shared/schemas/scene.schema.js';
import type { Card } from '../shared/schemas/card.schema.js';
import { TakeSchema, type Take } from '../shared/schemas/take.schema.js';
import type { GeneratedAsset, ProviderOperation, DeliveryRequirements } from './generators/types.js';
import { inspectWithFFprobe, type FFprobeInspectionResult } from './inspection/ffprobe-inspector.js';
import { analyzePngAlpha, type PNGAlphaAnalysis } from './inspection/png-alpha.js';
import { inspectPng } from './inspection/png-inspector.js';
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
  inspection: CandidateInspection;
  alpha?: PNGAlphaAnalysis;
  requestedDelivery?: DeliveryRequirements;
  validated: {
    mime: true;
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
 * canonical destination, inspected, and only then renamed and cataloged.
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
        validated: { mime: true, dimensions: true, aspectRatio: true, transparency: true },
      },
      existing: true,
    };
  }

  assertSupportedMedia(input.media.media_type);
  assertProviderMimeMatches(input.media.media_type, input.generatedAsset.mimeType);

  const actorBaseFilename = input.owner && 'base_filename' in input.owner ? input.owner.base_filename : undefined;
  const relativePath = constructTakePath(input.media, input.bin, input.takeNumber, actorBaseFilename);
  const finalPath = join(input.projectRoot, relativePath);
  const temporaryPath = join(
    dirname(finalPath),
    `.${basename(finalPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.candidate.tmp`,
  );

  if (await fs.pathExists(finalPath)) {
    throw new Error(`Candidate destination already exists and has no matching provider operation: ${relativePath}`);
  }

  try {
    await fs.ensureDir(dirname(finalPath));
    await fs.writeFile(temporaryPath, input.generatedAsset.bytes, { flag: 'wx' });

    const { inspection, alpha, validated } = await inspectAndValidate(temporaryPath, input);
    const hash = await (input.dependencies?.hashFile ?? defaultHashFile)(temporaryPath);
    const sourceArchive = await archivePostprocessedSource(input);
    await fs.move(temporaryPath, finalPath, { overwrite: false });

    const now = (input.dependencies?.now ?? (() => new Date()))().toISOString();
    const take = TakeSchema.parse({
      id: (input.dependencies?.generateId ?? generateId)(),
      media_id: input.media.id,
      take_number: input.takeNumber,
      filename: basename(relativePath),
      path: relativePath,
      format: inspection.format,
      size_bytes: input.generatedAsset.bytes.length,
      status: 'new',
      ...takeFacts(inspection),
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
          ...(sourceArchive ? { source: sourceArchive } : {}),
        },
      },
      created_at: now,
      updated_at: now,
    });

    await fs.ensureDir(dirname(input.paths.catalog.takes));
    await ensureJsonlFile(input.paths.catalog.takes);
    await appendJsonl(input.paths.catalog.takes, take, TakeSchema);
    return { take, facts: { inspection, alpha, requestedDelivery: input.delivery, validated }, existing: false };
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
): Promise<{ inspection: CandidateInspection; alpha?: PNGAlphaAnalysis; validated: CandidateTechnicalFacts['validated'] }> {
  const delivery = input.delivery;
  if (input.media.media_type === 'image') {
    const inspection = inspectPng(input.generatedAsset.bytes);
    const alpha = analyzePngAlpha(input.generatedAsset.bytes);
    assertMimeAgreement(input.generatedAsset.mimeType, inspection.mimeType);
    validateDimensions(inspection.width, inspection.height, delivery);
    validateTransparency(alpha, delivery);
    return {
      inspection,
      alpha,
      validated: {
        mime: true,
        dimensions: Boolean(delivery?.width || delivery?.height),
        aspectRatio: Boolean(delivery?.aspectRatio),
        transparency: delivery?.transparency === true,
      },
    };
  }

  const inspect = input.dependencies?.inspectWithFFprobe ?? inspectWithFFprobe;
  const inspection = await inspect(temporaryPath);
  const expectedKind = input.media.media_type === 'video' ? 'video' : 'audio';
  if (inspection.mediaKind !== expectedKind) {
    throw new Error(`Generated ${inspection.mediaKind} does not match ${input.media.media_type} media`);
  }
  assertMimeAgreement(input.generatedAsset.mimeType, inspection.mimeType);

  if (inspection.mediaKind === 'video') validateDimensions(inspection.width, inspection.height, delivery);
  return {
    inspection,
    validated: {
      mime: true,
      dimensions: inspection.mediaKind === 'video' && Boolean(delivery?.width || delivery?.height),
      aspectRatio: inspection.mediaKind === 'video' && Boolean(delivery?.aspectRatio),
      transparency: false,
    },
  };
}

function assertSupportedMedia(mediaType: Media['media_type']): void {
  if (mediaType === 'text') throw new Error('Text media does not produce a binary candidate take');
}

function assertProviderMimeMatches(mediaType: Media['media_type'], mimeType: string): void {
  const normalized = mimeType.toLowerCase().split(';', 1)[0].trim();
  const valid = mediaType === 'image'
    ? normalized === 'image/png'
    : mediaType === 'video'
      ? normalized.startsWith('video/')
      : normalized.startsWith('audio/');
  if (!valid) throw new Error(`Provider MIME ${mimeType} does not match ${mediaType} media`);
}

function assertMimeAgreement(providerMime: string, inspectedMime: string): void {
  const provider = providerMime.toLowerCase().split(';', 1)[0].trim();
  const inspected = inspectedMime.toLowerCase();
  if (provider !== inspected) throw new Error(`Provider MIME ${providerMime} does not match inspected MIME ${inspectedMime}`);
}

function validateDimensions(width: number | undefined, height: number | undefined, delivery?: DeliveryRequirements): void {
  if (delivery?.width !== undefined && width !== delivery.width) throw new Error(`Generated width ${width} does not meet requested width ${delivery.width}`);
  if (delivery?.height !== undefined && height !== delivery.height) throw new Error(`Generated height ${height} does not meet requested height ${delivery.height}`);
  if (!delivery?.aspectRatio) return;
  if (!width || !height) throw new Error(`Generated asset has no dimensions for requested ${delivery.aspectRatio} aspect ratio`);
  const [requestedWidth, requestedHeight] = delivery.aspectRatio.split(':').map(Number);
  if (width * requestedHeight !== height * requestedWidth) {
    throw new Error(`Generated ${width}:${height} does not meet requested ${delivery.aspectRatio} aspect ratio`);
  }
}

function validateTransparency(alpha: PNGAlphaAnalysis, delivery?: DeliveryRequirements): void {
  if (delivery?.transparency && !alpha.hasTransparentPixels) {
    throw new Error('Generated PNG does not contain transparent pixels as requested');
  }
}

function takeFacts(inspection: CandidateInspection): Partial<Take> {
  if (inspection.mediaKind === 'image') return { width: inspection.width, height: inspection.height };
  if (inspection.mediaKind === 'video') {
    return { duration_sec: inspection.durationSeconds, width: inspection.width, height: inspection.height, fps: inspection.frameRate };
  }
  return { duration_sec: inspection.durationSeconds, sample_rate: inspection.sampleRate, channels: inspection.channels };
}

function inspectionFromTake(take: Take): CandidateInspection {
  const kind = take.format === 'png' ? 'image' : take.format === 'mp4' ? 'video' : 'audio';
  if (kind === 'image') {
    return { mediaKind: 'image', format: take.format, mimeType: 'image/png', byteLength: take.size_bytes, width: take.width ?? 1, height: take.height ?? 1, hasAlphaChannel: false, hasAlpha: false };
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
