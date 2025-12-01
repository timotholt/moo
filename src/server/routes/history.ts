import { join } from 'path';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { readJsonl, appendJsonl, ensureJsonlFile, writeJsonlAll } from '../../utils/jsonl.js';

interface HistoryEntry {
  id: string;
  entryType: 'operation' | 'undo' | 'redo' | 'log';
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  command?: {
    type: string;
    payload: unknown;
    inverse: unknown;
  };
  undone?: boolean;
  details?: unknown;
  undoOf?: string;
  redoOf?: string;
}

type ProjectContext = { projectRoot: string; paths: ReturnType<typeof import('../../utils/paths.js').getProjectPaths> };

export function registerHistoryRoutes(fastify: FastifyInstance, getProjectContext: () => ProjectContext | null) {
  // Get all history entries
  fastify.get('/api/history', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const historyPath = join(paths.root, 'history.jsonl');
    await ensureJsonlFile(historyPath);
    
    const history = await readJsonl<HistoryEntry>(historyPath);
    // Return in reverse chronological order (newest first)
    return { history: history.reverse() };
  });

  // Add a new history entry
  fastify.post('/api/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const entry = request.body as HistoryEntry;
    if (!entry || !entry.id) {
      reply.code(400);
      return { error: 'Invalid history entry' };
    }
    
    const historyPath = join(paths.root, 'history.jsonl');
    await ensureJsonlFile(historyPath);
    await appendJsonl(historyPath, entry);
    
    return { success: true };
  });

  // Update a history entry (for marking undone/redone)
  fastify.put('/api/history/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const { id } = request.params;
    const updates = request.body as Partial<HistoryEntry>;
    
    const historyPath = join(paths.root, 'history.jsonl');
    await ensureJsonlFile(historyPath);
    
    const history = await readJsonl<HistoryEntry>(historyPath);
    const entryIndex = history.findIndex(e => e.id === id);
    
    if (entryIndex === -1) {
      reply.code(404);
      return { error: 'History entry not found' };
    }
    
    history[entryIndex] = { ...history[entryIndex], ...updates };
    await writeJsonlAll(historyPath, history);
    
    return { success: true, entry: history[entryIndex] };
  });

  // Clear all history entries
  fastify.delete('/api/history', async (_request: FastifyRequest, reply: FastifyReply) => {
    const ctx = getProjectContext();
    if (!ctx) {
      reply.code(400);
      return { error: 'No project selected' };
    }
    const { paths } = ctx;
    
    const historyPath = join(paths.root, 'history.jsonl');
    // Write empty array to clear the file
    await writeJsonlAll(historyPath, []);
    
    return { success: true };
  });
}
