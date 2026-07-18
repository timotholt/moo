import Fastify from 'fastify';
import fs from 'fs-extra';
import os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerCardRoutes } from '../src/server/routes/cards.js';
import { initializeProject } from '../src/services/project-initializer.js';
import { getProjectPaths } from '../src/utils/paths.js';
import { readJsonl, writeJsonlAll } from '../src/utils/jsonl.js';
import type { Bin, Card, Media, Take } from '../src/types/index.js';
import {
  BinSchema,
  CardSchema,
  MediaSchema,
  TakeSchema,
} from '../src/shared/schemas/index.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.remove(root)));
});

async function testProject() {
  const root = await fs.mkdtemp(join(os.tmpdir(), 'moo-card-routes-'));
  roots.push(root);
  await initializeProject(root, { displayName: 'Card Library' });
  const paths = getProjectPaths(root);
  const app = Fastify();
  registerCardRoutes(app, () => ({ projectRoot: root, paths }));
  return { app, root, paths };
}

function cardFixture(overrides: Partial<Card> = {}): Card {
  const now = '2026-07-17T12:00:00.000Z';
  return CardSchema.parse({
    id: 'card-1',
    name: 'Signal Flare',
    key: 'signal_flare',
    default_blocks: {},
    asset_slots: [],
    created_at: now,
    updated_at: now,
    ...overrides,
  });
}

