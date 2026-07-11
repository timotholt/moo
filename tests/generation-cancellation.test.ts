import { describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import { join } from 'path';
import { requestGenerationCancellation } from '../src/services/generation.js';
import { getProjectPaths } from '../src/utils/paths.js';

describe('generation cancellation', () => {
  it('records a cooperative cancellation request without changing the active job state', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-cancel-'));
    try {
      const paths = getProjectPaths(root);
      await fs.ensureDir(paths.moo.dir);
      await fs.writeFile(paths.catalog.generationJobs, `${JSON.stringify({
        id: 'job-1', started_at: '2026-07-10T00:00:00.000Z', status: 'running', total_media: 1, total_takes_created: 0, items: [], request: { dry_run: false },
      })}\n`);
      const job = await requestGenerationCancellation(root, 'job-1');
      expect(job.status).toBe('running');
      expect(job.cancel_requested_at).toBeTruthy();
      const saved = await fs.readFile(paths.catalog.generationJobs, 'utf8');
      expect(JSON.parse(saved).cancel_requested_at).toBe(job.cancel_requested_at);
    } finally {
      await fs.remove(root);
    }
  });
});
