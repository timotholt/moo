import { describe, expect, it } from 'vitest';

import { composeCardSvg } from '../src/services/card-compositor.js';
import { CardSchema } from '../src/shared/schemas/card.schema.js';

const now = '2026-07-17T00:00:00.000Z';

function card() {
  return CardSchema.parse({
    id: 'card-1',
    key: 'ember-adept',
    name: 'Ember & Adept',
    rules: { cost: 3, rules_text: 'Deal <4> damage to the nearest enemy.' },
    gameplay_metadata: { faction: 'ember', rarity: 'rare' },
    asset_slots: [
      {
        key: 'illustration',
        label: 'Illustration',
        asset_kind: 'image',
        required: true,
        media_id: 'media-image',
        delivery: { format: 'png', width: 1024, height: 1024 },
      },
      {
        key: 'attack-sfx',
        label: 'Attack',
        asset_kind: 'sfx',
        required: true,
        media_id: 'media-sfx',
        delivery: { format: 'ogg' },
      },
    ],
    created_at: now,
    updated_at: now,
  });
}

const assets = [
  {
    slotKey: 'illustration',
    mediaId: 'media-image',
    takeId: 'take-image',
    hashSha256: 'image-hash',
    mimeType: 'image/png',
    bytes: Buffer.from('provider-image'),
  },
  {
    slotKey: 'attack-sfx',
    mediaId: 'media-sfx',
    takeId: 'take-sfx',
    hashSha256: 'audio-hash',
    mimeType: 'audio/ogg',
  },
];

describe('composeCardSvg', () => {
  it('produces identical bytes and hashes for identical template and selected inputs', () => {
    const first = composeCardSvg({ card: card(), assets });
    const second = composeCardSvg({ card: card(), assets: [...assets].reverse() });

    expect(second.bytes).toEqual(first.bytes);
    expect(second.hashSha256).toBe(first.hashSha256);
    expect(first.provenance).toMatchObject({
      templateId: 'moo-classic-card',
      templateVersion: '1.0.0',
      assets: [
        { slotKey: 'attack-sfx', takeId: 'take-sfx' },
        { slotKey: 'illustration', takeId: 'take-image' },
      ],
    });
    expect(first.bytes.toString()).toContain('data:image/png;base64,');
    expect(first.bytes.toString()).toContain('Ember &amp; Adept');
  });

  it('changes the output hash when gameplay metadata changes without changing source art', () => {
    const original = card();
    const changed = card();
    changed.gameplay_metadata = { ...changed.gameplay_metadata, rarity: 'legendary' };

    expect(composeCardSvg({ card: changed, assets }).hashSha256)
      .not.toBe(composeCardSvg({ card: original, assets }).hashSha256);
  });

  it('blocks missing required slots and mismatched slot media', () => {
    expect(() => composeCardSvg({ card: card(), assets: assets.slice(0, 1) }))
      .toThrow('missing required slot "attack-sfx"');
    expect(() => composeCardSvg({
      card: card(),
      assets: [{ ...assets[0], mediaId: 'wrong-media' }, assets[1]],
    })).toThrow('does not belong to media');
  });
});
