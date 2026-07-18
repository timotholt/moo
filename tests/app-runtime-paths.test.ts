import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getDefaultsTemplatePath,
  getMooRuntimePaths,
  isPathInside,
  resolveMooDataRoot,
} from '../src/services/app-runtime-paths.js';

describe('MOO runtime paths', () => {
  it('keeps source development data relative to the launch checkout', () => {
    const root = resolveMooDataRoot({
      env: {},
      platform: 'darwin',
      homeDirectory: '/Users/author',
      workingDirectory: '/work/moo',
    });
    expect(root).toBe(resolve('/work/moo'));
    expect(getMooRuntimePaths({
      env: {},
      workingDirectory: '/work/moo',
    })).toEqual({
      dataRoot: resolve('/work/moo'),
      globalConfig: resolve('/work/moo/.moo-config.json'),
      projects: resolve('/work/moo/projects'),
    });
  });

  it('uses an explicit data directory before packaged platform defaults', () => {
    expect(resolveMooDataRoot({
      env: { MOO_DATA_DIR: '/portable/moo', MOO_PACKAGED: '1' },
      platform: 'darwin',
      homeDirectory: '/Users/author',
      workingDirectory: '/work/moo',
    })).toBe(resolve('/portable/moo'));
  });

  it('uses native user-writable roots for packaged macOS, Windows, and Linux launches', () => {
    const packaged = { MOO_PACKAGED: '1' };
    expect(resolveMooDataRoot({
      env: packaged,
      platform: 'darwin',
      homeDirectory: '/Users/author',
    })).toBe(join('/Users/author', 'Library', 'Application Support', 'MOO'));
    expect(resolveMooDataRoot({
      env: { ...packaged, APPDATA: 'C:\\Users\\author\\AppData\\Roaming' },
      platform: 'win32',
      homeDirectory: 'C:\\Users\\author',
    })).toBe(join('C:\\Users\\author\\AppData\\Roaming', 'MOO'));
    expect(resolveMooDataRoot({
      env: { ...packaged, XDG_DATA_HOME: '/home/author/.data' },
      platform: 'linux',
      homeDirectory: '/home/author',
    })).toBe(join('/home/author/.data', 'moo'));
  });

  it('resolves templates from resources and rejects path-prefix lookalikes', () => {
    expect(getDefaultsTemplatePath({ MOO_RESOURCE_DIR: '/Applications/MOO.app/Contents/Resources' }))
      .toBe(resolve('/Applications/MOO.app/Contents/Resources/templates/defaults.template.json'));
    expect(isPathInside('/data/projects', '/data/projects/card-library')).toBe(true);
    expect(isPathInside('/data/projects', '/data/projects-escape/card-library')).toBe(false);
  });
});
