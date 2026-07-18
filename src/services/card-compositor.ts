import { createHash } from 'node:crypto';

import type { Card, CardAssetSlot } from '../shared/schemas/card.schema.js';

export interface CardCompositionAsset {
  slotKey: string;
  mediaId: string;
  takeId: string;
  hashSha256: string;
  mimeType: string;
  bytes?: Buffer;
}

export interface CardLayoutTemplate {
  id: string;
  version: string;
  width: number;
  height: number;
  colors: {
    frame: string;
    panel: string;
    text: string;
    accent: string;
  };
}

export interface CardCompositionInput {
  card: Card;
  assets: CardCompositionAsset[];
  template?: CardLayoutTemplate;
}

export interface CardCompositionResult {
  bytes: Buffer;
  mimeType: 'image/svg+xml';
  width: number;
  height: number;
  hashSha256: string;
  provenance: {
    templateId: string;
    templateVersion: string;
    inputHashSha256: string;
    assets: Array<{
      slotKey: string;
      mediaId: string;
      takeId: string;
      hashSha256: string;
    }>;
  };
}

export const DEFAULT_CARD_TEMPLATE: CardLayoutTemplate = {
  id: 'moo-classic-card',
  version: '1.0.0',
  width: 750,
  height: 1050,
  colors: {
    frame: '#161a22',
    panel: '#252b36',
    text: '#f4f0e6',
    accent: '#d8a84e',
  },
};

/**
 * Render a deterministic, portable card face. Provider-generated art is an
 * input; typography, frame, rules, and gameplay values are always composed by
 * MOO from a versioned template.
 */
export function composeCardSvg(input: CardCompositionInput): CardCompositionResult {
  const template = validateTemplate(input.template ?? DEFAULT_CARD_TEMPLATE);
  const assets = validateAssets(input.card, input.assets);
  const illustration = illustrationAsset(input.card.asset_slots, assets);
  const canonicalAssets = [...assets].sort((left, right) =>
    left.slotKey.localeCompare(right.slotKey) || left.takeId.localeCompare(right.takeId));
  const canonicalInput = stableStringify({
    template,
    card: {
      id: input.card.id,
      key: input.card.key,
      name: input.card.name,
      rules: input.card.rules ?? {},
      gameplay_metadata: input.card.gameplay_metadata ?? {},
      asset_slots: input.card.asset_slots,
    },
    assets: canonicalAssets.map(({ slotKey, mediaId, takeId, hashSha256, mimeType }) => ({
      slotKey,
      mediaId,
      takeId,
      hashSha256,
      mimeType,
    })),
  });
  const inputHashSha256 = sha256(Buffer.from(canonicalInput));

  const rules = ruleLines(input.card.rules ?? {});
  const metadata = metadataLines(input.card.gameplay_metadata ?? {});
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width}" height="${template.height}" viewBox="0 0 ${template.width} ${template.height}" role="img" aria-labelledby="title description">`,
    `<title id="title">${escapeXml(input.card.name)}</title>`,
    `<desc id="description">Deterministic MOO card composition for ${escapeXml(input.card.key)}</desc>`,
    `<rect width="100%" height="100%" rx="38" fill="${escapeXml(template.colors.frame)}"/>`,
    `<rect x="24" y="24" width="${template.width - 48}" height="${template.height - 48}" rx="26" fill="${escapeXml(template.colors.panel)}" stroke="${escapeXml(template.colors.accent)}" stroke-width="6"/>`,
    illustration
      ? `<image x="48" y="118" width="${template.width - 96}" height="510" preserveAspectRatio="xMidYMid slice" href="${dataUri(illustration)}"/>`
      : `<rect x="48" y="118" width="${template.width - 96}" height="510" fill="#101319"/><text x="${template.width / 2}" y="380" text-anchor="middle" fill="${escapeXml(template.colors.text)}" opacity="0.55" font-family="sans-serif" font-size="28">NO ILLUSTRATION</text>`,
    `<rect x="48" y="48" width="${template.width - 96}" height="58" rx="12" fill="${escapeXml(template.colors.frame)}"/>`,
    `<text x="72" y="88" fill="${escapeXml(template.colors.text)}" font-family="sans-serif" font-size="32" font-weight="700">${escapeXml(input.card.name)}</text>`,
    ...textLines(rules, 72, 682, template.colors.text, 25, 34),
    ...textLines(metadata, 72, 918, template.colors.accent, 18, 26),
    `<text x="${template.width - 54}" y="${template.height - 42}" text-anchor="end" fill="${escapeXml(template.colors.text)}" opacity="0.5" font-family="monospace" font-size="14">${escapeXml(template.id)}@${escapeXml(template.version)} · ${inputHashSha256.slice(0, 12)}</text>`,
    '</svg>',
  ].join('');
  const bytes = Buffer.from(svg);

  return {
    bytes,
    mimeType: 'image/svg+xml',
    width: template.width,
    height: template.height,
    hashSha256: sha256(bytes),
    provenance: {
      templateId: template.id,
      templateVersion: template.version,
      inputHashSha256,
      assets: canonicalAssets.map(({ slotKey, mediaId, takeId, hashSha256 }) => ({
        slotKey,
        mediaId,
        takeId,
        hashSha256,
      })),
    },
  };
}

