import { z } from 'zod';
import { DefaultBlocksSchema, IdSchema, TimestampSchema } from './common.schema.js';

const CardAssetKindSchema = z.enum(['dialogue', 'music', 'sfx', 'image', 'video']);
const VideoAspectRatioSchema = z.enum(['16:9', '9:16']);

const AudioFormatSchema = z.enum(['mp3', 'wav', 'ogg', 'm4a', 'flac']);
const ImageFormatSchema = z.enum(['png', 'webp', 'jpeg']);
const VideoFormatSchema = z.enum(['mp4', 'webm', 'mov']);

export const CardAssetDeliverySchema = z.object({
  format: z.string().min(1).max(20),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  transparency: z.boolean().optional(),
  video_aspect_ratio: VideoAspectRatioSchema.optional(),
});

export const CardAssetSlotSchema = z.object({
  key: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Slot keys must be lowercase kebab or snake case.'),
  label: z.string().min(1).max(160),
  asset_kind: CardAssetKindSchema,
  required: z.boolean(),
  media_id: IdSchema.optional(),
  delivery: CardAssetDeliverySchema,
}).superRefine((slot, ctx) => {
  const { asset_kind: kind, delivery } = slot;
  const hasDimensions = delivery.width !== undefined || delivery.height !== undefined;

  if (kind === 'video') {
    if (!VideoFormatSchema.safeParse(delivery.format).success) {
      ctx.addIssue({ code: 'custom', path: ['delivery', 'format'], message: 'Video slots require mp4, webm, or mov delivery.' });
    }
    if (delivery.width === undefined || delivery.height === undefined) {
      ctx.addIssue({ code: 'custom', path: ['delivery'], message: 'Video slots require width and height.' });
    }
    if (!delivery.video_aspect_ratio) {
      ctx.addIssue({ code: 'custom', path: ['delivery', 'video_aspect_ratio'], message: 'Video slots require a 16:9 or 9:16 delivery ratio.' });
    }
    if (delivery.transparency !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['delivery', 'transparency'], message: 'Transparency is only valid for image slots.' });
    }
    if (delivery.width !== undefined && delivery.height !== undefined && delivery.video_aspect_ratio) {
      const matches = delivery.video_aspect_ratio === '16:9'
        ? delivery.width * 9 === delivery.height * 16
        : delivery.width * 16 === delivery.height * 9;
      if (!matches) {
        ctx.addIssue({ code: 'custom', path: ['delivery'], message: `Video dimensions must exactly match ${delivery.video_aspect_ratio}.` });
      }
    }
    return;
  }

  if (delivery.video_aspect_ratio !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['delivery', 'video_aspect_ratio'], message: 'Video aspect ratio is only valid for video slots.' });
  }

  if (kind === 'image') {
    if (!ImageFormatSchema.safeParse(delivery.format).success) {
      ctx.addIssue({ code: 'custom', path: ['delivery', 'format'], message: 'Image slots require png, webp, or jpeg delivery.' });
    }
    if (hasDimensions && (delivery.width === undefined || delivery.height === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['delivery'], message: 'Image dimensions require both width and height.' });
    }
    if (delivery.transparency === true && !['png', 'webp'].includes(delivery.format)) {
      ctx.addIssue({ code: 'custom', path: ['delivery', 'format'], message: 'Transparent image slots require png or webp delivery.' });
    }
    return;
  }

  if (!AudioFormatSchema.safeParse(delivery.format).success) {
    ctx.addIssue({ code: 'custom', path: ['delivery', 'format'], message: 'Audio slots require mp3, wav, ogg, m4a, or flac delivery.' });
  }
  if (hasDimensions) {
    ctx.addIssue({ code: 'custom', path: ['delivery'], message: 'Dimensions are only valid for image or video slots.' });
  }
  if (delivery.transparency !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['delivery', 'transparency'], message: 'Transparency is only valid for image slots.' });
  }
});

const CardBaseSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  key: z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9_-]*$/, 'Card key must be lowercase kebab or snake case.'),
  rules: z.record(z.string(), z.unknown()).optional(),
  gameplay_metadata: z.record(z.string(), z.unknown()).optional(),
  default_blocks: DefaultBlocksSchema,
  asset_slots: z.array(CardAssetSlotSchema).default([]),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

function validateUniqueSlotKeys(card: { asset_slots?: Array<{ key: string }> }, ctx: z.RefinementCtx) {
  if (!card.asset_slots) return;
  const seen = new Set<string>();
  for (const [index, slot] of card.asset_slots.entries()) {
    if (seen.has(slot.key)) {
      ctx.addIssue({ code: 'custom', path: ['asset_slots', index, 'key'], message: `Duplicate asset slot key: ${slot.key}` });
    }
    seen.add(slot.key);
  }
}

export const CardSchema = CardBaseSchema.superRefine(validateUniqueSlotKeys);

export const CreateCardSchema = CardBaseSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
}).partial({
  rules: true,
  gameplay_metadata: true,
  default_blocks: true,
  asset_slots: true,
}).superRefine(validateUniqueSlotKeys);

export const UpdateCardSchema = CardBaseSchema.partial().omit({
  id: true,
  created_at: true,
}).superRefine(validateUniqueSlotKeys);

export type CardAssetKind = z.infer<typeof CardAssetKindSchema>;
export type VideoAspectRatio = z.infer<typeof VideoAspectRatioSchema>;
export type CardAssetDelivery = z.infer<typeof CardAssetDeliverySchema>;
export type CardAssetSlot = z.infer<typeof CardAssetSlotSchema>;
export type Card = z.infer<typeof CardSchema>;
export type CreateCardInput = z.infer<typeof CreateCardSchema>;
export type UpdateCardInput = z.infer<typeof UpdateCardSchema>;
