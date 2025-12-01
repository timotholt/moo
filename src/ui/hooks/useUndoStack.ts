import { useState, useCallback } from 'react';

const DEBUG_UNDO = false;

interface Actor {
  id: string;
  display_name: string;
  [key: string]: unknown;
}

interface Section {
  id: string;
  actor_id: string;
  [key: string]: unknown;
}

interface Content {
  id: string;
  [key: string]: unknown;
}

interface RestoredState {
  actors: Actor[];
  sections: Section[];
  content: Content[];
  message: string;
}

interface UseUndoStackProps {
  onStateRestored?: (state: RestoredState) => void;
}

interface UndoRedoResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface UseUndoStackReturn {
  canUndo: boolean;
  canRedo: boolean;
  undoMessage: string | null;
  redoMessage: string | null;
  undoing: boolean;
  undo: () => Promise<UndoRedoResult>;
  redo: () => Promise<UndoRedoResult>;
  refreshUndoState: () => Promise<void>;
}

interface SnapshotResponse {
  canUndo: boolean;
  canRedo: boolean;
  undoMessage: string | null;
  redoMessage: string | null;
  actors?: Actor[];
  sections?: Section[];
  content?: Content[];
  message?: string;
  error?: string;
}

/**
 * Snapshot-based undo/redo stack
 * Server automatically saves snapshots before mutations
 * This hook provides undo and redo functionality
 */
export function useUndoStack({ onStateRestored }: UseUndoStackProps): UseUndoStackReturn {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [redoMessage, setRedoMessage] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);

  /**
   * Undo the last operation by restoring the previous snapshot
   */
  const undo = useCallback(async (): Promise<UndoRedoResult> => {
    if (DEBUG_UNDO) {
      console.log('[Undo] Performing undo');
    }
    
    setUndoing(true);
    
    try {
      const response = await fetch('/api/snapshots/undo', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json() as SnapshotResponse;
        console.error('[Undo] Failed:', data.error);
        return { success: false, error: data.error };
      }
      
      const data = await response.json() as SnapshotResponse;
      
      if (DEBUG_UNDO) {
        console.log('[Undo] Restored:', data.message);
      }
      
      // Update undo/redo state from response
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      setUndoMessage(data.undoMessage);
      setRedoMessage(data.redoMessage);
      
      // Notify parent to update UI state
      if (onStateRestored) {
        onStateRestored({
          actors: data.actors || [],
          sections: data.sections || [],
          content: data.content || [],
          message: data.message || '',
        });
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      console.error('[Undo] Error:', err);
      return { success: false, error: (err as Error).message };
    } finally {
      setUndoing(false);
    }
  }, [onStateRestored]);

  /**
   * Redo the last undone operation
   */
  const redo = useCallback(async (): Promise<UndoRedoResult> => {
    if (DEBUG_UNDO) {
      console.log('[Undo] Performing redo');
    }
    
    setUndoing(true);
    
    try {
      const response = await fetch('/api/snapshots/redo', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json() as SnapshotResponse;
        console.error('[Redo] Failed:', data.error);
        return { success: false, error: data.error };
      }
      
      const data = await response.json() as SnapshotResponse;
      
      if (DEBUG_UNDO) {
        console.log('[Redo] Restored:', data.message);
      }
      
      // Update undo/redo state from response
      setCanUndo(data.canUndo);
      setCanRedo(data.canRedo);
      setUndoMessage(data.undoMessage);
      setRedoMessage(data.redoMessage);
      
      // Notify parent to update UI state
      if (onStateRestored) {
        onStateRestored({
          actors: data.actors || [],
          sections: data.sections || [],
          content: data.content || [],
          message: data.message || '',
        });
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      console.error('[Redo] Error:', err);
      return { success: false, error: (err as Error).message };
    } finally {
      setUndoing(false);
    }
  }, [onStateRestored]);

  /**
   * Refresh undo/redo state from server
   */
  const refreshUndoState = useCallback(async (): Promise<void> => {
    try {
      if (DEBUG_UNDO) {
        console.log('[Undo] Refreshing state from server...');
      }
      const response = await fetch('/api/snapshots');
      if (response.ok) {
        const data = await response.json() as SnapshotResponse;
        if (DEBUG_UNDO) {
          console.log('[Undo] State refreshed:', data);
        }
        setCanUndo(data.canUndo);
        setCanRedo(data.canRedo);
        setUndoMessage(data.undoMessage);
        setRedoMessage(data.redoMessage);
      } else {
        console.error('[Undo] Failed to refresh state:', response.status);
      }
    } catch (err) {
      console.error('[Undo] Error refreshing state:', err);
    }
  }, []);

  return {
    canUndo,
    canRedo,
    undoMessage,
    redoMessage,
    undoing,
    undo,
    redo,
    refreshUndoState,
  };
}