describe('card routes', () => {
  it('creates concise and full cards, persists slots, lists them, and fetches one by id', async () => {
    const { app } = await testProject();

    const concise = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { name: 'Signal Flare' },
    });
    expect(concise.statusCode).toBe(201);
    const conciseCard = concise.json().card as Card;
    expect(conciseCard).toMatchObject({
      name: 'Signal Flare',
      key: 'signal_flare',
      default_blocks: {},
      asset_slots: [],
    });
    expect(conciseCard.id).toBeTruthy();

    const full = cardFixture({
      id: 'card-2',
      name: 'Orbital Strike',
      key: 'orbital_strike',
      asset_slots: [{
        key: 'card_art',
        label: 'Card Art',
        asset_kind: 'image',
        required: true,
        media_id: 'media-art',
        delivery: { format: 'png', width: 1024, height: 1024, transparency: true },
      }],
    });
    const fullResponse = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: full,
    });
    expect(fullResponse.statusCode).toBe(201);
    expect(fullResponse.json().card.asset_slots).toEqual(full.asset_slots);

    const list = await app.inject({ method: 'GET', url: '/api/cards' });
    expect(list.statusCode).toBe(200);
    expect(list.json().cards).toHaveLength(2);

    const one = await app.inject({ method: 'GET', url: '/api/cards?id=card-2' });
    expect(one.statusCode).toBe(200);
    expect(one.json().card).toEqual(full);
    await app.close();
  });

  it('rejects invalid cards and duplicate names case-insensitively', async () => {
    const { app } = await testProject();

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: {
        name: 'Bad Video',
        asset_slots: [{
          key: 'clip',
          label: 'Clip',
          asset_kind: 'video',
          required: true,
          delivery: { format: 'mp4', width: 1920, height: 1080, video_aspect_ratio: '9:16' },
        }],
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe('Invalid card data');

    expect((await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { name: 'Signal Flare' },
    })).statusCode).toBe(201);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/cards',
      payload: { name: '  SIGNAL FLARE  ' },
    });
    expect(duplicate.statusCode).toBe(409);
    await app.close();
  });

  it('updates a full validated card while preserving identity and creation time', async () => {
    const { app, paths } = await testProject();
    const original = cardFixture();
    await writeJsonlAll(paths.catalog.cards, [original], CardSchema);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/cards/card-1',
      payload: {
        id: 'replacement-id',
        created_at: '2020-01-01T00:00:00.000Z',
        name: 'Signal Flare Mk II',
        asset_slots: [{
          key: 'voice_line',
          label: 'Voice Line',
          asset_kind: 'dialogue',
          required: false,
          delivery: { format: 'wav' },
        }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().card).toMatchObject({
      id: original.id,
      created_at: original.created_at,
      name: 'Signal Flare Mk II',
      asset_slots: [{
        key: 'voice_line',
        asset_kind: 'dialogue',
        delivery: { format: 'wav' },
      }],
    });
    const stored = await readJsonl<Card>(paths.catalog.cards, CardSchema);
    expect(stored).toEqual([response.json().card]);
    await app.close();
  });

  it('cascades only card-owned catalog data, clears removed media references, and retains binaries', async () => {
    const { app, root, paths } = await testProject();
    const target = cardFixture();
    const survivor = cardFixture({
      id: 'card-2',
      name: 'Survivor',
      key: 'survivor',
      asset_slots: [
        {
          key: 'shared_art',
          label: 'Shared Art',
          asset_kind: 'image',
          required: true,
          media_id: 'owned-media',
          delivery: { format: 'png' },
        },
        {
          key: 'own_art',
          label: 'Own Art',
          asset_kind: 'image',
          required: true,
          media_id: 'unrelated-media',
          delivery: { format: 'png' },
        },
      ],
    });
    const now = target.created_at;
    const bins: Bin[] = [
      {
        id: 'owned-bin', owner_type: 'card', owner_id: target.id, media_type: 'image',
        name: 'Art', default_blocks: {}, bin_complete: false, created_at: now, updated_at: now,
      },
      {
        id: 'safe-bin', owner_type: 'card', owner_id: survivor.id, media_type: 'image',
        name: 'Art', default_blocks: {}, bin_complete: false, created_at: now, updated_at: now,
      },
    ];
    const media: Media[] = [
      {
        id: 'owned-media', owner_type: 'card', owner_id: target.id, bin_id: 'owned-bin',
        media_type: 'image', name: 'Target Art', created_at: now, updated_at: now,
      },
      {
        id: 'unrelated-media', owner_type: 'card', owner_id: survivor.id, bin_id: 'safe-bin',
        media_type: 'image', name: 'Safe Art', created_at: now, updated_at: now,
      },
    ];
    const takes: Take[] = [
      {
        id: 'owned-take', media_id: 'owned-media', take_number: 1, filename: 'owned.png',
        path: 'cards/signal_flare/owned.png', format: 'png', size_bytes: 6, status: 'new',
        created_at: now, updated_at: now,
      },
      {
        id: 'safe-take', media_id: 'unrelated-media', take_number: 1, filename: 'safe.png',
        path: 'cards/survivor/safe.png', format: 'png', size_bytes: 4, status: 'new',
        created_at: now, updated_at: now,
      },
    ];
    await Promise.all([
      writeJsonlAll(paths.catalog.cards, [target, survivor], CardSchema),
      writeJsonlAll(paths.catalog.bins, bins, BinSchema),
      writeJsonlAll(paths.catalog.media, media, MediaSchema),
      writeJsonlAll(paths.catalog.takes, takes, TakeSchema),
    ]);
    const retainedBinary = join(root, takes[0].path);
    await fs.ensureFile(retainedBinary);
    await fs.writeFile(retainedBinary, 'binary');

    const response = await app.inject({ method: 'DELETE', url: '/api/cards/card-1' });
    expect(response.statusCode).toBe(204);
    const remainingCards = await readJsonl<Card>(paths.catalog.cards, CardSchema);
    expect(remainingCards).toMatchObject([{
      id: survivor.id,
      asset_slots: [
        { key: 'shared_art' },
        { key: 'own_art', media_id: 'unrelated-media' },
      ],
    }]);
    expect(remainingCards[0].asset_slots[0]).not.toHaveProperty('media_id');
    expect((await readJsonl<Bin>(paths.catalog.bins, BinSchema)).map((item) => item.id)).toEqual(['safe-bin']);
    expect((await readJsonl<Media>(paths.catalog.media, MediaSchema)).map((item) => item.id)).toEqual(['unrelated-media']);
    expect((await readJsonl<Take>(paths.catalog.takes, TakeSchema)).map((item) => item.id)).toEqual(['safe-take']);
    await expect(fs.readFile(retainedBinary, 'utf8')).resolves.toBe('binary');
    await app.close();
  });

  it('returns missing-project and not-found errors', async () => {
    const noProject = Fastify();
    registerCardRoutes(noProject, () => null);
    expect((await noProject.inject({ method: 'GET', url: '/api/cards' })).statusCode).toBe(400);
    expect((await noProject.inject({
      method: 'POST', url: '/api/cards', payload: { name: 'Card' },
    })).statusCode).toBe(400);
    await noProject.close();

    const { app } = await testProject();
    expect((await app.inject({ method: 'GET', url: '/api/cards?id=missing' })).statusCode).toBe(404);
    expect((await app.inject({
      method: 'PUT', url: '/api/cards/missing', payload: { name: 'Missing' },
    })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/cards/missing' })).statusCode).toBe(404);
    await app.close();
  });
});
