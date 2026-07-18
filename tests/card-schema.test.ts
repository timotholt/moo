import { describe, expect, it } from 'vitest';
import { CardSchema } from '../src/shared/schemas/card.schema.js';

const timestamps = {
  created_at: '2026-07-17T12:00:00.000Z',
  updated_at: '2026-07-17T12:00:00.000Z',
};

function cardWithSlots() {
  return {
    id: 'card-ember-adept',
    name: 'Ember Adept',
    key: 'ember-adept',
    rules: { cost: 3, power: 4, faction: 'ember' },
    gameplay_metadata: { rarity: 'rare' },
    asset_slots: [
      {
        key: 'illustration', label: 'Transparent illustration', asset_kind: 'image', required: true,
        delivery: { format: 'png', width: 1024, height: 1024, transparency: true },
      },
      ...['play-sfx', 'attack-sfx', 'death-sfx'].map((key) => ({
        key, label: key, asset_kind: 'sfx' as const, required: true, delivery: { format: 'ogg' },
      })),
      {
        key: 'portrait-video', label: 'Portrait promo', asset_kind: 'video', required: false,
        delivery: { format: 'mp4', width: 1080, height: 1920, video_aspect_ratio: '9:16' },
      },
      {
        key: 'landscape-video', label: 'Landscape promo', asset_kind: 'video', required: false,
        delivery: { format: 'mp4', width: 1920, height: 1080, video_aspect_ratio: '16:9' },
      },
    ],
    ...timestamps,
  };
}

describe('CardSchema', () => {
  it('accepts a CCG card with transparent art, three SFX slots, and both video orientations', () => {
    const card = CardSchema.parse(cardWithSlots());
    expect(card.asset_slots).toHaveLength(6);
    expect(card.asset_slots.filter((slot) => slot.asset_kind === 'sfx')).toHaveLength(3);
    expect(card.asset_slots.find((slot) => slot.key === 'illustration')?.delivery.transparency).toBe(true);
  });

  it('rejects duplicate slot keys', () => {
    const card = cardWithSlots();
    card.asset_slots.push({ ...card.asset_slots[0], label: 'Duplicate illustration' });
    expect(CardSchema.safeParse(card).success).toBe(false);
  });

  it('rejects invalid video ratios and incompatible delivery fields', () => {
    const invalidRatio = cardWithSlots();
    invalidRatio.asset_slots[4].delivery.width = 1000;
    expect(CardSchema.safeParse(invalidRatio).success).toBe(false);

    const incompatible = cardWithSlots();
    incompatible.asset_slots[1].delivery = { format: 'ogg', transparency: true };
    expect(CardSchema.safeParse(incompatible).success).toBe(false);
  });
});
