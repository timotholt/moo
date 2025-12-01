import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';
import type { Actor, Content, Section } from '../../types/index.js';
import { 
  buildActorPath, 
  buildSectionPath, 
  buildContentPath,
  type PathContext 
} from '../../utils/pathBuilder.js';
import { describeChanges } from '../../utils/diffDescriber.js';

const DEBUG_SNAPSHOT = true;

interface Snapshot {
  id: string;
  timestamp: string;
  message: string;
  actors: Actor[];
  sections: Section[];
  content: Content[];
}

/** Cached catalog data to avoid redundant reads */
export interface CatalogCache {
  actors: Actor[];
  sections: Section[];
  content: Content[];
}

type ProjectPaths = ReturnType<typeof import('../../utils/paths.js').getProjectPaths>;
type ProjectContext = { projectRoot: string; paths: ProjectPaths };

const MAX_SNAPSHOTS = 50;

/**
 * Read all catalog files and return cached data
 * Use this before mutations to avoid redundant reads
 */
export async function readCatalog(paths: ProjectPaths): Promise<CatalogCache> {
  const [actors, sections, content] = await Promise.all([
    readJsonl<Actor>(paths.catalog.actors).catch(() => [] as Actor[]),
    readJsonl<Section>(paths.catalog.sections).catch(() => [] as Section[]),
    readJsonl<Content>(paths.catalog.content).catch(() => [] as Content[]),
  ]);
  return { actors, sections, content };
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
 * Build snapshot message for section operations
 */
export function snapshotMessageForSection(
  operation: 'create' | 'delete' | 'update' | 'rename',
  actorId: string,
  sectionName: string,
  ctx: PathContext,
  newName?: string
): string {
  const path = buildSectionPath(actorId, sectionName, ctx);
  switch (operation) {
    case 'create': return `Create section: ${path.replace('Actors → ', '')}`;
    case 'delete': return `Delete section: ${path.replace('Actors → ', '')}`;
    case 'rename': return `Rename section: ${path.replace('Actors → ', '')} → ${newName}`;
    case 'update': return `Update section: ${path.replace('Actors → ', '')}`;
  }
}

/**
 * Build snapshot message for content operations
 */
export function snapshotMessageForContent(
  operation: 'create' | 'delete' | 'update' | 'rename',
  actorId: string,
  sectionId: string,
  cueName: string,
  ctx: PathContext,
  newName?: string
): string {
  const path = buildContentPath(actorId, sectionId, cueName, ctx);
  switch (operation) {
    case 'create': return `Create content: ${path.replace('Actors → ', '')}`;
    case 'delete': return `Delete content: ${path.replace('Actors → ', '')}`;
    case 'rename': return `Rename cue: ${path.replace('Actors → ', '')} → ${newName}`;
    case 'update': return `Update content: ${path.replace('Actors → ', '')}`;
  }
}

/**
 * Build snapshot message for section update with diff details
 */
export function snapshotMessageForSectionUpdate(
  actorId: string,
  sectionName: string,
  ctx: PathContext,
  oldSection: Record<string, unknown>,
  newSection: Record<string, unknown>
): string {
  const path = buildSectionPath(actorId, sectionName, ctx).replace('Actors → ', '');
  const diff = describeChanges(oldSection, newSection);
  
  if (!diff.hasChanges) {
    return `Update: ${path} (no changes)`;
  }
  
  // For single change, be specific
  if (diff.changes.length === 1) {
    return `${path}: ${diff.changes[0]}`;
  }
  
  // For multiple changes, use summary
  return `Update: ${path} (${diff.summary.toLowerCase()})`;
}

/**
 * Build snapshot message for actor update with diff details
 */
export function snapshotMessageForActorUpdate(
  actorName: string,
  oldActor: Record<string, unknown>,
  newActor: Record<string, unknown>
): string {
  const diff = describeChanges(oldActor, newActor);
  
  if (!diff.hasChanges) {
    return `Update actor: ${actorName} (no changes)`;
  }
  
  // Check for rename specifically
  if (oldActor.display_name !== newActor.display_name) {
    return `Rename actor: ${oldActor.display_name} → ${newActor.display_name}`;
  }
  
  // For single change, be specific
  if (diff.changes.length === 1) {
    return `${actorName}: ${diff.changes[0]}`;
  }
  
  // For multiple changes, use summary
  return `Update: ${actorName} (${diff.summary.toLowerCase()})`;
}

/**
 * Build snapshot message for content update with diff details
 */
export function snapshotMessageForContentUpdate(
  actorId: string,
  sectionId: string,
  cueName: string,
  ctx: PathContext,
  oldContent: Record<string, unknown>,
  newContent: Record<string, unknown>
): string {
  const path = buildContentPath(actorId, sectionId, cueName, ctx).replace('Actors → ', '');
  const diff = describeChanges(oldContent, newContent);
  
  if (!diff.hasChanges) {
    return `Update: ${path} (no changes)`;
  }
  
  // For single change, be specific
  if (diff.changes.length === 1) {
    return `${path}: ${diff.changes[0]}`;
  }
  
  // For multiple changes, use summary
  return `Update: ${path} (${diff.summary.toLowerCase()})`;
}

/**
 * Save a snapshot using pre-read catalog data
 * @param paths - Project paths
 * @param message - Description of the operation
 * @param catalog - Pre-read catalog data (avoids redundant reads)
 */
export async function saveSnapshot(
  paths: ProjectPaths,
  message: string,
  catalog: CatalogCache
): Promise<void> {
  const snapshotPath = join(paths.vof.dir, 'snapshots.jsonl');
  const redoPath = join(paths.vof.dir, 'redo-snapshots.jsonl');
  
  try {
    // Clear redo stack on new mutation
    const fs = await import('fs-extra').then(m => m.default);
    await fs.writeFile(redoPath, '', 'utf8');

    const snapshot: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message,
      actors: catalog.actors,
      sections: catalog.sections,
      content: catalog.content,
    };

    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Saving snapshot:', message);
    }

    // Read existing snapshots
    await ensureJsonlFile(snapshotPath);
    let snapshots: Snapshot[] = await readJsonl<Snapshot>(snapshotPath).catch(() => [] as Snapshot[]);

    // Add new snapshot
    snapshots.push(snapshot);

    // Trim to max size
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots = snapshots.slice(-MAX_SNAPSHOTS);
    }

    // Write back (use fs directly to avoid recursion)
    const snapshotContent = snapshots.map(s => JSON.stringify(s)).join('\n') + '\n';
    await fs.writeFile(snapshotPath, snapshotContent, 'utf8');

    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Saved, total snapshots:', snapshots.length);
    }
  } catch (err) {
    console.error('[Snapshot] Failed to save snapshot:', err);
    // Don't throw - we don't want to block the actual write
  }
}


