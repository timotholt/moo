import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('packaging and operator documentation', () => {
  it('documents the actual ports, credential store, project store, and optional Groq role', () => {
    const readme = read('README.md');
    const guide = read('docs/operator-guide.md');

    expect(`${readme}\n${guide}`).toContain('http://localhost:6001');
    expect(`${readme}\n${guide}`).toContain('127.0.0.1:6000');
    expect(`${readme}\n${guide}`).toContain('.moo-config.json');
    expect(`${readme}\n${guide}`).toContain('projects/<project-name>');
    expect(guide).toContain('Groq is the only implemented prompt-improvement LLM provider');
    expect(guide).toContain('There is no `.env` setup');
  });

  it('distinguishes proven single-process hosting from unfinished executable packaging', () => {
    const packaging = read('docs/packaging-and-release.md');

    expect(packaging).toContain('These artifacts now run as one production process');
    expect(packaging).toContain('source-built single-process application');
    expect(packaging).toContain('not yet a self-contained');
    expect(packaging).toContain('[x] One production entrypoint serves both API and Solid UI.');
    expect(packaging).toContain('Known blockers at this milestone');
  });

  it('exposes reproducible build and release-readiness scripts', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.build).toBe('tsc && node scripts/copy-runtime-assets.mjs');
    expect(packageJson.scripts['build:all']).toBe('pnpm run build && pnpm run build:ui');
    expect(packageJson.scripts['verify:release']).toBe('node scripts/verify-release-readiness.mjs');
  });
});
