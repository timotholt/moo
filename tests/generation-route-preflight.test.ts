import Fastify, { type FastifyInstance } from 'fastify';
import fs from 'fs-extra';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerGenerationRoutes } from '../src/server/routes/generation.js';
import { initializeProject } from '../src/services/project-initializer.js';
import {
  clearConfigCache,
  setGenerationProviderSettings,
  setGlobalConfigPathForTesting,
} from '../src/services/global-config.js';
import { estimateProviderOperationCost } from '../src/services/provider-costs.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { writeJsonlAll } from '../src/utils/jsonl.js';
import type { DefaultBlock, MediaType, Take } from '../src/types/index.js';

const commandAvailability = vi.hoisted(() => new Map<string, boolean>());

vi.mock('../src/services/generation-preflight.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/services/generation-preflight.js')>();
  return {
    ...actual,
    hasCommand: vi.fn(async (command: string) => commandAvailability.get(command) ?? false),
  };
});

const roots: string[] = [];
const apps: FastifyInstance[] = [];
const now = '2026-07-17T12:00:00.000Z';

beforeEach(() => {
  commandAvailability.clear();
  commandAvailability.set('ffprobe', true);
  commandAvailability.set('ffmpeg', true);
});

afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
  setGlobalConfigPathForTesting();
  clearConfigCache();
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

async function createApp() {
  const root = await fs.mkdtemp(join(tmpdir(), 'moo-generation-preflight-route-'));
  roots.push(root);
  await initializeProject(root, { displayName: 'Preflight test library' });
  setGlobalConfigPathForTesting(join(root, '.moo-config.test.json'));
  const paths = getProjectPaths(root);
  const app = Fastify();
  apps.push(app);
  registerGenerationRoutes(app, () => ({ projectRoot: root, paths }));
  return { app, paths };
}

async function seedMedia(
  paths: ReturnType<typeof getProjectPaths>,
  mediaType: Exclude<MediaType, 'text'>,
  settings: DefaultBlock,
  takes: Take[] = [],
) {
  const bin = {
    id: `bin-${mediaType}`,
    owner_type: 'global' as const,
    owner_id: null,
    media_type: mediaType,
    name: `${mediaType} assets`,
    default_blocks: { [mediaType]: settings },
    bin_complete: false,
    created_at: now,
    updated_at: now,
  };
  const media = {
    id: `media-${mediaType}`,
    owner_type: 'global' as const,
    owner_id: null,
    bin_id: bin.id,
    media_type: mediaType,
    name: `${mediaType} cue`,
    prompt: mediaType === 'dialogue' ? 'Hold.' : `Generate ${mediaType}`,
    created_at: now,
    updated_at: now,
  };
  await Promise.all([
    writeJsonlAll(paths.catalog.bins, [bin]),
    writeJsonlAll(paths.catalog.media, [media]),
    writeJsonlAll(paths.catalog.takes, takes),
  ]);
  return media;
}

function newTake(mediaId: string): Take {
  return {
    id: 'take-new',
    media_id: mediaId,
    take_number: 1,
    filename: 'candidate.png',
    path: 'global/image/candidate.png',
    format: 'png',
    size_bytes: 1,
    status: 'new',
    created_at: now,
    updated_at: now,
  };
}