export function registerSnapshotRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  
  // Get snapshot stack info
  fastify.get('/api/snapshots', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const snapshotPath = join(paths.vof.dir, 'snapshots.jsonl');
    const redoPath = join(paths.vof.dir, 'redo-snapshots.jsonl');
    await ensureJsonlFile(snapshotPath);
    await ensureJsonlFile(redoPath);
    
    const snapshots = await readJsonl<Snapshot>(snapshotPath);
    const redoSnapshots = await readJsonl<Snapshot>(redoPath);
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

  // Undo - restore last snapshot, save current to redo
  fastify.post('/api/snapshots/undo', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const snapshotPath = join(paths.vof.dir, 'snapshots.jsonl');
    const redoPath = join(paths.vof.dir, 'redo-snapshots.jsonl');
    await ensureJsonlFile(snapshotPath);
    await ensureJsonlFile(redoPath);
    
    const snapshots = await readJsonl<Snapshot>(snapshotPath);
    
    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Undo requested, total snapshots:', snapshots.length);
    }
    
    if (snapshots.length === 0) {
      reply.code(400);
      return { error: 'Nothing to undo' };
    }
    
    // Save current state to redo stack before restoring
    const [currentActors, currentSections, currentContent] = await Promise.all([
      readJsonl<Actor>(paths.catalog.actors).catch(() => [] as Actor[]),
      readJsonl<Section>(paths.catalog.sections).catch(() => [] as Section[]),
      readJsonl<Content>(paths.catalog.content).catch(() => [] as Content[]),
    ]);
    
    // Pop the last snapshot (this is what we're undoing)
    const snapshot = snapshots.pop()!;
    
    // Create redo snapshot with the operation message (what was done, now being undone)
    const redoSnapshot: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message: snapshot.message, // Same message - this is what we're undoing
      actors: currentActors,
      sections: currentSections,
      content: currentContent,
    };
    
    // Add to redo stack
    let redoSnapshots = await readJsonl<Snapshot>(redoPath).catch(() => [] as Snapshot[]);
    redoSnapshots.push(redoSnapshot);
    if (redoSnapshots.length > MAX_SNAPSHOTS) {
      redoSnapshots = redoSnapshots.slice(-MAX_SNAPSHOTS);
    }
    await writeJsonlAll(redoPath, redoSnapshots);
    
    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Undoing:', snapshot.message);
      console.log('[Snapshot] Restoring to:', snapshot.timestamp);
      console.log('[Snapshot] Actors:', snapshot.actors.length);
      console.log('[Snapshot] Sections:', snapshot.sections.length);
      console.log('[Snapshot] Content:', snapshot.content.length);
    }
    
    // Restore state from snapshot
    await writeJsonlAll(paths.catalog.actors, snapshot.actors);
    await writeJsonlAll(paths.catalog.sections, snapshot.sections);
    await writeJsonlAll(paths.catalog.content, snapshot.content);
    
    // Save remaining snapshots
    await writeJsonlAll(snapshotPath, snapshots);
    
    // Get next undo message
    const nextSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    
    // Return the restored state
    return {
      success: true,
      message: `UNDO: ${snapshot.message}`,
      actors: snapshot.actors,
      sections: snapshot.sections,
      content: snapshot.content,
      canUndo: snapshots.length > 0,
      undoMessage: nextSnapshot?.message || null,
      canRedo: true,
      redoMessage: redoSnapshot.message,
    };
  });

  // Redo - restore from redo stack, save current to undo
  fastify.post('/api/snapshots/redo', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const snapshotPath = join(paths.vof.dir, 'snapshots.jsonl');
    const redoPath = join(paths.vof.dir, 'redo-snapshots.jsonl');
    await ensureJsonlFile(snapshotPath);
    await ensureJsonlFile(redoPath);
    
    const redoSnapshots = await readJsonl<Snapshot>(redoPath);
    
    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Redo requested, total redo snapshots:', redoSnapshots.length);
    }
    
    if (redoSnapshots.length === 0) {
      reply.code(400);
      return { error: 'Nothing to redo' };
    }
    
    // Save current state to undo stack before restoring
    const [currentActors, currentSections, currentContent] = await Promise.all([
      readJsonl<Actor>(paths.catalog.actors).catch(() => [] as Actor[]),
      readJsonl<Section>(paths.catalog.sections).catch(() => [] as Section[]),
      readJsonl<Content>(paths.catalog.content).catch(() => [] as Content[]),
    ]);
    
    // Pop the last redo snapshot
    const redoSnapshot = redoSnapshots.pop()!;
    
    // Create undo snapshot
    const undoSnapshot: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      message: redoSnapshot.message,
      actors: currentActors,
      sections: currentSections,
      content: currentContent,
    };
    
    // Add to undo stack
    let snapshots = await readJsonl<Snapshot>(snapshotPath).catch(() => [] as Snapshot[]);
    snapshots.push(undoSnapshot);
    if (snapshots.length > MAX_SNAPSHOTS) {
      snapshots = snapshots.slice(-MAX_SNAPSHOTS);
    }
    await writeJsonlAll(snapshotPath, snapshots);
    
    if (DEBUG_SNAPSHOT) {
      console.log('[Snapshot] Redoing:', redoSnapshot.message);
      console.log('[Snapshot] Restoring to:', redoSnapshot.timestamp);
    }
    
    // Restore state from redo snapshot
    await writeJsonlAll(paths.catalog.actors, redoSnapshot.actors);
    await writeJsonlAll(paths.catalog.sections, redoSnapshot.sections);
    await writeJsonlAll(paths.catalog.content, redoSnapshot.content);
    
    // Save remaining redo snapshots
    await writeJsonlAll(redoPath, redoSnapshots);
    
    // Get next redo message
    const nextRedoSnapshot = redoSnapshots.length > 0 ? redoSnapshots[redoSnapshots.length - 1] : null;
    
    // Return the restored state
    return {
      success: true,
      message: `REDO: ${redoSnapshot.message}`,
      actors: redoSnapshot.actors,
      sections: redoSnapshot.sections,
      content: redoSnapshot.content,
      canUndo: true,
      undoMessage: undoSnapshot.message,
      canRedo: redoSnapshots.length > 0,
      redoMessage: nextRedoSnapshot?.message || null,
    };
  });

  // Clear all snapshots
  fastify.delete('/api/snapshots', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const snapshotPath = join(paths.vof.dir, 'snapshots.jsonl');
    await writeJsonlAll(snapshotPath, []);
    
    return { success: true };
  });
}
