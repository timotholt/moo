import fs from 'fs-extra';
import { basename, join } from 'path';
import { getProjectPaths } from '../utils/paths.js';

const CATALOG_FILES = [
  'actors.jsonl',
  'scenes.jsonl',
  'bins.jsonl',
  'media.jsonl',
  'takes.jsonl',
  'generation-jobs.jsonl',
  'releases.jsonl',
  'snapshots.jsonl',
  'redo-snapshots.jsonl',
] as const;

export interface InitializeProjectOptions {
  displayName?: string;
  defaultsTemplatePath?: string;
}

/** Create the complete canonical V2 project layout without overwriting data. */
export async function initializeProject(
  projectRoot: string,
  options: InitializeProjectOptions = {},
): Promise<void> {
  const paths = getProjectPaths(projectRoot);
  const isNewProject = !(await fs.pathExists(paths.moo.config));

  await Promise.all([
    fs.ensureDir(paths.moo.dir),
    fs.ensureDir(paths.media.actors),
    fs.ensureDir(paths.media.scenes),
    fs.ensureDir(paths.media.global),
    fs.ensureDir(paths.media.exports),
    fs.ensureDir(paths.catalog.indexes.dir),
    fs.ensureDir(join(paths.catalog.indexes.dir, 'by_actor')),
    fs.ensureDir(join(paths.catalog.indexes.dir, 'by_bin')),
    fs.ensureDir(join(paths.catalog.indexes.dir, 'by_media')),
  ]);

  await Promise.all(CATALOG_FILES.map((file) => fs.ensureFile(join(paths.moo.dir, file))));

  if (isNewProject) {
    await fs.writeJson(paths.moo.config, {
      name: options.displayName?.trim() || basename(projectRoot),
      schema_version: '2.0.0',
      created_at: new Date().toISOString(),
    }, { spaces: 2 });
  }

  if (!(await fs.pathExists(paths.moo.defaults))) {
    if (options.defaultsTemplatePath && await fs.pathExists(options.defaultsTemplatePath)) {
      await fs.copy(options.defaultsTemplatePath, paths.moo.defaults);
    } else {
      await fs.writeJson(paths.moo.defaults, { schema_version: '2.0.0', content_types: {} }, { spaces: 2 });
    }
  }
}
