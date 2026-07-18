import { createHash } from 'node:crypto';
import os from 'node:os';
import { join } from 'node:path';

import fs from 'fs-extra';
import { afterEach, describe, expect, it } from 'vitest';

import { initializeProject } from '../src/services/project-initializer.js';
import { publishSelectedTakes } from '../src/services/publishing.js';
import { getProjectPaths } from '../src/utils/paths.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.remove(root)));
});

const transparentPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7m1WQAAAABJRU5ErkJggg==',
  'base64',
);

describe('multimedia release definition of done', () => {
  it('publishes approved audio, transparent art, both video orientations, and one composed card', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-multimedia-release-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Multimedia Release Proof' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();

    const assets = [
      {
        media: {
          id: 'card-art',
          owner_type: 'card',
          owner_id: 'card-proof',
          bin_id: 'card-images',
          media_type: 'image',
          name: 'Transparent unit cutout',
          selected_take_ids: ['take-art'],
          created_at: now,
          updated_at: now,
        },
        take: {
          id: 'take-art',
          media_id: 'card-art',
          take_number: 1,
          filename: 'unit-cutout.png',
          path: 'cards/card-proof/image/unit-cutout.png',
          format: 'png',
          status: 'approved',
          width: 1024,
          height: 1024,
          generation_params: {
            provider: 'openai-image',
            model: 'gpt-image-2',
            resolved_from: 'media',
            full_settings: { provider: 'openai', transparency: true },
            owner_type: 'card',
            owner_id: 'card-proof',
            owner_name: 'Release Proof',
            api_request_id: 'image-operation',
            provider_metadata: { inspection: { has_transparent_pixels: true } },
          },
          created_at: now,
          updated_at: now,
        },
        bytes: transparentPng,
      },
      {
        media: {
          id: 'card-sfx',
          owner_type: 'card',
          owner_id: 'card-proof',
          bin_id: 'card-audio',
          media_type: 'sfx',
          name: 'Summon sound',
          selected_take_ids: ['take-sfx'],
          created_at: now,
          updated_at: now,
        },
        take: {
          id: 'take-sfx',
          media_id: 'card-sfx',
          take_number: 1,
          filename: 'summon.wav',
          path: 'cards/card-proof/sfx/summon.wav',
          format: 'wav',
          status: 'approved',
          duration_sec: 1.25,
          generation_params: {
            provider: 'elevenlabs',
            resolved_from: 'media',
            full_settings: { provider: 'elevenlabs' },
            owner_type: 'card',
            owner_id: 'card-proof',
            owner_name: 'Release Proof',
            api_request_id: 'audio-operation',
          },
          created_at: now,
          updated_at: now,
        },
        bytes: Buffer.from('inspected-wave-fixture'),
      },
      {
        media: {
          id: 'card-video-wide',
          owner_type: 'card',
          owner_id: 'card-proof',
          bin_id: 'card-video',
          media_type: 'video',
          name: 'Landscape promo',
          selected_take_ids: ['take-wide'],
          created_at: now,
          updated_at: now,
        },
        take: {
          id: 'take-wide',
          media_id: 'card-video-wide',
          take_number: 1,
          filename: 'promo-wide.mp4',
          path: 'cards/card-proof/video/promo-wide.mp4',
          format: 'mp4',
          status: 'approved',
          width: 1920,
          height: 1080,
          fps: 24,
          duration_sec: 8,
          generation_params: {
            provider: 'openai-video',
            model: 'sora-2',
            resolved_from: 'media',
            full_settings: { provider: 'openai', aspect_ratio: '16:9' },
            owner_type: 'card',
            owner_id: 'card-proof',
            owner_name: 'Release Proof',
            api_request_id: 'wide-operation',
          },
          created_at: now,
          updated_at: now,
        },
        bytes: Buffer.from('inspected-wide-video-fixture'),
      },
      {
        media: {
          id: 'card-video-tall',
          owner_type: 'card',
          owner_id: 'card-proof',
          bin_id: 'card-video',
          media_type: 'video',
          name: 'Portrait promo',
          selected_take_ids: ['take-tall'],
          created_at: now,
          updated_at: now,
        },
        take: {
          id: 'take-tall',
          media_id: 'card-video-tall',
          take_number: 1,
          filename: 'promo-tall.mp4',
          path: 'cards/card-proof/video/promo-tall.mp4',
          format: 'mp4',
          status: 'approved',
          width: 1080,
          height: 1920,
          fps: 24,
          duration_sec: 8,
          generation_params: {
            provider: 'google-video',
            model: 'veo-3.1-generate-preview',
            resolved_from: 'media',
            full_settings: { provider: 'google', aspect_ratio: '9:16' },
            owner_type: 'card',
            owner_id: 'card-proof',
            owner_name: 'Release Proof',
            api_request_id: 'tall-operation',
          },
          created_at: now,
          updated_at: now,
        },
        bytes: Buffer.from('inspected-tall-video-fixture'),
      },
    ];

    for (const asset of assets) {
      asset.take.size_bytes = asset.bytes.length;
      asset.take.hash_sha256 = createHash('sha256').update(asset.bytes).digest('hex');
      await fs.outputFile(join(root, asset.take.path), asset.bytes);
    }

    const card = {
      id: 'card-proof',
      key: 'release-proof',
      name: 'Release Proof',
      rules: { cost: 4, text: 'Definition of done.' },
      gameplay_metadata: { rarity: 'test' },
      asset_slots: [
        { key: 'unit_cutout', label: 'Unit cutout', asset_kind: 'image', required: true, media_id: 'card-art', delivery: { format: 'png', width: 1024, height: 1024, transparency: true } },
        { key: 'summon_sfx', label: 'Summon SFX', asset_kind: 'sfx', required: true, media_id: 'card-sfx', delivery: { format: 'wav' } },
        { key: 'promo_landscape', label: 'Landscape promo', asset_kind: 'video', required: true, media_id: 'card-video-wide', delivery: { format: 'mp4', width: 1920, height: 1080, video_aspect_ratio: '16:9' } },
        { key: 'promo_portrait', label: 'Portrait promo', asset_kind: 'video', required: true, media_id: 'card-video-tall', delivery: { format: 'mp4', width: 1080, height: 1920, video_aspect_ratio: '9:16' } },
      ],
      created_at: now,
      updated_at: now,
    };

    await fs.writeFile(paths.catalog.cards, `${JSON.stringify(card)}\n`);
    await fs.writeFile(paths.catalog.media, `${assets.map(asset => JSON.stringify(asset.media)).join('\n')}\n`);
    await fs.writeFile(paths.catalog.takes, `${assets.map(asset => JSON.stringify(asset.take)).join('\n')}\n`);

    const result = await publishSelectedTakes(root, 'release-proof');
    const manifest = await fs.readJson(result.manifest_path);

    expect(result.exported_count).toBe(5);
    expect(manifest.assets.map((asset: { file: string }) => asset.file).sort()).toEqual([
      'audio/summon.wav',
      'cards/source-art/unit-cutout.png',
      'video/landscape/promo-wide.mp4',
      'video/portrait/promo-tall.mp4',
    ]);
    expect(manifest.cards).toHaveLength(1);
    expect(manifest.cards[0]).toMatchObject({
      card_id: 'card-proof',
      rendered_file: 'cards/rendered/release-proof.svg',
      provenance: { templateVersion: '1.0.0' },
    });
    await expect(fs.pathExists(join(result.release_dir, 'cards/rendered/release-proof.svg'))).resolves.toBe(true);
    await expect(fs.pathExists(join(result.release_dir, 'manifest.json'))).resolves.toBe(true);
  });
});
