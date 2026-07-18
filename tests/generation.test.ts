/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import os from 'os';
import { getProjectPaths } from '../src/utils/paths.js';
import { requestGenerationCancellation, runBatchGeneration } from '../src/services/generation.js';

vi.mock('../src/services/provider-factory.js', () => ({
  getAudioProvider: vi.fn(),
}));

vi.mock('../src/services/inspection/ffprobe-inspector.js', () => ({
  inspectWithFFprobe: vi.fn(),
}));

import * as providerFactory from '../src/services/provider-factory.js';
import * as ffprobeSvc from '../src/services/inspection/ffprobe-inspector.js';

describe('M2.5 Batch Generation', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await fs.mkdtemp(join(os.tmpdir(), 'vof-gen-'));
    const paths = getProjectPaths(projectRoot);
    await fs.ensureDir(join(projectRoot, '.moo'));
    await fs.writeFile(paths.catalog.actors, '', 'utf-8');
    await fs.writeFile(paths.catalog.bins, '', 'utf-8');
    await fs.writeFile(paths.catalog.media, '', 'utf-8');
    await fs.writeFile(paths.catalog.takes, '', 'utf-8');
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
      id: 'actor-1',
      display_name: 'DryRun Actor',
      base_filename: 'dry_actor',
      default_blocks: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 2,
        },
      },
      actor_complete: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const bin = {
      id: 'bin-1',
      owner_type: 'actor',
      owner_id: actor.id,
      media_type: 'dialogue',
      name: 'Main Mission',
      default_blocks: {
        dialogue: { provider: 'inherit' }
      },
      bin_complete: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const media1 = {
      id: 'media-1',
      owner_type: 'actor',
      owner_id: actor.id,
      bin_id: bin.id,
      media_type: 'dialogue',
      name: 'line1',
      prompt: 'First line',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const media2 = {
      id: 'media-2',
      owner_type: 'actor',
      owner_id: actor.id,
      bin_id: bin.id,
      media_type: 'dialogue',
      name: 'line2',
      prompt: 'Second line',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.bins, JSON.stringify(bin) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.media, JSON.stringify(media1) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.media, JSON.stringify(media2) + '\n', 'utf-8');

    const { job } = await runBatchGeneration(projectRoot, { dryRun: true, mediaType: 'dialogue' });

    expect(job.total_media).toBe(2);
    expect(job.total_takes_created).toBe(4); // 2 needed per media
    expect(job.items).toHaveLength(2);
  });

  it('honors an explicit single-media Generate More count', async () => {
    const paths = getProjectPaths(projectRoot);
    const now = new Date().toISOString();
    const actor = {
      id: 'actor-more',
      display_name: 'More',
      base_filename: 'more',
      default_blocks: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 1,
          min_candidates: 1,
          voice_id: 'voice-more',
        },
      },
      actor_complete: false,
      created_at: now,
      updated_at: now,
    };
    const bin = {
      id: 'bin-more',
      owner_type: 'actor',
      owner_id: actor.id,
      media_type: 'dialogue',
      name: 'More',
      default_blocks: { dialogue: { provider: 'inherit' } },
      bin_complete: false,
      created_at: now,
      updated_at: now,
    };
    const media = {
      id: 'media-more',
      owner_type: 'actor',
      owner_id: actor.id,
      bin_id: bin.id,
      media_type: 'dialogue',
      name: 'line',
      prompt: 'Generate another option',
      created_at: now,
      updated_at: now,
    };
    await fs.appendFile(paths.catalog.actors, `${JSON.stringify(actor)}\n`);
    await fs.appendFile(paths.catalog.bins, `${JSON.stringify(bin)}\n`);
    await fs.appendFile(paths.catalog.media, `${JSON.stringify(media)}\n`);

    const { job } = await runBatchGeneration(projectRoot, {
      mediaId: media.id,
      count: 3,
      dryRun: true,
    });

    expect(job.total_takes_created).toBe(3);
    expect(job.request?.count).toBe(3);
    expect(job.items).toEqual([
      expect.objectContaining({ media_id: media.id, generated_takes: 3 }),
    ]);
  });

  it('should write takes in real mode', async () => {
    const paths = getProjectPaths(projectRoot);

    const actor = {
      id: 'actor-2',
      display_name: 'Real Actor',
      base_filename: 'real_actor',
      default_blocks: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 1,
          voice_id: 'EXAVITQu4vr4xnSDxMaL',
        },
      },
      actor_complete: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const bin = {
      id: 'bin-2',
      owner_type: 'actor',
      owner_id: actor.id,
      media_type: 'dialogue',
      name: 'Combat',
      default_blocks: {
        dialogue: { provider: 'inherit' }
      },
      bin_complete: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const media = {
      id: 'media-3',
      owner_type: 'actor',
      owner_id: actor.id,
      bin_id: bin.id,
      media_type: 'dialogue',
      name: 'real_line',
      prompt: 'Hello from test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.bins, JSON.stringify(bin) + '\n', 'utf-8');
    await fs.appendFile(paths.catalog.media, JSON.stringify(media) + '\n', 'utf-8');

    const fakeBuffer = Buffer.from('fake-audio');

    vi.mocked(providerFactory.getAudioProvider).mockResolvedValue({
      generateDialogue: vi.fn().mockResolvedValue(fakeBuffer),
      generateMusic: vi.fn(),
      generateSFX: vi.fn(),
      getQuota: vi.fn(),
    } as any);

    vi.mocked(ffprobeSvc.inspectWithFFprobe).mockResolvedValue({
      mediaKind: 'audio',
      format: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: fakeBuffer.length,
      durationSeconds: 1.23,
      sampleRate: 44100,
      channels: 1,
      codec: 'mp3',
      container: 'mp3',
      bitrate: 64000,
      audioTrackCount: 1,
    });

    const { job } = await runBatchGeneration(projectRoot, { mediaType: 'dialogue' });

    expect(job.total_media).toBe(1);
    expect(job.total_takes_created).toBe(1);

    const takesContent = await fs.readFile(paths.catalog.takes, 'utf-8');
    const takeLines = takesContent.trim().split('\n');
    expect(takeLines.length).toBe(1);
    const take = JSON.parse(takeLines[0]);
    expect(take.media_id).toBe(media.id);
    expect(take.hash_sha256).toHaveLength(64);
    expect(take.duration_sec).toBeCloseTo(1.23);

    const operationsContent = await fs.readFile(paths.catalog.generationOperations, 'utf-8');
    const operation = JSON.parse(operationsContent.trim());
    expect(operation).toMatchObject({
      generation_job_id: job.id,
      media_id: media.id,
      asset_kind: 'dialogue',
      provider: 'elevenlabs',
      status: 'completed',
      downloaded_take_id: take.id,
    });
    expect(operation.request_id).toBeTruthy();
  });

  it('does not generate more takes after the approval target is met', async () => {
    const paths = getProjectPaths(projectRoot);
    const now = new Date().toISOString();
    const actor = { id: 'actor-stop', display_name: 'Stop', base_filename: 'stop', default_blocks: { dialogue: { provider: 'elevenlabs', approval_count_default: 1, min_candidates: 3 } }, actor_complete: false, created_at: now, updated_at: now };
    const bin = { id: 'bin-stop', owner_type: 'actor', owner_id: actor.id, media_type: 'dialogue', name: 'Stop', default_blocks: { dialogue: { provider: 'inherit' } }, bin_complete: false, created_at: now, updated_at: now };
    const media = { id: 'media-stop', owner_type: 'actor', owner_id: actor.id, bin_id: bin.id, media_type: 'dialogue', name: 'done', created_at: now, updated_at: now };
    const approvedTake = { id: 'take-stop', media_id: media.id, take_number: 1, filename: 'done.mp3', path: 'actors/stop/dialogue/stop/done_001.mp3', format: 'mp3', size_bytes: 1, status: 'approved', created_at: now, updated_at: now };
    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n');
    await fs.appendFile(paths.catalog.bins, JSON.stringify(bin) + '\n');
    await fs.appendFile(paths.catalog.media, JSON.stringify(media) + '\n');
    await fs.appendFile(paths.catalog.takes, JSON.stringify(approvedTake) + '\n');

    const { job } = await runBatchGeneration(projectRoot, { dryRun: true, mediaType: 'dialogue' });
    expect(job.total_media).toBe(0);
    expect(job.total_takes_created).toBe(0);
  });

  it('deduplicates concurrent batches with the same request', async () => {
    const paths = getProjectPaths(projectRoot);
    const now = new Date().toISOString();
    const actor = { id: 'actor-concurrent', display_name: 'Concurrent', base_filename: 'concurrent', default_blocks: { dialogue: { provider: 'elevenlabs', approval_count_default: 1 } }, actor_complete: false, created_at: now, updated_at: now };
    const bin = { id: 'bin-concurrent', owner_type: 'actor', owner_id: actor.id, media_type: 'dialogue', name: 'Concurrent', default_blocks: { dialogue: { provider: 'inherit' } }, bin_complete: false, created_at: now, updated_at: now };
    const media = { id: 'media-concurrent', owner_type: 'actor', owner_id: actor.id, bin_id: bin.id, media_type: 'dialogue', name: 'line', created_at: now, updated_at: now };
    await fs.appendFile(paths.catalog.actors, JSON.stringify(actor) + '\n');
    await fs.appendFile(paths.catalog.bins, JSON.stringify(bin) + '\n');
    await fs.appendFile(paths.catalog.media, JSON.stringify(media) + '\n');
    const [first, second] = await Promise.all([runBatchGeneration(projectRoot, { dryRun: true }), runBatchGeneration(projectRoot, { dryRun: true })]);
    expect(first.job.id).toBe(second.job.id);
  });

  it('harvests the in-flight provider request after cancellation and submits no more', async () => {
    const paths = getProjectPaths(projectRoot);
    const now = new Date().toISOString();
    const actor = {
      id: 'actor-cancel',
      display_name: 'Cancel',
      base_filename: 'cancel',
      default_blocks: {
        dialogue: {
          provider: 'elevenlabs',
          approval_count_default: 2,
          min_candidates: 2,
          voice_id: 'voice-cancel',
        },
      },
      actor_complete: false,
      created_at: now,
      updated_at: now,
    };
    const bin = {
      id: 'bin-cancel',
      owner_type: 'actor',
      owner_id: actor.id,
      media_type: 'dialogue',
      name: 'Cancel',
      default_blocks: { dialogue: { provider: 'inherit' } },
      bin_complete: false,
      created_at: now,
      updated_at: now,
    };
    const media = {
      id: 'media-cancel',
      owner_type: 'actor',
      owner_id: actor.id,
      bin_id: bin.id,
      media_type: 'dialogue',
      name: 'line',
      prompt: 'Finish this paid request',
      created_at: now,
      updated_at: now,
    };
    await fs.appendFile(paths.catalog.actors, `${JSON.stringify(actor)}\n`);
    await fs.appendFile(paths.catalog.bins, `${JSON.stringify(bin)}\n`);
    await fs.appendFile(paths.catalog.media, `${JSON.stringify(media)}\n`);

    let resolveProvider!: (bytes: Buffer) => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>(resolve => { markProviderStarted = resolve; });
    const providerResult = new Promise<Buffer>(resolve => { resolveProvider = resolve; });
    const generateDialogue = vi.fn().mockImplementation(async () => {
      markProviderStarted();
      return providerResult;
    });
    vi.mocked(providerFactory.getAudioProvider).mockResolvedValue({
      generateDialogue,
      generateMusic: vi.fn(),
      generateSFX: vi.fn(),
      getQuota: vi.fn(),
      getVoices: vi.fn(),
    });
    vi.mocked(ffprobeSvc.inspectWithFFprobe).mockResolvedValue({
      mediaKind: 'audio',
      format: 'mp3',
      mimeType: 'audio/mpeg',
      byteLength: 4,
      durationSeconds: 1,
      sampleRate: 44100,
      channels: 1,
      codec: 'mp3',
      container: 'mp3',
      bitrate: 64000,
      audioTrackCount: 1,
    });

    const run = runBatchGeneration(projectRoot, { mediaId: media.id });
    await providerStarted;
    const runningJobs = (await fs.readFile(paths.catalog.generationJobs, 'utf8')).trim().split('\n').map(JSON.parse);
    await requestGenerationCancellation(projectRoot, runningJobs[0].id);
    resolveProvider(Buffer.from('paid'));

    const { job } = await run;
    expect(job.status).toBe('cancelled');
    expect(job.cancel_requested_at).toBeTruthy();
    expect(job.total_takes_created).toBe(1);
    expect(generateDialogue).toHaveBeenCalledTimes(1);
    const takes = (await fs.readFile(paths.catalog.takes, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(takes).toHaveLength(1);
    expect(takes[0]).toMatchObject({ media_id: media.id, status: 'new' });
  });
});
