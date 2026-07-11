import fs from 'fs-extra';
import { basename, join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import type { Media, ReleaseRecord, Take } from '../types/index.js';
import { appendJsonl, readJsonl } from '../utils/jsonl.js';
import { MediaSchema, TakeSchema } from '../shared/schemas/index.js';

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

/** Create a portable, game-agnostic release from explicitly selected takes. */
export async function publishSelectedTakes(projectRoot: string, requestedReleaseId?: string): Promise<PublishResult> {
  const paths = getProjectPaths(projectRoot);
  const [media, takes] = await Promise.all([
    readJsonl<Media>(paths.catalog.media, MediaSchema),
    readJsonl<Take>(paths.catalog.takes, TakeSchema),
  ]);
  const id = releaseId(requestedReleaseId);
  if (!id) throw new Error('Release ID must contain at least one letter or number');

  const releaseDir = join(paths.media.exports, id);
  const stagingDir = join(paths.media.exports, `.${id}.staging`);
  const audioDir = join(stagingDir, 'audio');
  if (await fs.pathExists(releaseDir)) throw new Error(`Release already exists: ${id}`);
  if (await fs.pathExists(stagingDir)) throw new Error(`Release staging directory already exists: ${id}`);

  const candidates: ExportCandidate[] = [];
  const usedFilenames = new Set<string>();

  for (const cue of media) {
    const selectedIds = cue.selected_take_ids || [];
    if (selectedIds.length === 0) continue;
    for (const takeId of selectedIds) {
      const take = takes.find((candidate) => candidate.id === takeId && candidate.media_id === cue.id);
      if (!take || take.status !== 'approved') throw new Error(`Cue ${cue.name}: selected take ${takeId} is not an approved cue take`);
      const source = join(projectRoot, take.path);
      if (!(await fs.pathExists(source))) throw new Error(`Cue ${cue.name}: selected source file is missing: ${take.path}`);
      const filename = validateExportFilename(cue.export_filename || basename(take.path));
      if (usedFilenames.has(filename)) throw new Error(`Duplicate export filename: ${filename}`);
      usedFilenames.add(filename);
      candidates.push({ cue, take, filename, source });
    }
  }
  if (candidates.length === 0) throw new Error('Select at least one approved take before publishing a release');

  const selected: Array<Record<string, unknown>> = [];
  const skipped: PublishResult['skipped'] = [];
  try {
    await fs.ensureDir(audioDir);
    for (const { cue, take, filename, source } of candidates) {
      await fs.copy(source, join(audioDir, filename));
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
        file: `audio/${filename}`,
        format: take.format,
        duration_sec: take.duration_sec || null,
        hash_sha256: take.hash_sha256 || null,
        generation_params: take.generation_params || null,
      });
    }

    const stagingManifestPath = join(stagingDir, 'manifest.json');
    await fs.writeJson(stagingManifestPath, {
    schema_version: '1.0.0',
    release_id: id,
    created_at: new Date().toISOString(),
    source_project: (await fs.readJson(paths.moo.config).catch(() => ({}))).name || basename(projectRoot),
    assets: selected,
    skipped,
    }, { spaces: 2 });
    await fs.move(stagingDir, releaseDir, { overwrite: false });
    const releases = await readJsonl<ReleaseRecord>(paths.catalog.releases);
    if (releases.some((release) => release.release_id === id)) throw new Error(`Release is already recorded: ${id}`);
    await appendJsonl<ReleaseRecord>(paths.catalog.releases, {
      release_id: id,
      created_at: new Date().toISOString(),
      manifest_path: `exports/${id}/manifest.json`,
      exported_count: selected.length,
    });
  } catch (error) {
    // If recording fails after promotion, leave the valid release on disk for
    // recovery rather than deleting the author's finished output.
    if (await fs.pathExists(releaseDir)) throw error;
    await fs.remove(stagingDir);
    throw error;
  }

  return { release_id: id, release_dir: releaseDir, manifest_path: join(releaseDir, 'manifest.json'), exported_count: selected.length, skipped };
}