function validateAssets(card: Card, assets: CardCompositionAsset[]): CardCompositionAsset[] {
  const slots = new Map(card.asset_slots.map(slot => [slot.key, slot]));
  const bySlot = new Map<string, CardCompositionAsset>();
  for (const asset of assets) {
    const slot = slots.get(asset.slotKey);
    if (!slot) throw new Error(`Card asset references unknown slot "${asset.slotKey}"`);
    if (bySlot.has(asset.slotKey)) throw new Error(`Card slot "${asset.slotKey}" has multiple selected assets`);
    if (slot.media_id && slot.media_id !== asset.mediaId) {
      throw new Error(`Card slot "${asset.slotKey}" does not belong to media "${asset.mediaId}"`);
    }
    if (!asset.hashSha256.trim()) throw new Error(`Card slot "${asset.slotKey}" asset hash is required`);
    bySlot.set(asset.slotKey, asset);
  }
  for (const slot of card.asset_slots) {
    if (slot.required && !bySlot.has(slot.key)) {
      throw new Error(`Card "${card.name}" is missing required slot "${slot.key}"`);
    }
  }
  return [...bySlot.values()];
}

function illustrationAsset(
  slots: CardAssetSlot[],
  assets: CardCompositionAsset[],
): CardCompositionAsset | undefined {
  const imageSlots = slots.filter(slot => slot.asset_kind === 'image');
  for (const slot of imageSlots) {
    const asset = assets.find(candidate => candidate.slotKey === slot.key);
    if (asset?.bytes && canonicalImageMime(asset.mimeType)) return asset;
  }
  return undefined;
}

function dataUri(asset: CardCompositionAsset): string {
  return `data:${canonicalImageMime(asset.mimeType)};base64,${asset.bytes!.toString('base64')}`;
}

function canonicalImageMime(value: string): string | undefined {
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  return ['image/png', 'image/jpeg', 'image/webp'].includes(mime) ? mime : undefined;
}

function ruleLines(rules: Record<string, unknown>): string[] {
  return objectLines(rules, 52);
}

function metadataLines(metadata: Record<string, unknown>): string[] {
  return objectLines(metadata, 68);
}

function objectLines(value: Record<string, unknown>, maxLength: number): string[] {
  return Object.keys(value).sort().flatMap(key =>
    wrapText(`${humanize(key)}: ${displayValue(value[key])}`, maxLength));
}

function displayValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return stableStringify(value);
}

function humanize(value: string): string {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function wrapText(value: string, maxLength: number): string[] {
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= maxLength) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  color: string,
  fontSize: number,
  lineHeight: number,
): string[] {
  return lines.slice(0, 6).map((line, index) =>
    `<text x="${x}" y="${y + index * lineHeight}" fill="${escapeXml(color)}" font-family="sans-serif" font-size="${fontSize}">${escapeXml(line)}</text>`);
}

function validateTemplate(template: CardLayoutTemplate): CardLayoutTemplate {
  if (!template.id.trim() || !template.version.trim()) throw new Error('Card template ID and version are required');
  if (!Number.isInteger(template.width) || template.width < 320) throw new Error('Card template width is invalid');
  if (!Number.isInteger(template.height) || template.height < 448) throw new Error('Card template height is invalid');
  return template;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
