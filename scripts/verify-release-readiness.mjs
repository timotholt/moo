#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const checks = [];

function record(status, name, detail) {
  checks.push({ status, name, detail });
}

async function fileExists(relativePath) {
  try {
    await access(join(root, relativePath), fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function parseVersion(input) {
  const match = String(input)
    .trim()
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function nodeMeetsEngine(version) {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  return compareVersion(parsed, [22, 13, 0]) >= 0 && compareVersion(parsed, [25, 0, 0]) < 0;
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout || result.stderr}`.trim().split(/\r?\n/, 1)[0];
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const packageVersion = parseVersion(packageJson.version);
if (packageVersion && packageVersion[0] === 0) {
  record('pass', 'pre-1.0 version', packageJson.version);
} else {
  record('blocker', 'pre-1.0 version', `Expected 0.x.y, found ${packageJson.version}`);
}

if (nodeMeetsEngine(process.version)) {
  record('pass', 'Node runtime', `${process.version} satisfies ${packageJson.engines?.node}`);
} else {
  record(
    'blocker',
    'Node runtime',
    `${process.version} does not satisfy ${packageJson.engines?.node}`,
  );
}

const pnpmVersion = commandVersion('pnpm', ['--version']);
if (pnpmVersion) {
  const parsedPnpm = parseVersion(pnpmVersion);
  const supported =
    parsedPnpm && parsedPnpm[0] === 11 && compareVersion(parsedPnpm, [11, 7, 0]) >= 0;
  record(supported ? 'pass' : 'blocker', 'pnpm runtime', `${pnpmVersion}; expected >=11.7.0 <12`);
} else {
  record('blocker', 'pnpm runtime', 'pnpm is not available on PATH');
}

for (const relativePath of ['dist/server.js', 'dist/cli/index.js', 'dist-ui-solid/index.html']) {
  record(
    (await fileExists(relativePath)) ? 'pass' : 'blocker',
    `build artifact ${relativePath}`,
    (await fileExists(relativePath)) ? 'present' : 'missing; run pnpm run build:all',
  );
}

const launcher = await readFile(join(root, 'bin/vof'), 'utf8').catch(() => '');
const launcherReady =
  launcher.startsWith('#!/usr/bin/env node') && launcher.includes('dist/cli/index.js');
record(
  launcherReady ? 'pass' : 'blocker',
  'CLI launcher',
  launcherReady
    ? 'bin/vof has a Node shebang and targets dist/cli/index.js'
    : 'bin/vof must have a Node shebang and target dist/cli/index.js',
);

for (const command of ['ffmpeg', 'ffprobe']) {
  const version = commandVersion(command, ['-version']);
  record(
    version ? 'pass' : 'blocker',
    `${command} prerequisite`,
    version || `${command} is not available on PATH`,
  );
}

const rembgVersion = commandVersion('rembg', ['--version']);
record(
  rembgVersion ? 'pass' : 'warning',
  'rembg transparency capability',
  rembgVersion ||
    'optional command is not available; non-native transparent output will be blocked',
);

const serverSource = await readFile(join(root, 'src/server.ts'), 'utf8');
const servesSolidBuild =
  serverSource.includes('@fastify/static') &&
  serverSource.includes('dist-ui-solid') &&
  /fastify\.register\s*\(/.test(serverSource);
record(
  servesSolidBuild ? 'pass' : 'blocker',
  'single-process production host',
  servesSolidBuild
    ? 'Fastify source registers the built Solid assets'
    : 'Fastify does not serve dist-ui-solid; the production API cannot launch the built client',
);

const symbols = { pass: 'PASS', warning: 'WARN', blocker: 'BLOCK' };
for (const check of checks) {
  console.log(`[${symbols[check.status]}] ${check.name}: ${check.detail}`);
}

const blockers = checks.filter((check) => check.status === 'blocker');
const warnings = checks.filter((check) => check.status === 'warning');
console.log(`\nRelease readiness: ${blockers.length} blocker(s), ${warnings.length} warning(s).`);
if (blockers.length > 0) process.exitCode = 1;
