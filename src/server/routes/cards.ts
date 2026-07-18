import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Card } from '../../types/index.js';
import {
  BinSchema,
  CardSchema,
  MediaSchema,
  TakeSchema,
} from '../../shared/schemas/index.js';
import { appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import { generateId } from '../../utils/ids.js';
import { readCatalog, saveSnapshot } from './snapshots.js';

type ProjectPaths = ReturnType<typeof import('../../utils/paths.js').getProjectPaths>;
type ProjectContext = { projectRoot: string; paths: ProjectPaths };
type CardBody = Partial<Card> & Record<string, unknown>;

function requestBody(value: unknown): CardBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as CardBody;
}

function cardKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function validationDetails(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

export function registerCardRoutes(
  fastify: FastifyInstance,
  getProjectContext: () => ProjectContext | null,
) {
  fastify.get(
    '/api/cards',
    async (
      request: FastifyRequest<{ Querystring: { id?: string } }>,
      reply: FastifyReply,
    ) => {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }

      const catalog = await readCatalog(ctx.paths);
      if (request.query.id !== undefined) {
        const card = catalog.cards.find((candidate) => candidate.id === request.query.id);
        if (!card) {
          reply.code(404);
          return { error: 'Card not found' };
        }
        return { card };
      }

      return { cards: catalog.cards };
    },
  );

  fastify.post('/api/cards', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }

    const body = requestBody(request.body);
    if (!body) {
      reply.code(400);
      return { error: 'Request body is required' };
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      reply.code(400);
      return { error: 'Card name is required' };
    }

    const now = new Date().toISOString();
    const candidate = {
      ...body,
      id: typeof body.id === 'string' ? body.id : generateId(),
      name,
      key: typeof body.key === 'string' ? body.key.trim() : cardKey(name),
      default_blocks: body.default_blocks ?? {},
      asset_slots: body.asset_slots ?? [],
      created_at: body.created_at ?? now,
      updated_at: body.updated_at ?? now,
    };
    const parsed = CardSchema.safeParse(candidate);
    if (!parsed.success) {
      reply.code(400);
      return { error: 'Invalid card data', details: validationDetails(parsed.error) };
    }

    const { paths } = ctx;
    const catalog = await readCatalog(paths);
    if (catalog.cards.some((card) => card.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      reply.code(409);
      return { error: 'A card with this name already exists' };
    }
    if (catalog.cards.some((card) => card.id === parsed.data.id)) {
      reply.code(409);
      return { error: 'A card with this id already exists' };
    }

    await saveSnapshot(paths, `Create card: ${parsed.data.name}`, catalog);
    await ensureJsonlFile(paths.catalog.cards);
    await appendJsonl(paths.catalog.cards, parsed.data, CardSchema);

    reply.code(201);
    return { card: parsed.data };
  });

  fastify.put(
    '/api/cards/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }

      const body = requestBody(request.body);
      if (!body) {
        reply.code(400);
        return { error: 'Request body is required' };
      }

      const { paths } = ctx;
      const catalog = await readCatalog(paths);
      const cardIndex = catalog.cards.findIndex((card) => card.id === request.params.id);
      if (cardIndex === -1) {
        reply.code(404);
        return { error: 'Card not found' };
      }

      const current = catalog.cards[cardIndex];
      const candidate = {
        ...current,
        ...body,
        id: current.id,
        created_at: current.created_at,
        updated_at: new Date().toISOString(),
        name: typeof body.name === 'string' ? body.name.trim() : current.name,
        key: typeof body.key === 'string' ? body.key.trim() : current.key,
      };
      const parsed = CardSchema.safeParse(candidate);
      if (!parsed.success) {
        reply.code(400);
        return { error: 'Invalid card data', details: validationDetails(parsed.error) };
      }

      const duplicateName = catalog.cards.some(
        (card) => card.id !== current.id
          && card.name.toLowerCase() === parsed.data.name.toLowerCase(),
      );
      if (duplicateName) {
        reply.code(409);
        return { error: 'A card with this name already exists' };
      }

      await saveSnapshot(paths, `Update card: ${parsed.data.name}`, catalog);
      catalog.cards[cardIndex] = parsed.data;
      await writeJsonlAll(paths.catalog.cards, catalog.cards, CardSchema);

      return { card: parsed.data };
    },
  );

  fastify.delete(
    '/api/cards/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const ctx = getProjectContext();
      if (!ctx) {
        reply.code(400);
        return { error: 'No project selected' };
      }

      const { paths } = ctx;
      const catalog = await readCatalog(paths);
      const card = catalog.cards.find((candidate) => candidate.id === request.params.id);
      if (!card) {
        reply.code(404);
        return { error: 'Card not found' };
      }

      await saveSnapshot(paths, `Delete card: ${card.name}`, catalog);

      const removedBinIds = new Set(
        catalog.bins
          .filter((bin) => bin.owner_type === 'card' && bin.owner_id === card.id)
          .map((bin) => bin.id),
      );
      const removedMediaIds = new Set(
        catalog.media
          .filter(
            (media) => (media.owner_type === 'card' && media.owner_id === card.id)
              || removedBinIds.has(media.bin_id),
          )
          .map((media) => media.id),
      );

      const remainingBins = catalog.bins.filter((bin) => !removedBinIds.has(bin.id));
      const remainingMedia = catalog.media.filter((media) => !removedMediaIds.has(media.id));
      const remainingTakes = catalog.takes.filter((take) => !removedMediaIds.has(take.media_id));
      const now = new Date().toISOString();
      const remainingCards = catalog.cards
        .filter((candidate) => candidate.id !== card.id)
        .map((candidate) => {
          let changed = false;
          const assetSlots = candidate.asset_slots.map((slot) => {
            if (!slot.media_id || !removedMediaIds.has(slot.media_id)) return slot;
            changed = true;
            const remainingSlot = { ...slot };
            delete remainingSlot.media_id;
            return remainingSlot;
          });
          return changed ? { ...candidate, asset_slots: assetSlots, updated_at: now } : candidate;
        });

      await writeJsonlAll(paths.catalog.cards, remainingCards, CardSchema);
      await writeJsonlAll(paths.catalog.bins, remainingBins, BinSchema);
      await writeJsonlAll(paths.catalog.media, remainingMedia, MediaSchema);
      await writeJsonlAll(paths.catalog.takes, remainingTakes, TakeSchema);

      reply.code(204);
      return null;
    },
  );
}
