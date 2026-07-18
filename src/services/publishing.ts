import fs from 'fs-extra';
import { basename, dirname, join, extname } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import type { Card, Media, ReleaseRecord, Take } from '../types/index.js';
import { appendJsonl, readJsonl } from '../utils/jsonl.js';
import { CardSchema, MediaSchema, TakeSchema } from '../shared/schemas/index.js';
import { renderProjectCard, type RenderProjectCardResult } from './card-renderer.js';

export interface PublishResult {
  release_id: string;
  release_dir: string;
  manifest_path: string;
  exported_count: number;
  skipped: Array<{ media_id: string; reason: string }>;
}

interface ExportCandidate {
  cue: Media;
  take: Take;
  filename: string;
  source: string;
  destinationDirectory: string;
}

function releaseId(input?: string): string {
  const fallback = new Date().toISOString().replace(/[:.]/g, '-');
  return (input?.trim() || `release-${fallback}`)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateExportFilename(filename: string): string {
  const normalized = filename.trim();
  if (!normalized || basename(normalized) !== normalized || normalized === '.' || normalized === '..') {
    throw new Error(`Export filename must be a plain file name: ${filename}`);
  }
  return normalized;
}

function videoOrientation(take: Take): 'landscape' | 'portrait' {
  const configuredRatio = take.generation_params?.full_settings?.aspect_ratio;
  if (configuredRatio === '9:16') return 'portrait';
  if (configuredRatio === '16:9') return 'landscape';
  if (take.width && take.height && take.height > take.width) return 'portrait';
  return 'landscape';
}

function publicationDirectory(cue: Media, take: Take): string {
  switch (cue.media_type) {
    case 'dialogue':
    case 'music':
    case 'sfx':
      return 'audio';
    case 'image':
      return cue.owner_type === 'card' ? 'cards/source-art' : 'images';
    case 'video':
      return `video/${videoOrientation(take)}`;
    case 'text':
      return 'text';
  }
}

function manifestPath(...parts: string[]): string {
  return parts.join('/');
}

/** Create a portable, game-agnostic release from explicitly selected takes. */
export async function publishSelectedTakes(projectRoot: string, requestedReleaseId?: string): Promise<PublishResult> {
  const paths = getProjectPaths(projectRoot);
  const [cards, media, takes] = await Promise.all([
    readJsonl<Card>(paths.catalog.cards, CardSchema),
    readJsonl<Media>(paths.catalog.media, MediaSchema),
    readJsonl<Take>(paths.catalog.takes, TakeSchema),
  ]);
  const id = releaseId(requestedReleaseId);
  if (!id) throw new Error('Release ID must contain at least one letter or number');

  const releaseDir = join(paths.media.exports, id);
  const stagingDir = join(paths.media.exports, `.${id}.staging`);
  if (await fs.pathExists(releaseDir)) throw new Error(`Release already exists: ${id}`);
  if (await fs.pathExists(stagingDir)) throw new Error(`Release staging directory already exists: ${id}`);

  const candidates: ExportCandidate[] = [];
  const usedFilenames = new Set<string>();
  const cardSlotsByMediaId = new Map<string, { cardId: string; slotKey: string }>();
  for (const card of cards) {
    for (const slot of card.asset_slots) {
      if (slot.media_id) cardSlotsByMediaId.set(slot.media_id, { cardId: card.id, slotKey: slot.key });
    }
  }

  for (const cue of media) {
    const selectedIds = cue.selected_take_ids || [];
    if (selectedIds.length === 0) continue;
    for (const takeId of selectedIds) {
      const take = takes.find((candidate) => candidate.id === takeId && candidate.media_id === cue.id);
      if (!take || take.status !== 'approved') throw new Error(`Cue ${cue.name}: selected take ${takeId} is not an approved cue take`);
      if (take.technical_status === 'invalid') {
        throw new Error(`Cue ${cue.name}: selected take ${takeId} is technically invalid`);
      }
      const source = join(projectRoot, take.path);
      if (!(await fs.pathExists(source))) throw new Error(`Cue ${cue.name}: selected source file is missing: ${take.path}`);
      const destinationDirectory = publicationDirectory(cue, take);
      let filename = validateExportFilename(cue.export_filename || basename(take.path));
      const collisionKey = (candidate: string) => manifestPath(destinationDirectory, candidate);
      if (usedFilenames.has(collisionKey(filename))) {
        const ext = extname(filename);
        const base = basename(filename, ext);
        const takeNumStr = take.take_number ? String(take.take_number).padStart(3, '0') : '';
        
        let resolved = false;
        if (takeNumStr) {
          const attempt = `${base}_${takeNumStr}${ext}`;
          if (!usedFilenames.has(collisionKey(attempt))) {
            filename = attempt;
            resolved = true;
          }
        }
        
        if (!resolved) {
          let counter = 1;
          while (usedFilenames.has(collisionKey(`${base}_${counter}${ext}`))) {
            counter++;
          }
          filename = `${base}_${counter}${ext}`;
        }
      }
      usedFilenames.add(collisionKey(filename));
      candidates.push({ cue, take, filename, source, destinationDirectory });
    }
  }
  const renderedCards: Array<{ card: Card; render: RenderProjectCardResult }> = [];
  for (const card of cards) {
    renderedCards.push({ card, render: await renderProjectCard(projectRoot, card.id) });
  }
  if (candidates.length === 0 && renderedCards.length === 0) {
    throw new Error('Select at least one approved take or create a renderable card before publishing a release');
  }

  const selected: Array<Record<string, unknown>> = [];
  const skipped: PublishResult['skipped'] = [];
  try {
    await fs.ensureDir(stagingDir);
    for (const { cue, take, filename, source, destinationDirectory } of candidates) {
      const relativeDestination = manifestPath(destinationDirectory, filename);
      const destination = join(stagingDir, destinationDirectory, filename);
      await fs.ensureDir(dirname(destination));
      await fs.copy(source, destination);
      selected.push({
        cue_id: cue.id,
        cue_key: cue.cue_key || cue.name,
        media_type: cue.media_type,
        tags: cue.tags || [],
        variation_group: cue.variation_group || null,
        locale: cue.locale || null,
        looping: cue.looping || false,
        mix_bus: cue.mix_bus || null,
        selected_take_id: take.id,
        owner_type: cue.owner_type,
        owner_id: cue.owner_id,
        card_id: cardSlotsByMediaId.get(cue.id)?.cardId ?? null,
        card_slot_key: cardSlotsByMediaId.get(cue.id)?.slotKey ?? null,
        file: relativeDestination,
        format: take.format,
        duration_sec: take.duration_sec || null,
        width: take.width || null,
        height: take.height || null,
        fps: take.fps || null,
        hash_sha256: take.hash_sha256 || null,
        generation_params: take.generation_params || null,
      });
    }

    const publishedCards: Array<Record<string, unknown>> = [];
    for (const { card, render } of renderedCards) {
      const renderedFilename = `${card.key}.svg`;
      const metadataFilename = `${card.key}.composition.json`;
      const renderedDestination = join(stagingDir, 'cards', 'rendered', renderedFilename);
      const metadataDestination = join(stagingDir, 'cards', 'rendered', metadataFilename);
      await fs.ensureDir(dirname(renderedDestination));
      await fs.copy(join(projectRoot, render.relativePath), renderedDestination);
      await fs.copy(join(projectRoot, render.metadataRelativePath), metadataDestination);
      publishedCards.push({
        card_id: card.id,
        card_key: card.key,
        name: card.name,
        rendered_file: manifestPath('cards', 'rendered', renderedFilename),
        composition_file: manifestPath('cards', 'rendered', metadataFilename),
        format: 'svg',
        mime_type: render.mimeType,
        width: render.width,
        height: render.height,
        hash_sha256: render.hashSha256,
        provenance: render.provenance,
        slots: card.asset_slots.map(slot => ({
          key: slot.key,
          asset_kind: slot.asset_kind,
          required: slot.required,
          media_id: slot.media_id ?? null,
          delivery: slot.delivery,
        })),
      });
    }

    const stagingManifestPath = join(stagingDir, 'manifest.json');
    await fs.writeJson(stagingManifestPath, {
    schema_version: '3.0.0',
    release_id: id,
    created_at: new Date().toISOString(),
    source_project: (await fs.readJson(paths.moo.config).catch(() => ({}))).name || basename(projectRoot),
    assets: selected,
    cards: publishedCards,
    skipped,
    }, { spaces: 2 });
    await fs.move(stagingDir, releaseDir, { overwrite: false });
    const releases = await readJsonl<ReleaseRecord>(paths.catalog.releases);
    if (releases.some((release) => release.release_id === id)) throw new Error(`Release is already recorded: ${id}`);
    await appendJsonl<ReleaseRecord>(paths.catalog.releases, {
      release_id: id,
      created_at: new Date().toISOString(),
      manifest_path: `exports/${id}/manifest.json`,
      exported_count: selected.length + renderedCards.length,
    });
  } catch (error) {
    // If recording fails after promotion, leave the valid release on disk for
    // recovery rather than deleting the author's finished output.
    if (await fs.pathExists(releaseDir)) throw error;
    await fs.remove(stagingDir);
    throw error;
  }

  return {
    release_id: id,
    release_dir: releaseDir,
    manifest_path: join(releaseDir, 'manifest.json'),
    exported_count: selected.length + renderedCards.length,
    skipped,
  };
}
