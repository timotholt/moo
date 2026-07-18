import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fs from 'fs-extra';
import { describe, expect, it } from 'vitest';

import { renderProjectCard } from '../src/services/card-renderer.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { writeJsonlAll } from '../src/utils/jsonl.js';

const now = '2026-07-17T00:00:00.000Z';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'moo-card-render-'));
  const paths = getProjectPaths(root);
  const art = Buffer.from('approved-card-art');
  const sound = Buffer.from('approved-sound');
  await fs.outputFile(join(root, 'cards/card-1/art.png'), art);
  await fs.outputFile(join(root, 'cards/card-1/attack.ogg'), sound);
  const card = {
    id: 'card-1',
    key: 'ember-adept',
    name: 'Ember Adept',
    rules: { cost: 3, text: 'Deal 4 damage.' },
    asset_slots: [
      { key: 'illustration', label: 'Illustration', asset_kind: 'image', required: true, media_id: 'media-art', delivery: { format: 'png' } },
      { key: 'attack', label: 'Attack', asset_kind: 'sfx', required: true, media_id: 'media-sfx', delivery: { format: 'ogg' } },
    ],
    created_at: now,
    updated_at: now,
  };
  const media = [
    { id: 'media-art', owner_type: 'card', owner_id: 'card-1', bin_id: 'bin-art', media_type: 'image', name: 'Art', selected_take_ids: ['take-art'], created_at: now, updated_at: now },
    { id: 'media-sfx', owner_type: 'card', owner_id: 'card-1', bin_id: 'bin-sfx', media_type: 'sfx', name: 'Attack', selected_take_ids: ['take-sfx'], created_at: now, updated_at: now },
  ];
  const takes = [
    { id: 'take-art', media_id: 'media-art', take_number: 1, filename: 'art.png', path: 'cards/card-1/art.png', format: 'png', size_bytes: art.length, status: 'approved', hash_sha256: hash(art), created_at: now, updated_at: now },
    { id: 'take-sfx', media_id: 'media-sfx', take_number: 1, filename: 'attack.ogg', path: 'cards/card-1/attack.ogg', format: 'ogg', size_bytes: sound.length, status: 'approved', hash_sha256: hash(sound), created_at: now, updated_at: now },
  ];
  await writeJsonlAll(paths.catalog.cards, [card]);
  await writeJsonlAll(paths.catalog.media, media);
  await writeJsonlAll(paths.catalog.takes, takes);
  return { root, paths, card, media, takes };
}

describe('renderProjectCard', () => {
  it('renders selected approved slot takes atomically and deterministically', async () => {
    const value = await fixture();
    const first = await renderProjectCard(value.root, 'card-1');
    const second = await renderProjectCard(value.root, 'card-1');

    expect(second.hashSha256).toBe(first.hashSha256);
    await expect(readFile(join(value.root, first.relativePath))).resolves.toEqual(first.bytes);
    const metadata = await fs.readJson(join(value.root, first.metadataRelativePath));
    expect(metadata).toMatchObject({
      card_id: 'card-1',
      output_hash_sha256: first.hashSha256,
      provenance: { templateVersion: '1.0.0' },
    });
  });

  it('blocks unapproved or missing required slot selections', async () => {
    const value = await fixture();
    value.media[1].selected_take_ids = [];
    await writeJsonlAll(value.paths.catalog.media, value.media);
    await expect(renderProjectCard(value.root, 'card-1')).rejects.toThrow('exactly one selected take');
  });

  it('blocks technically invalid selected slot takes even if marked approved', async () => {
    const value = await fixture();
    value.takes[0].technical_status = 'invalid';
    value.takes[0].technical_issues = [{
      code: 'dimensions_mismatch',
      stage: 'delivery',
      message: 'Wrong card-art dimensions',
    }];
    await writeJsonlAll(value.paths.catalog.takes, value.takes);

    await expect(renderProjectCard(value.root, 'card-1')).rejects.toThrow('technically invalid');
  });
});

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