describe('GET /api/generation/preflight', () => {
  it('readies an OpenAI image and prices only the next lifecycle candidates', async () => {
    const { app, paths } = await createApp();
    await setGenerationProviderSettings('openai', {
      api_key: 'openai-test-key',
      enabled: true,
      config: { image_model: 'gpt-image-2' },
    });
    const media = await seedMedia(paths, 'image', {
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      min_candidates: 3,
      approval_count_default: 2,
    });
    await writeJsonlAll(paths.catalog.takes, [newTake(media.id)]);

    const response = await app.inject({
      method: 'GET',
      url: `/api/generation/preflight?media_id=${media.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ready: true,
      status: 'ready',
      provider: {
        id: 'openai',
        configured: true,
        credentialConfigured: true,
        model: 'gpt-image-2',
      },
      capabilities: {
        providerId: 'openai',
        media: { image: { supportsTransparency: false } },
      },
      request: {
        assetKind: 'image',
        delivery: { format: 'png', width: 1024, height: 1024 },
      },
      estimate: {
        known: true,
        providerRequests: 2,
        maximumExposure: 0.012,
        currency: 'USD',
        sourceAsOf: '2026-07-17',
        model: 'gpt-image-2',
        profile: 'low',
        unit: 'image',
        rate: 0.006,
        takes_to_generate: 2,
        provider_requests: 2,
        estimated_characters: null,
      },
    });
  });

  it('readies and prices a portrait Google Veo fast video', async () => {
    const { app, paths } = await createApp();
    await setGenerationProviderSettings('google', {
      api_key: 'google-test-key',
      enabled: true,
      config: { video_model: 'veo-3.1-fast-generate-preview' },
    });
    const media = await seedMedia(paths, 'video', {
      provider: 'google',
      model: 'veo-3.1-fast-generate-preview',
      aspect_ratio: '9:16',
      width: 720,
      height: 1280,
      duration_seconds: 8,
      resolution: '720p',
      min_candidates: 1,
      approval_count_default: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/generation/preflight?media_id=${media.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ready: true,
      status: 'ready',
      provider: { id: 'google', model: 'veo-3.1-fast-generate-preview' },
      request: {
        assetKind: 'video',
        delivery: {
          format: 'mp4',
          width: 720,
          height: 1280,
          aspectRatio: '9:16',
          durationSeconds: 8,
        },
        settings: { resolution: '720p' },
      },
      estimate: {
        known: true,
        providerRequests: 1,
        maximumExposure: 0.8,
        currency: 'USD',
        sourceAsOf: '2026-07-17',
        profile: 'fast/720p',
        unit: 'second',
        rate: 0.1,
      },
      tools: { ffprobe: true, ffmpeg: true },
    });
  });

  it('blocks a multimedia provider when credentials are missing', async () => {
    const { app, paths } = await createApp();
    const media = await seedMedia(paths, 'image', {
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'low',
      size: '1024x1024',
      min_candidates: 1,
      approval_count_default: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/generation/preflight?media_id=${media.id}`,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      ready: false,
      status: 'blocked',
      provider: { id: 'openai', configured: false, credentialConfigured: false },
    });
    expect(body.checks).toContainEqual(expect.objectContaining({
      id: 'credential-missing',
      code: 'credential-missing',
      status: 'blocked',
    }));
  });

  it('blocks transparent output when configured rembg is unavailable', async () => {
    const { app, paths } = await createApp();
    await setGenerationProviderSettings('openai', {
      api_key: 'openai-test-key',
      enabled: true,
      config: { image_model: 'gpt-image-2' },
    });
    await setGenerationProviderSettings('background-removal', {
      enabled: true,
      config: { executable: 'rembg' },
    });
    commandAvailability.set('rembg', false);
    const media = await seedMedia(paths, 'image', {
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'medium',
      size: '1024x1024',
      transparency: true,
      min_candidates: 1,
      approval_count_default: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/generation/preflight?media_id=${media.id}`,
    });
    const body = response.json();

    expect(body).toMatchObject({
      ready: false,
      status: 'blocked',
      postprocessing: {
        backgroundRemoval: {
          configured: true,
          executable: 'rembg',
          available: false,
        },
      },
    });
    expect(body.checks).toContainEqual(expect.objectContaining({
      id: 'background-removal-unavailable',
      status: 'blocked',
    }));
  });

  it('preserves audio readiness and legacy estimate fields', async () => {
    const { app, paths } = await createApp();
    await setGenerationProviderSettings('elevenlabs', {
      api_key: 'elevenlabs-test-key',
      enabled: true,
      model: 'eleven_multilingual_v2',
    });
    const media = await seedMedia(paths, 'dialogue', {
      provider: 'elevenlabs',
      voice_id: 'voice-1',
      model_id: 'eleven_multilingual_v2',
      min_candidates: 2,
      approval_count_default: 1,
    });

    const response = await app.inject({
      method: 'GET',
      url: `/api/generation/preflight?media_id=${media.id}`,
    });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      ready: true,
      status: 'warning',
      provider: { id: 'elevenlabs', configured: true, credentialConfigured: true },
      capabilities: {
        providerId: 'elevenlabs',
        media: { dialogue: { formats: ['mp3'] } },
      },
      request: {
        assetKind: 'dialogue',
        settings: { voiceId: 'voice-1', modelId: 'eleven_multilingual_v2' },
      },
      estimate: {
        known: false,
        providerRequests: 2,
        takes_to_generate: 2,
        provider_requests: 2,
        estimated_characters: 10,
        quota_remaining_characters: null,
        currency: 'USD',
        sourceAsOf: '2026-07-17',
      },
    });
    expect(body.checks).toContainEqual(expect.objectContaining({
      id: 'cost-estimate-unknown',
      status: 'warning',
    }));
  });
});

describe('provider cost table', () => {
  it('returns dated USD rates only for supported models and profiles', () => {
    expect(estimateProviderOperationCost({
      providerId: 'openai',
      assetKind: 'video',
      model: 'sora-2-pro',
      resolution: '1080p',
      durationSeconds: 4,
    })).toMatchObject({
      known: true,
      currency: 'USD',
      sourceAsOf: '2026-07-17',
      rate: 0.7,
      perOperation: 2.8,
    });

    expect(estimateProviderOperationCost({
      providerId: 'google',
      assetKind: 'image',
      model: 'gemini-3.1-flash-image',
      imageSize: '4K',
    })).toMatchObject({ known: true, rate: 0.151, perOperation: 0.151 });

    expect(estimateProviderOperationCost({
      providerId: 'openai',
      assetKind: 'image',
      model: 'unsupported-image-model',
      quality: 'low',
      width: 1024,
      height: 1024,
    })).toEqual({
      known: false,
      currency: 'USD',
      sourceAsOf: '2026-07-17',
      model: 'unsupported-image-model',
    });
  });
});
