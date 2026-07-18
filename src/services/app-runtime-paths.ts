import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RuntimePathInputs {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
  workingDirectory?: string;
}

export interface MooRuntimePaths {
  dataRoot: string;
  globalConfig: string;
  projects: string;
}

/**
 * Resolve MOO's writable application data root.
 *
 * Source development remains repository-local. Packaged launchers opt into
 * native user-data locations with MOO_PACKAGED=1, while MOO_DATA_DIR provides
 * an explicit override for tests, portable installs, and custom deployments.
 */
export function resolveMooDataRoot(inputs: RuntimePathInputs = {}): string {
  const env = inputs.env ?? process.env;
  const explicit = env.MOO_DATA_DIR?.trim();
  if (explicit) return resolve(explicit);

  const workingDirectory = inputs.workingDirectory ?? process.cwd();
  if (env.MOO_PACKAGED !== '1') return resolve(workingDirectory);

  const platform = inputs.platform ?? process.platform;
  const home = inputs.homeDirectory ?? homedir();
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'MOO');
  if (platform === 'win32') {
    return join(env.APPDATA?.trim() || join(home, 'AppData', 'Roaming'), 'MOO');
  }
  return join(env.XDG_DATA_HOME?.trim() || join(home, '.local', 'share'), 'moo');
}

export function getMooRuntimePaths(inputs: RuntimePathInputs = {}): MooRuntimePaths {
  const dataRoot = resolveMooDataRoot(inputs);
  return {
    dataRoot,
    globalConfig: join(dataRoot, '.moo-config.json'),
    projects: join(dataRoot, 'projects'),
  };
}

/**
 * Resolve the defaults template beside source/compiled application resources,
 * never relative to an arbitrary launch working directory.
 */
export function getDefaultsTemplatePath(env: NodeJS.ProcessEnv = process.env): string {
  const explicitResourceRoot = env.MOO_RESOURCE_DIR?.trim();
  if (explicitResourceRoot) return join(resolve(explicitResourceRoot), 'templates', 'defaults.template.json');
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  return resolve(moduleDirectory, '..', 'templates', 'defaults.template.json');
}

export function isPathInside(parent: string, candidate: string): boolean {
  const resolvedParent = resolve(parent);
  const resolvedCandidate = resolve(candidate);
  return resolvedCandidate === resolvedParent || resolvedCandidate.startsWith(`${resolvedParent}${sep}`);
}
