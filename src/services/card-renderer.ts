import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

import fs from 'fs-extra';

import { CardSchema, type Card } from '../shared/schemas/card.schema.js';
import { MediaSchema, type Media } from '../shared/schemas/media.schema.js';
import { TakeSchema, type Take } from '../shared/schemas/take.schema.js';
import { readJsonl } from '../utils/jsonl.js';
import { getProjectPaths } from '../utils/paths.js';
import {
  composeCardSvg,
  type CardCompositionAsset,
  type CardCompositionResult,
} from './card-compositor.js';

export interface RenderProjectCardResult extends CardCompositionResult {
  cardId: string;
  relativePath: string;
  metadataRelativePath: string;
}

/** Compose one card from the exactly-one selected approved take in each assigned slot. */
export async function renderProjectCard(
  projectRoot: string,
  cardId: string,
): Promise<RenderProjectCardResult> {
  const paths = getProjectPaths(projectRoot);
  const [cards, media, takes] = await Promise.all([
    readJsonl<Card>(paths.catalog.cards, CardSchema),
    readJsonl<Media>(paths.catalog.media, MediaSchema),
    readJsonl<Take>(paths.catalog.takes, TakeSchema),
  ]);
  const card = cards.find(candidate => candidate.id === cardId);
  if (!card) throw new Error(`Card "${cardId}" was not found`);

  const compositionAssets: CardCompositionAsset[] = [];
  for (const slot of card.asset_slots) {
    if (!slot.media_id) {
      if (slot.required) throw new Error(`Card "${card.name}" required slot "${slot.key}" has no media request`);
      continue;
    }
    const request = media.find(candidate => candidate.id === slot.media_id);
    if (!request || request.owner_type !== 'card' || request.owner_id !== card.id) {
      throw new Error(`Card slot "${slot.key}" references missing or foreign media "${slot.media_id}"`);
    }
    if (request.media_type !== slot.asset_kind) {
      throw new Error(`Card slot "${slot.key}" expects ${slot.asset_kind} but media "${request.name}" is ${request.media_type}`);
    }

    const selectedIds = request.selected_take_ids ?? [];
    if (selectedIds.length === 0 && !slot.required) continue;
    if (selectedIds.length !== 1) {
      throw new Error(`Card slot "${slot.key}" requires exactly one selected take`);
    }
    const take = takes.find(candidate =>
      candidate.id === selectedIds[0] && candidate.media_id === request.id);
    if (!take || take.status !== 'approved') {
      throw new Error(`Card slot "${slot.key}" selected take is missing or not approved`);
    }
    if (take.technical_status === 'invalid') {
      throw new Error(`Card slot "${slot.key}" selected take is technically invalid`);
    }

    const sourcePath = join(projectRoot, take.path);
    if (!(await fs.pathExists(sourcePath))) {
      throw new Error(`Card slot "${slot.key}" selected file is missing: ${take.path}`);
    }
    const bytes = await fs.readFile(sourcePath);
    const actualHash = sha256(bytes);
    if (take.hash_sha256 && take.hash_sha256 !== actualHash) {
      throw new Error(`Card slot "${slot.key}" selected file hash does not match its catalog record`);
    }
    compositionAssets.push({
      slotKey: slot.key,
      mediaId: request.id,
      takeId: take.id,
      hashSha256: actualHash,
      mimeType: takeMimeType(take),
      ...(slot.asset_kind === 'image' ? { bytes } : {}),
    });
  }

  const composition = composeCardSvg({ card, assets: compositionAssets });
  const relativePath = `cards/${card.key}/rendered/${card.key}.svg`;
  const metadataRelativePath = `cards/${card.key}/rendered/${card.key}.composition.json`;
  const finalPath = join(projectRoot, relativePath);
  const metadataPath = join(projectRoot, metadataRelativePath);
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const temporarySvg = join(dirname(finalPath), `.${basename(finalPath)}.${token}.tmp`);
  const temporaryMetadata = join(dirname(metadataPath), `.${basename(metadataPath)}.${token}.tmp`);

  await fs.ensureDir(dirname(finalPath));
  try {
    await fs.writeFile(temporarySvg, composition.bytes, { flag: 'wx' });
    await fs.writeJson(temporaryMetadata, {
      schema_version: '1.0.0',
      card_id: card.id,
      card_key: card.key,
      output_file: relativePath,
      output_hash_sha256: composition.hashSha256,
      width: composition.width,
      height: composition.height,
      mime_type: composition.mimeType,
      provenance: composition.provenance,
    }, { spaces: 2, flag: 'wx' });
    await fs.move(temporarySvg, finalPath, { overwrite: true });
    await fs.move(temporaryMetadata, metadataPath, { overwrite: true });
  } catch (error) {
    await Promise.all([
      fs.remove(temporarySvg).catch(() => undefined),
      fs.remove(temporaryMetadata).catch(() => undefined),
    ]);
    throw error;
  }

  return {
    ...composition,
    cardId: card.id,
    relativePath,
    metadataRelativePath,
  };
}

function takeMimeType(take: Take): string {
  const format = take.format.toLowerCase();
  if (['png', 'jpeg', 'jpg', 'webp'].includes(format)) {
    return format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  }
  if (['mp4', 'webm', 'mov'].includes(format)) {
    return format === 'mov' ? 'video/quicktime' : `video/${format}`;
  }
  const audio = format === 'mp3' ? 'mpeg' : format === 'm4a' ? 'mp4' : format;
  return `audio/${audio}`;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
