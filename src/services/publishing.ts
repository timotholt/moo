import fs from 'fs-extra';
import { basename, join } from 'path';
import { getProjectPaths } from '../utils/paths.js';
import { readJsonl } from '../utils/jsonl.js';
import type { Media, Take } from '../types/index.js';
import { MediaSchema, TakeSchema } from '../shared/schemas/index.js';

export interface PublishResult {
  release_id: string;
  release_dir: string;
  manifest_path: string;
  exported_count: number;
  skipped: Array<{ media_id: string; reason: string }>;
}

function releaseId(input?: string): string {
  const fallback = new Date().toISOString().replace(/[:.]/g, '-');
  return (input?.trim() || `release-${fallback}`)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  const audioDir = join(releaseDir, 'audio');
  if (await fs.pathExists(releaseDir)) throw new Error(`Release already exists: ${id}`);
  await fs.ensureDir(audioDir);

  const selected: Array<Record<string, unknown>> = [];
  const skipped: PublishResult['skipped'] = [];

  for (const cue of media) {
    const selectedIds = cue.selected_take_ids || [];
    if (selectedIds.length === 0) continue;
    for (const takeId of selectedIds) {
      const take = takes.find((candidate) => candidate.id === takeId && candidate.media_id === cue.id);
      if (!take || take.status !== 'approved') {
        skipped.push({ media_id: cue.id, reason: `selected take ${takeId} is not an approved cue take` });
        continue;
      }
      const source = join(projectRoot, take.path);
      if (!(await fs.pathExists(source))) {
        skipped.push({ media_id: cue.id, reason: `selected source file is missing: ${take.path}` });
        continue;
      }
      const filename = cue.export_filename || basename(take.path);
      const destination = join(audioDir, filename);
      if (await fs.pathExists(destination)) {
        skipped.push({ media_id: cue.id, reason: `duplicate export filename: ${filename}` });
        continue;
      }
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
        file: `audio/${filename}`,
        format: take.format,
        duration_sec: take.duration_sec || null,
        hash_sha256: take.hash_sha256 || null,
        generation_params: take.generation_params || null,
      });
    }
  }

  const manifestPath = join(releaseDir, 'manifest.json');
  await fs.writeJson(manifestPath, {
    schema_version: '1.0.0',
    release_id: id,
    created_at: new Date().toISOString(),
    source_project: (await fs.readJson(paths.moo.config).catch(() => ({}))).name || basename(projectRoot),
    assets: selected,
    skipped,
  }, { spaces: 2 });

  return { release_id: id, release_dir: releaseDir, manifest_path: manifestPath, exported_count: selected.length, skipped };
}
