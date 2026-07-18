import { createHash } from 'node:crypto';
import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { publishSelectedTakes } from '../src/services/publishing.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.remove(root))); });

describe('publishSelectedTakes', () => {
  it('exports only explicitly selected approved takes with a portable manifest', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Test Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = { id: 'cue-1', owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'sfx', name: 'rifle fire', cue_key: 'weapons.rifle.fire', tags: ['weapon'], selected_take_ids: ['take-1'], created_at: now, updated_at: now };
    const take = { id: 'take-1', media_id: 'cue-1', take_number: 2, filename: 'rifle_fire.mp3', path: 'global/sfx/rifle_fire.mp3', format: 'mp3', size_bytes: 5, status: 'approved', duration_sec: 1.2, hash_sha256: 'abc', created_at: now, updated_at: now };
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.ensureDir(join(root, 'global', 'sfx'));
    await fs.writeFile(join(root, take.path), 'audio');

    const result = await publishSelectedTakes(root, 'test-release');
    expect(result.exported_count).toBe(1);
    await expect(fs.readFile(join(root, 'exports/test-release/audio/rifle_fire.mp3'), 'utf8')).resolves.toBe('audio');
    const manifest = await fs.readJson(result.manifest_path);
    expect(manifest.assets[0]).toMatchObject({ cue_key: 'weapons.rifle.fire', selected_take_id: 'take-1', file: 'audio/rifle_fire.mp3' });
    const releases = (await fs.readFile(paths.catalog.releases, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({ release_id: 'test-release', exported_count: 1, manifest_path: 'exports/test-release/manifest.json' });
  });

  it('rejects unsafe filenames before creating a partial release', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Test Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = { id: 'cue-unsafe', owner_type: 'global', owner_id: null, bin_id: 'bin-1', media_type: 'sfx', name: 'unsafe', export_filename: '../outside.wav', selected_take_ids: ['take-unsafe'], created_at: now, updated_at: now };
    const take = { id: 'take-unsafe', media_id: 'cue-unsafe', take_number: 1, filename: 'unsafe.wav', path: 'global/sfx/unsafe.wav', format: 'wav', size_bytes: 5, status: 'approved', created_at: now, updated_at: now };
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.ensureDir(join(root, 'global', 'sfx'));
    await fs.writeFile(join(root, take.path), 'audio');

    await expect(publishSelectedTakes(root, 'unsafe-release')).rejects.toThrow('plain file name');
    await expect(fs.pathExists(join(root, 'exports', 'unsafe-release'))).resolves.toBe(false);
  });

  it('blocks a selected approved take when it is technically invalid', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-invalid-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Invalid Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = {
      id: 'cue-invalid',
      owner_type: 'global',
      owner_id: null,
      bin_id: 'bin-1',
      media_type: 'image',
      name: 'invalid art',
      selected_take_ids: ['take-invalid'],
      created_at: now,
      updated_at: now,
    };
    const take = {
      id: 'take-invalid',
      media_id: 'cue-invalid',
      take_number: 1,
      filename: 'invalid.png',
      path: 'global/image/invalid.png',
      format: 'png',
      size_bytes: 5,
      status: 'approved',
      technical_status: 'invalid',
      technical_issues: [{
        code: 'dimensions_mismatch',
        stage: 'delivery',
        message: 'Wrong dimensions',
      }],
      created_at: now,
      updated_at: now,
    };
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.outputFile(join(root, take.path), 'image');

    await expect(publishSelectedTakes(root, 'invalid-release')).rejects.toThrow('technically invalid');
    await expect(fs.pathExists(join(root, 'exports', 'invalid-release'))).resolves.toBe(false);
  });

  it('publishes images and both video orientations into distinct destinations', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-media-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Mixed Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const media = [
      { id: 'image-1', owner_type: 'global', owner_id: null, bin_id: 'bin-images', media_type: 'image', name: 'unit', selected_take_ids: ['take-image'], created_at: now, updated_at: now },
      { id: 'video-wide', owner_type: 'global', owner_id: null, bin_id: 'bin-video', media_type: 'video', name: 'promo', selected_take_ids: ['take-wide'], created_at: now, updated_at: now },
      { id: 'video-tall', owner_type: 'global', owner_id: null, bin_id: 'bin-video', media_type: 'video', name: 'promo', selected_take_ids: ['take-tall'], created_at: now, updated_at: now },
    ];
    const takes = [
      { id: 'take-image', media_id: 'image-1', take_number: 1, filename: 'unit.png', path: 'global/image/unit.png', format: 'png', size_bytes: 5, status: 'approved', width: 1024, height: 1024, created_at: now, updated_at: now },
      { id: 'take-wide', media_id: 'video-wide', take_number: 1, filename: 'promo.mp4', path: 'global/video/wide.mp4', format: 'mp4', size_bytes: 5, status: 'approved', width: 1920, height: 1080, fps: 24, created_at: now, updated_at: now },
      { id: 'take-tall', media_id: 'video-tall', take_number: 1, filename: 'promo.mp4', path: 'global/video/tall.mp4', format: 'mp4', size_bytes: 5, status: 'approved', width: 1080, height: 1920, fps: 24, created_at: now, updated_at: now },
    ];
    await fs.writeFile(paths.catalog.media, `${media.map(item => JSON.stringify(item)).join('\n')}\n`);
    await fs.writeFile(paths.catalog.takes, `${takes.map(item => JSON.stringify(item)).join('\n')}\n`);
    for (const take of takes) {
      await fs.ensureDir(join(root, take.path, '..'));
      await fs.writeFile(join(root, take.path), take.id);
    }

    const result = await publishSelectedTakes(root, 'mixed-release');
    const manifest = await fs.readJson(result.manifest_path);

    expect(manifest.schema_version).toBe('3.0.0');
    expect(manifest.assets.map((asset: { file: string }) => asset.file)).toEqual([
      'images/unit.png',
      'video/landscape/wide.mp4',
      'video/portrait/tall.mp4',
    ]);
    await expect(fs.pathExists(join(root, 'exports/mixed-release/images/unit.png'))).resolves.toBe(true);
    await expect(fs.pathExists(join(root, 'exports/mixed-release/video/landscape/wide.mp4'))).resolves.toBe(true);
    await expect(fs.pathExists(join(root, 'exports/mixed-release/video/portrait/tall.mp4'))).resolves.toBe(true);
  });

  it('renders and publishes a complete card package with source art and provenance', async () => {
    const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-publish-card-'));
    roots.push(root);
    await initializeProject(root, { displayName: 'Card Library' });
    const paths = getProjectPaths(root);
    const now = new Date().toISOString();
    const art = Buffer.from('card-source-art');
    const media = {
      id: 'card-art',
      owner_type: 'card',
      owner_id: 'card-1',
      bin_id: 'card-images',
      media_type: 'image',
      name: 'Illustration',
      selected_take_ids: ['take-art'],
      created_at: now,
      updated_at: now,
    };
    const take = {
      id: 'take-art',
      media_id: 'card-art',
      take_number: 1,
      filename: 'illustration.png',
      path: 'cards/card-1/image/illustration.png',
      format: 'png',
      size_bytes: art.length,
      status: 'approved',
      hash_sha256: createHash('sha256').update(art).digest('hex'),
      created_at: now,
      updated_at: now,
    };
    const card = {
      id: 'card-1',
      key: 'ember-adept',
      name: 'Ember Adept',
      rules: { cost: 3 },
      asset_slots: [
        {
          key: 'illustration',
          label: 'Illustration',
          asset_kind: 'image',
          required: true,
          media_id: 'card-art',
          delivery: { format: 'png' },
        },
      ],
      created_at: now,
      updated_at: now,
    };
    await fs.writeFile(paths.catalog.cards, `${JSON.stringify(card)}\n`);
    await fs.writeFile(paths.catalog.media, `${JSON.stringify(media)}\n`);
    await fs.writeFile(paths.catalog.takes, `${JSON.stringify(take)}\n`);
    await fs.outputFile(join(root, take.path), art);

    const result = await publishSelectedTakes(root, 'card-release');
    const manifest = await fs.readJson(result.manifest_path);

    expect(result.exported_count).toBe(2);
    expect(manifest.assets[0]).toMatchObject({
      file: 'cards/source-art/illustration.png',
      card_id: 'card-1',
      card_slot_key: 'illustration',
    });
    expect(manifest.cards[0]).toMatchObject({
      card_key: 'ember-adept',
      rendered_file: 'cards/rendered/ember-adept.svg',
      composition_file: 'cards/rendered/ember-adept.composition.json',
      provenance: { templateVersion: '1.0.0' },
    });
    await expect(fs.pathExists(join(root, 'exports/card-release/cards/rendered/ember-adept.svg'))).resolves.toBe(true);
  });
});
