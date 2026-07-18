import fs from 'fs-extra';

import { ActorSchema, type Actor } from '../shared/schemas/actor.schema.js';
import { BinSchema, type Bin } from '../shared/schemas/bin.schema.js';
import { CardSchema, type Card } from '../shared/schemas/card.schema.js';
import { DefaultsSchema, type Defaults } from '../shared/schemas/defaults.schema.js';
import type { RequestedDeliveryProfile } from '../shared/schemas/generation-operation.schema.js';
import { MediaSchema, type Media } from '../shared/schemas/media.schema.js';
import { SceneSchema, type Scene } from '../shared/schemas/scene.schema.js';
import { TakeSchema, type Take } from '../shared/schemas/take.schema.js';
import { resolveDefaultBlock } from '../utils/defaultBlockResolver.js';
import { readJsonl } from '../utils/jsonl.js';
import { getProjectPaths } from '../utils/paths.js';
import { writeCandidate } from './candidate-writer.js';
import type { CreateDownloadedTake, ReconciliationTakeInput, ReconciliationSummary } from './generation-reconciler.js';
import { GenerationReconciler } from './generation-reconciler.js';
import { GenerationOperationStore } from './generation-operation-store.js';
import { GeneratorRegistry } from './generators/registry.js';
import type { DeliveryRequirements } from './generators/types.js';

type CandidateOwner = Actor | Scene | Card;

/** Convert a durable provider-operation delivery profile into the writer contract. */
export function requestedProfileToDeliveryRequirements(
  profile: RequestedDeliveryProfile | undefined,
): DeliveryRequirements | undefined {
  if (!profile) return undefined;
  return {
    format: profile.format,
    width: profile.width,
    height: profile.height,
    durationSeconds: profile.duration_sec,
    frameRate: profile.fps,
    aspectRatio: profile.video_aspect_ratio,
  };
}

/**
 * Creates the project-aware download callback used by GenerationReconciler.
 * Catalog context is intentionally read at harvest time: a restarted process
 * sees the canonical project state and allocates the next free take number.
 */
export function createProjectDownloadedTake(projectRoot: string): CreateDownloadedTake {
  return async (input: ReconciliationTakeInput): Promise<string> => {
    const paths = getProjectPaths(projectRoot);
    const [actors, cards, scenes, bins, mediaItems, takes, defaults] = await Promise.all([
      readJsonl<Actor>(paths.catalog.actors, ActorSchema),
      readJsonl<Card>(paths.catalog.cards, CardSchema),
      readJsonl<Scene>(paths.catalog.scenes, SceneSchema),
      readJsonl<Bin>(paths.catalog.bins, BinSchema),
      readJsonl<Media>(paths.catalog.media, MediaSchema),
      readJsonl<Take>(paths.catalog.takes, TakeSchema),
      loadDefaults(paths.moo.defaults),
    ]);

    const media = mediaItems.find((item) => item.id === input.operation.media_id);
    if (!media) {
      throw new Error(`Media "${input.operation.media_id}" is missing from the project catalog; completed provider work remains recoverable.`);
    }
    const bin = bins.find((item) => item.id === media.bin_id);
    if (!bin) {
      throw new Error(`Bin "${media.bin_id}" for media "${media.id}" is missing from the project catalog; completed provider work remains recoverable.`);
    }
    if (bin.media_type !== media.media_type) {
      throw new Error(`Bin "${bin.id}" does not match ${media.media_type} media "${media.id}"; completed provider work remains recoverable.`);
    }

    const owner = resolveOwner(media, actors, cards, scenes);
    const resolved = resolveDefaultBlock(media.media_type, media, bin, owner, defaults);
    const takeNumber = takes
      .filter((take) => take.media_id === media.id)
      .reduce((highest, take) => Math.max(highest, take.take_number), 0) + 1;

    const { take } = await writeCandidate({
      projectRoot,
      paths,
      media,
      bin,
      owner: owner ?? undefined,
      takeNumber,
      generatedAsset: input.asset,
      providerOperation: input.providerOperation,
      settings: resolved.settings,
      resolvedFrom: resolved.resolvedFrom,
      delivery: requestedProfileToDeliveryRequirements(input.operation.requested_delivery_profile),
    });
    return take.id;
  };
}

/** Reconcile every outstanding provider operation against this project. */
export async function reconcileProjectGeneration(
  projectRoot: string,
  registry: GeneratorRegistry,
): Promise<ReconciliationSummary> {
  const operationStore = new GenerationOperationStore(projectRoot);
  const reconciler = new GenerationReconciler(operationStore, registry, createProjectDownloadedTake(projectRoot));
  return reconciler.reconcile();
}

async function loadDefaults(defaultsPath: string): Promise<Defaults | null> {
  if (!(await fs.pathExists(defaultsPath))) return null;
  return DefaultsSchema.parse(await fs.readJson(defaultsPath));
}

function resolveOwner(media: Media, actors: Actor[], cards: Card[], scenes: Scene[]): CandidateOwner | null {
  if (media.owner_type === 'global') return null;
  const owner = media.owner_type === 'actor'
    ? actors.find((actor) => actor.id === media.owner_id)
    : media.owner_type === 'card'
      ? cards.find((card) => card.id === media.owner_id)
      : scenes.find((scene) => scene.id === media.owner_id);
  if (!owner) {
    const ownerLabel = media.owner_type === 'actor' ? 'Actor' : media.owner_type === 'card' ? 'Card' : 'Scene';
    throw new Error(`${ownerLabel} "${media.owner_id}" for media "${media.id}" is missing from the project catalog; completed provider work remains recoverable.`);
  }
  return owner;
}
