import { createSignal } from 'solid-js';

const DEBUG_UNDO = false;

/**
 * Snapshot-based undo/redo stack
 * Server automatically saves snapshots before mutations
 * This hook provides undo and redo functionality
 * @param {Object} props
 * @param {Function} props.onStateRestored - Callback when state is restored
 */
export function useUndoStack({ onStateRestored }) {
  const [canUndo, setCanUndo] = createSignal(false);
  const [canRedo, setCanRedo] = createSignal(false);
  const [undoMessage, setUndoMessage] = createSignal(null);
  const [redoMessage, setRedoMessage] = createSignal(null);
  const [undoing, setUndoing] = createSignal(false);

  /**
   * Undo the last operation by restoring the previous snapshot
   */
  const undo = async () => {
    if (DEBUG_UNDO) {
      console.log('[Undo] Performing undo');
    }
    
    setUndoing(true);
    
    try {
      const response = await fetch('/api/snapshots/undo', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        console.error('[Undo] Failed:', data.error);
        return { success: false, error: data.error };
      }
      
      const data = await response.json();
      
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
          bins: data.bins || [],
          media: data.media || [],
          message: data.message || '',
        });
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      console.error('[Undo] Error:', err);
      return { success: false, error: err.message };
    } finally {
      setUndoing(false);
    }
  };

  /**
   * Redo the last undone operation
   */
  const redo = async () => {
    if (DEBUG_UNDO) {
      console.log('[Undo] Performing redo');
    }
    
    setUndoing(true);
    
    try {
      const response = await fetch('/api/snapshots/redo', {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        console.error('[Redo] Failed:', data.error);
        return { success: false, error: data.error };
      }
      
      const data = await response.json();
      
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
          bins: data.bins || [],
          media: data.media || [],
          message: data.message || '',
        });
      }
      
      return { success: true, message: data.message };
    } catch (err) {
      console.error('[Redo] Error:', err);
      return { success: false, error: err.message };
    } finally {
      setUndoing(false);
    }
  };

  /**
   * Refresh undo/redo state from server
   */
  const refreshUndoState = async () => {
    try {
      if (DEBUG_UNDO) {
        console.log('[Undo] Refreshing state from server...');
      }
      const response = await fetch('/api/snapshots');
      if (response.ok) {
        const data = await response.json();
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
  };

  return {
    canUndo, // Signal accessor
    canRedo, // Signal accessor
    undoMessage, // Signal accessor
    redoMessage, // Signal accessor
    undoing, // Signal accessor
    undo,
    redo,
    refreshUndoState,
  };
}
