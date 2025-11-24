/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import os from 'os';
import { getProjectPaths } from '../src/utils/paths.js';
import { runBatchGeneration } from '../src/services/generation.js';

vi.mock('../src/services/provider-factory.js', () => ({
  getAudioProvider: vi.fn(),
}));

vi.mock('../src/services/audio/ffprobe.js', () => ({
  probeAudio: vi.fn(),
}));

vi.mock('../src/services/audio/hash.js', () => ({
  hashFile: vi.fn(),
}));

import * as providerFactory from '../src/services/provider-factory.js';
import * as ffprobeSvc from '../src/services/audio/ffprobe.js';
import * as hashSvc from '../src/services/audio/hash.js';

describe('M2.5 Batch Generation', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(join(os.tmpdir(), 'vof-gen-'));
    const paths = getProjectPaths(projectRoot);
    await fs.ensureDir(join(projectRoot, 'catalog'));
    await fs.writeFile(paths.catalog.actors, '', 'utf-8');
    await fs.writeFile(paths.catalog.content, '', 'utf-8');
    await fs.writeFile(paths.catalog.takes, '', 'utf-8');
    await fs.writeFile(paths.catalog.generationJobs, '', 'utf-8');
  });

  afterEach(async () => {
    if (projectRoot) {
      await fs.remove(projectRoot);
    }
    vi.clearAllMocks();
  });

  it('should compute correct counts in dry-run mode', async () => {
    const paths = getProjectPaths(projectRoot);

    const actor = {
      id: '00000000-0000-0000-0000-0000000000aa',
      display_name: 'DryRun Actor',
      base_filename: 'dry_actor_',
      all_approved: false,
      provider_settings: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 2,
        },
      },
      aliases: [],
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const content1 = {
      id: '00000000-0000-0000-0000-0000000001aa',
      actor_id: actor.id,
      content_type: 'dialogue',
      item_id: 'line1',
      prompt: 'First line',
      complete: false,
      all_approved: false,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const content2 = {
      id: '00000000-0000-0000-0000-0000000001ab',
      actor_id: actor.id,
      content_type: 'dialogue',
      item_id: 'line2',
      prompt: 'Second line',
      complete: false,
      all_approved: false,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.content, JSON.stringify(content1) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.content, JSON.stringify(content2) + '\n', 'utf-8');

    const { job } = await runBatchGeneration(projectRoot, { dryRun: true, contentType: 'dialogue' });

    expect(job.total_content).toBe(2);
    expect(job.total_takes_created).toBe(4); // 2 approvals per content
    expect(job.items).toHaveLength(2);
  });

  it('should write takes and generation job in real mode', async () => {
    const paths = getProjectPaths(projectRoot);

    const actor = {
      id: '00000000-0000-0000-0000-0000000000bb',
      display_name: 'Real Actor',
      base_filename: 'real_actor_',
      all_approved: false,
      provider_settings: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 1,
          voice_id: 'EXAVITQu4vr4xnSDxMaL',
        },
      },
      aliases: [],
      notes: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const content = {
      id: '00000000-0000-0000-0000-0000000002bb',
      actor_id: actor.id,
      content_type: 'dialogue',
      item_id: 'real_line',
      prompt: 'Hello from test',
      complete: false,
      all_approved: false,
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.content, JSON.stringify(content) + '\n', 'utf-8');

    const fakeBuffer = Buffer.from('fake-audio');

    vi.mocked(providerFactory.getAudioProvider).mockResolvedValue({
      generateDialogue: vi.fn().mockResolvedValue(fakeBuffer),
      generateMusic: vi.fn(),
      generateSFX: vi.fn(),
      getQuota: vi.fn(),
    } as any);

    vi.mocked(ffprobeSvc.probeAudio).mockResolvedValue({
      format: { duration: 1.23, size: 1234, bit_rate: 64000 },
      streams: [{ codec_name: 'wav', sample_rate: '44100', channels: 1 }],
    } as any);

    vi.mocked(hashSvc.hashFile).mockResolvedValue('abc123'.padEnd(64, '0'));

    const { job } = await runBatchGeneration(projectRoot, { contentType: 'dialogue' });

    expect(job.total_content).toBe(1);
    expect(job.total_takes_created).toBe(1);

    const takesContent = await fs.readFile(paths.catalog.takes, 'utf-8');
    const takeLines = takesContent.trim().split('\n');
    expect(takeLines.length).toBe(1);
    const take = JSON.parse(takeLines[0]);
    expect(take.content_id).toBe(content.id);
    expect(take.hash_sha256).toHaveLength(64);
    expect(take.duration_sec).toBeCloseTo(1.23);
  });
});
