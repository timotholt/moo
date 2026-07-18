#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  return compareVersion(parsed, [20, 20, 2]) >= 0 && compareVersion(parsed, [25, 0, 0]) < 0;
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

const requiredArtifacts = [
  'dist/server.js',
  'dist/cli/index.js',
  'dist/templates/defaults.template.json',
  'dist-ui-solid/index.html',
];
const artifactPresence = new Map();
for (const relativePath of requiredArtifacts) {
  const present = await fileExists(relativePath);
  artifactPresence.set(relativePath, present);
  record(
    present ? 'pass' : 'blocker',
    `build artifact ${relativePath}`,
    present ? 'present' : 'missing; run pnpm run build:all',
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

function probeProductionHost() {
  const serverUrl = pathToFileURL(join(root, 'dist/server.js')).href;
  const probeSource = `
    const { buildServer } = await import(${JSON.stringify(serverUrl)});
    const app = buildServer({ serveUi: true });
    try {
      const index = await app.inject({ method: 'GET', url: '/', headers: { accept: 'text/html' } });
      const assetPath = index.body.match(/(?:src|href)="(\\/assets\\/[^"]+)"/)?.[1];
      const asset = assetPath ? await app.inject({ method: 'GET', url: assetPath }) : null;
      const spa = await app.inject({ method: 'GET', url: '/release-readiness', headers: { accept: 'text/html' } });
      const health = await app.inject({ method: 'GET', url: '/api/health' });
      const missingApi = await app.inject({ method: 'GET', url: '/api/release-readiness-missing', headers: { accept: 'text/html' } });
      const missingMedia = await app.inject({ method: 'GET', url: '/media/actors/release-readiness-missing.wav', headers: { accept: 'text/html' } });
      const result = {
        uiAvailable: app.productionUi?.available === true,
        index: index.statusCode === 200 && String(index.headers['content-type']).includes('text/html'),
        asset: !!asset && asset.statusCode === 200,
        spa: spa.statusCode === 200 && spa.body === index.body,
        api: health.statusCode === 200 && health.json().status === 'ok',
        apiPrecedence: missingApi.statusCode === 404 && missingApi.body !== index.body,
        mediaPrecedence: missingMedia.statusCode === 404 && missingMedia.body !== index.body,
      };
      console.log(JSON.stringify(result));
      if (Object.values(result).some(value => value !== true)) process.exitCode = 1;
    } finally {
      await app.close();
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', probeSource], {
    cwd: dirname(root),
    encoding: 'utf8',
    env: {
      ...process.env,
      MOO_SERVE_UI: '1',
      MOO_UI_ROOT: '',
      NODE_ENV: 'production',
    },
    maxBuffer: 1024 * 1024,
  });

  if (result.error) return { passed: false, detail: result.error.message };
  if (result.status !== 0) {
    const output = `${result.stderr || result.stdout}`.trim();
    return { passed: false, detail: output || `probe exited ${result.status}` };
  }

  try {
    const details = JSON.parse(result.stdout.trim());
    return {
      passed: Object.values(details).every(value => value === true),
      detail: JSON.stringify(details),
    };
  } catch {
    return { passed: false, detail: `invalid probe output: ${result.stdout.trim()}` };
  }
}

if (
  artifactPresence.get('dist/server.js') &&
  artifactPresence.get('dist-ui-solid/index.html')
) {
  const productionHost = probeProductionHost();
  record(
    productionHost.passed ? 'pass' : 'blocker',
    'single-process production host',
    productionHost.passed
      ? `compiled server passed runtime injection from outside the checkout: ${productionHost.detail}`
      : `compiled server runtime probe failed: ${productionHost.detail}`,
  );
} else {
  record(
    'blocker',
    'single-process production host',
    'build artifacts are missing; run pnpm run build:all before the runtime probe',
  );
}

const symbols = { pass: 'PASS', warning: 'WARN', blocker: 'BLOCK' };
for (const check of checks) {
  console.log(`[${symbols[check.status]}] ${check.name}: ${check.detail}`);
}

const blockers = checks.filter((check) => check.status === 'blocker');
const warnings = checks.filter((check) => check.status === 'warning');
console.log(`\nRelease readiness: ${blockers.length} blocker(s), ${warnings.length} warning(s).`);
if (blockers.length > 0) process.exitCode = 1;
