import { join } from 'path';
import fs from 'fs-extra';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import type { Actor, Media, Bin, Scene } from '../../types/index.js';
import {
  buildActorPath,
  buildScenePath,
  buildBinPath,
  buildMediaPath,
  type PathContext
} from '../../utils/pathBuilder.js';
import { describeChanges } from '../../utils/diffDescriber.js';
import {
  ActorSchema,
  BinSchema,
  MediaSchema,
  SceneSchema
} from '../../shared/schemas/index.js';
import type { OwnerType } from '../../shared/schemas/common.schema.js';
import { generateId } from '../../utils/ids.js';

interface Snapshot {
  id: string;
  timestamp: string;
  message: string;
  actors: Actor[];
  bins: Bin[];
  media: Media[];
  scenes: Scene[];
}

/** Cached catalog data to avoid redundant reads */
export interface CatalogCache {
  actors: Actor[];
  bins: Bin[];
  media: Media[];
  scenes: Scene[];
}

type ProjectPaths = ReturnType<typeof import('../../utils/paths.js').getProjectPaths>;
type ProjectContext = { projectRoot: string; paths: ProjectPaths };

const MAX_SNAPSHOTS = 50;

/**
 * Read all catalog files and return cached data
 */
export async function readCatalog(paths: ProjectPaths): Promise<CatalogCache> {
  const [actors, bins, media, scenes] = await Promise.all([
    readJsonl<Actor>(paths.catalog.actors, ActorSchema).catch(() => [] as Actor[]),
    readJsonl<Bin>(paths.catalog.bins, BinSchema).catch(() => [] as Bin[]),
    readJsonl<Media>(paths.catalog.media, MediaSchema).catch(() => [] as Media[]),
    readJsonl<Scene>(paths.catalog.scenes, SceneSchema).catch(() => [] as Scene[]),
  ]);
  return { actors, bins, media, scenes };
}

/**
 * Build snapshot message for actor operations
 */
export function snapshotMessageForActor(
  operation: 'create' | 'delete' | 'update' | 'rename',
  actorName: string,
  newName?: string
): string {
  switch (operation) {
    case 'create': return `Create actor: ${actorName}`;
    case 'delete': return `Delete actor: ${actorName}`;
    case 'rename': return `Rename actor: ${actorName} → ${newName}`;
    case 'update': return `Update actor: ${actorName}`;
  }
}

/**
 * Build snapshot message for scene operations
 */
export function snapshotMessageForScene(
  operation: 'create' | 'delete' | 'update' | 'rename',
  sceneName: string,
  newName?: string
): string {
  switch (operation) {
    case 'create': return `Create scene: ${sceneName}`;
    case 'delete': return `Delete scene: ${sceneName}`;
    case 'rename': return `Rename scene: ${sceneName} → ${newName}`;
    case 'update': return `Update scene: ${sceneName}`;
  }
}

/**
 * Build snapshot message for bin operations
 */
export function snapshotMessageForBin(
  operation: 'create' | 'delete' | 'update' | 'rename',
  ownerType: OwnerType,
  ownerId: string | null,
  binName: string,
  ctx: PathContext,
  newName?: string
): string {
  const path = buildBinPath(ownerType, ownerId, binName, ctx);
  switch (operation) {
    case 'create': return `Create bin: ${path}`;
    case 'delete': return `Delete bin: ${path}`;
    case 'rename': return `Rename bin: ${path} → ${newName}`;
    case 'update': return `Update bin: ${path}`;
  }
}

/**
 * Build snapshot message for media operations
 */
export function snapshotMessageForMedia(
  operation: 'create' | 'delete' | 'update' | 'rename',
  ownerType: OwnerType,
  ownerId: string | null,
  binId: string,
  mediaName: string,
  ctx: PathContext,
  newName?: string
): string {
  const path = buildMediaPath(ownerType, ownerId, binId, mediaName, ctx);
  switch (operation) {
    case 'create': return `Create media: ${path}`;
    case 'delete': return `Delete media: ${path}`;
    case 'rename': return `Rename media: ${path} → ${newName}`;
    case 'update': return `Update media: ${path}`;
  }
}

/**
 * Build snapshot message for bin update with diff details
 */
export function snapshotMessageForBinUpdate(
  ownerType: OwnerType,
  ownerId: string | null,
  binName: string,
  ctx: PathContext,
  oldBin: Record<string, unknown>,
  newBin: Record<string, unknown>
): string {
  const path = buildBinPath(ownerType, ownerId, binName, ctx);
  const diff = describeChanges(oldBin, newBin);
  return `${path} updated: ${diff.changes.join(', ')}`;
}

/**
 * Build snapshot message for actor update with diff details
 */
export function snapshotMessageForActorUpdate(
  actorName: string,
  oldActor: Record<string, unknown>,
  newActor: Record<string, unknown>
): string {
  const path = `actor → ${actorName}`;
  const diff = describeChanges(oldActor, newActor);
  return `${path} updated: ${diff.changes.join(', ')}`;
}

/**
 * Build snapshot message for media update with diff details
 */
