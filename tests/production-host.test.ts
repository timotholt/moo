import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildServer,
  resolveProductionUiRoot,
} from '../src/server.js';
import { shouldServeProductionUi } from '../src/server/production-host.js';

const temporaryPaths: string[] = [];

async function createUiBuild() {
  const root = await mkdtemp(join(tmpdir(), 'moo-ui-build-'));
  temporaryPaths.push(root);
  await mkdir(join(root, 'assets'));
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><body><main id="moo-app">MOO production UI</main></body></html>',
  );
  await writeFile(join(root, 'assets', 'app-abc123.js'), 'globalThis.__mooBuilt = true;\n');
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(path => rm(path, { recursive: true })));
});

describe('production UI hosting', () => {
  it('serves index, hashed assets, and extensionless SPA routes', async () => {
    const uiRoot = await createUiBuild();
    const app = buildServer({ serveUi: true, uiRoot });

    const index = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' },
    });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.headers['cache-control']).toMatch(/no-cache|max-age=0/);
    expect(index.body).toContain('MOO production UI');

    const asset = await app.inject({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.body).toContain('__mooBuilt');

    const spaRoute = await app.inject({
      method: 'GET',
      url: '/cards/card-1',
      headers: { accept: 'text/html' },
    });
    expect(spaRoute.statusCode).toBe(200);
    expect(spaRoute.body).toContain('MOO production UI');

    await app.close();
  });

  it('preserves API and media precedence and never masks missing assets', async () => {
    const uiRoot = await createUiBuild();
    const secretPath = join(dirname(uiRoot), 'moo-production-host-secret.txt');
    temporaryPaths.push(secretPath);
    await writeFile(secretPath, 'must-not-be-served');
    const app = buildServer({ serveUi: true, uiRoot });

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const missingApi = await app.inject({
      method: 'GET',
      url: '/api/does-not-exist',
      headers: { accept: 'text/html' },
    });
    expect(missingApi.statusCode).toBe(404);
    expect(missingApi.body).not.toContain('MOO production UI');

    const missingMedia = await app.inject({
      method: 'GET',
      url: '/media/actors/missing.wav',
      headers: { accept: 'text/html' },
    });
    expect(missingMedia.statusCode).toBe(404);
    expect(missingMedia.body).toBe('No project selected');

    const missingAsset = await app.inject({
      method: 'GET',
      url: '/assets/missing.js',
      headers: { accept: 'text/html' },
    });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.body).not.toContain('MOO production UI');

    const traversal = await app.inject({
      method: 'GET',
      url: '/..%2Fmoo-production-host-secret.txt',
      headers: { accept: 'text/html' },
    });
    expect(traversal.body).not.toContain('must-not-be-served');

    const postToSpaPath = await app.inject({ method: 'POST', url: '/cards/card-1' });
    expect(postToSpaPath.statusCode).toBe(404);
    expect(postToSpaPath.body).not.toContain('MOO production UI');

    await app.close();
  });

  it('keeps APIs available and reports a missing enabled UI build truthfully', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'moo-missing-ui-'));
    temporaryPaths.push(parent);
    const missingRoot = join(parent, 'dist-ui-solid');
    const app = buildServer({ serveUi: true, uiRoot: missingRoot });

    expect(app.productionUi).toMatchObject({
      enabled: true,
      available: false,
      root: missingRoot,
    });

    const root = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' },
    });
    expect(root.statusCode).toBe(503);
    expect(root.json().error).toBe('Production UI build unavailable');

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(200);

    const missingApi = await app.inject({
      method: 'GET',
      url: '/api/missing',
      headers: { accept: 'text/html' },
    });
    expect(missingApi.statusCode).toBe(404);

    await app.close();
  });

  it('leaves the two-process development server unchanged when UI hosting is disabled', async () => {
    const uiRoot = await createUiBuild();
    const app = buildServer({ serveUi: false, uiRoot });

    expect(app.productionUi).toMatchObject({ enabled: false, available: false });
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);

    await app.close();
  });

  it('resolves resources from the ESM module and enables compiled production entrypoints', () => {
    const compiledModule = pathToFileURL('/Applications/MOO/resources/dist/server.js').href;

    expect(resolveProductionUiRoot(compiledModule)).toBe(
      '/Applications/MOO/resources/dist-ui-solid',
    );
    expect(
      shouldServeProductionUi(compiledModule, {}, '/Applications/MOO/resources/dist/server.js'),
    ).toBe(true);
    expect(
      shouldServeProductionUi(
        pathToFileURL('/checkout/src/server.ts').href,
        {},
        '/checkout/src/server.ts',
      ),
    ).toBe(false);
    expect(
      shouldServeProductionUi(
        pathToFileURL('/checkout/src/server.ts').href,
        { MOO_SERVE_UI: '1' },
        '/checkout/src/server.ts',
      ),
    ).toBe(true);
  });
});