export function snapshotMessageForMediaUpdate(
  ownerType: OwnerType,
  ownerId: string | null,
  binId: string,
  mediaName: string,
  ctx: PathContext,
  oldMedia: Record<string, unknown>,
  newMedia: Record<string, unknown>
): string {
  const path = buildMediaPath(ownerType, ownerId, binId, mediaName, ctx);
  const diff = describeChanges(oldMedia, newMedia);
  return `${path} updated: ${diff.changes.join(', ')}`;
}

/**
 * Save a snapshot using pre-read catalog data
 */
export async function saveSnapshot(
  paths: ProjectPaths,
  message: string,
  catalog: CatalogCache
): Promise<void> {
  const snapshotPath = paths.catalog.snapshots;
  const redoPath = paths.catalog.redoSnapshots;

  try {
    await fs.writeFile(redoPath, '', 'utf8');

    const snapshot: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message,
      actors: catalog.actors,
      bins: catalog.bins,
      media: catalog.media,
      scenes: catalog.scenes,
    };

    await ensureJsonlFile(snapshotPath);
    let snapshots: Snapshot[] = await readJsonl<Snapshot>(snapshotPath).catch(() => []);

    snapshots.push(snapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots = snapshots.slice(-MAX_SNAPSHOTS);
    }

    await fs.writeFile(snapshotPath, snapshots.map(s => JSON.stringify(s)).join('\n') + '\n', 'utf8');
  } catch (err) {
    console.error('[Snapshot] Failed to save snapshot:', err);
  }
}

export function registerSnapshotRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  fastify.get('/api/snapshots', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const snapshots = await readJsonl<Snapshot>(paths.catalog.snapshots);
    const redoSnapshots = await readJsonl<Snapshot>(paths.catalog.redoSnapshots);
    const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const lastRedoSnapshot = redoSnapshots.length > 0 ? redoSnapshots[redoSnapshots.length - 1] : null;

    return {
      count: snapshots.length,
      canUndo: snapshots.length > 0,
      undoMessage: lastSnapshot?.message || null,
      canRedo: redoSnapshots.length > 0,
      redoMessage: lastRedoSnapshot?.message || null,
    };
  });

  fastify.post('/api/snapshots/undo', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const snapshots = await readJsonl<Snapshot>(paths.catalog.snapshots);
    if (snapshots.length === 0) {
      reply.code(400);
      return { error: 'Nothing to undo' };
    }

    const currentCatalog = await readCatalog(paths);
    const snapshot = snapshots.pop()!;

    // Save current to redo
    const redoSnapshot: Snapshot = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      message: snapshot.message,
      ...currentCatalog
    };

    const redoSnapshots = await readJsonl<Snapshot>(paths.catalog.redoSnapshots);
    redoSnapshots.push(redoSnapshot);
    await writeJsonlAll(paths.catalog.redoSnapshots, redoSnapshots.slice(-MAX_SNAPSHOTS));

    // Restore catalog
    await writeJsonlAll(paths.catalog.actors, snapshot.actors, ActorSchema);
    await writeJsonlAll(paths.catalog.bins, snapshot.bins, BinSchema);
    await writeJsonlAll(paths.catalog.media, snapshot.media, MediaSchema);
    await writeJsonlAll(paths.catalog.scenes, snapshot.scenes, SceneSchema);
    await writeJsonlAll(paths.catalog.snapshots, snapshots);

    const { message: snapshotMsg, ...snapshotData } = snapshot;

    return {
      success: true,
      message: `UNDO: ${snapshotMsg}`,
      ...snapshotData,
      canUndo: snapshots.length > 0,
      canRedo: true,
    };
  });

  fastify.post('/api/snapshots/redo', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;

    const redoSnapshots = await readJsonl<Snapshot>(paths.catalog.redoSnapshots);
    if (redoSnapshots.length === 0) {
      reply.code(400);
      return { error: 'Nothing to redo' };
    }

    const currentCatalog = await readCatalog(paths);
    const redoSnapshot = redoSnapshots.pop()!;

    // Save current to undo
    const undoSnapshot: Snapshot = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      message: redoSnapshot.message,
      ...currentCatalog
    };

    const snapshots = await readJsonl<Snapshot>(paths.catalog.snapshots);
    snapshots.push(undoSnapshot);
    await writeJsonlAll(paths.catalog.snapshots, snapshots.slice(-MAX_SNAPSHOTS));

    // Restore from redo
    await writeJsonlAll(paths.catalog.actors, redoSnapshot.actors, ActorSchema);
    await writeJsonlAll(paths.catalog.bins, redoSnapshot.bins, BinSchema);
    await writeJsonlAll(paths.catalog.media, redoSnapshot.media, MediaSchema);
    await writeJsonlAll(paths.catalog.scenes, redoSnapshot.scenes, SceneSchema);
    await writeJsonlAll(paths.catalog.redoSnapshots, redoSnapshots);

    const { message: redoMsg, ...redoData } = redoSnapshot;

    return {
      success: true,
      message: `REDO: ${redoMsg}`,
      ...redoData,
      canUndo: true,
      canRedo: redoSnapshots.length > 0,
    };
  });
}
