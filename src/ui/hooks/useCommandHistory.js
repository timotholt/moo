import { useState, useCallback, useEffect, useRef } from 'react';
import { EntryType, LogType } from '../commands/types.js';
import { executeCommand, executeInverse } from '../commands/executor.js';

const DEBUG_HISTORY = true;

/**
 * Hook for managing command history with undo/redo support
 * Replaces useAppLog with full command dispatch capabilities
 */
export function useCommandHistory({ actors, sections, content, onStateChange }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Use refs to always have current state in callbacks without stale closures
  const stateRef = useRef({ actors, sections, content });
  useEffect(() => {
    stateRef.current = { actors, sections, content };
  }, [actors, sections, content]);

  // Load history from server on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Expose reload function for external triggers (e.g., project change)
  const reloadHistory = useCallback(() => {
    setLoading(true);
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      if (DEBUG_HISTORY) {
        console.log('[History] Loading history from server...');
      }
      const response = await fetch('/api/history');
      if (DEBUG_HISTORY) {
        console.log('[History] Response status:', response.status);
      }
      if (response.ok) {
        const data = await response.json();
        if (DEBUG_HISTORY) {
          console.log('[History] Loaded entries:', data.history?.length || 0);
        }
        setHistory(data.history || []);
      } else {
        console.error('[History] Failed to load, status:', response.status);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveEntry = async (entry) => {
    try {
      if (DEBUG_HISTORY) {
        console.log('[History] Saving entry:', entry.id, entry.message);
      }
      const response = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (DEBUG_HISTORY) {
        console.log('[History] Save response:', response.status);
      }
      if (!response.ok) {
        console.error('[History] Failed to save entry:', response.status);
      }
    } catch (err) {
      console.error('Failed to save history entry:', err);
    }
  };

  const updateEntry = async (entryId, updates) => {
    try {
      await fetch(`/api/history/${entryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('Failed to update history entry:', err);
    }
  };

  /**
   * Dispatch a command - executes it and adds to history
   */
  const dispatch = useCallback(async (command) => {
    if (DEBUG_HISTORY) {
      console.log('[History] Dispatching:', command);
    }

    const state = stateRef.current;
    const result = await executeCommand(command, state);

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      entryType: EntryType.OPERATION,
      timestamp: new Date().toISOString(),
      type: result.success ? LogType.INFO : LogType.ERROR,
      message: result.message,
      command: result.success ? {
        type: command.type,
        payload: command.payload,
        inverse: result.inverse,
      } : null,
      undone: false,
    };

    setHistory(prev => [entry, ...prev]);
    await saveEntry(entry);

    if (result.success && onStateChange) {
      onStateChange(command.type, result.result);
    }

    return result;
  }, [onStateChange]);

  /**
   * Undo a single operation by entry ID
   */
  const undo = useCallback(async (entryId) => {
    // Find the specific entry to undo
    const entry = history.find(e => e.id === entryId);
    if (!entry) return { success: false, error: 'Entry not found' };
    if (entry.entryType !== EntryType.OPERATION || !entry.command) {
      return { success: false, error: 'Entry is not an undoable operation' };
    }
    if (entry.undone) {
      return { success: false, error: 'Entry is already undone' };
    }

    if (DEBUG_HISTORY) {
      console.log('[History] Undoing single entry:', { id: entry.id, message: entry.message, inverse: entry.command?.inverse });
    }

    // Execute the inverse
    const state = stateRef.current;
    const result = await executeInverse(entry.command, state);

    if (!result.success) {
      // Log the failure
      const errorEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entryType: EntryType.LOG,
        timestamp: new Date().toISOString(),
        type: LogType.ERROR,
        message: `Failed to undo: ${result.error}`,
      };
      setHistory(prev => [errorEntry, ...prev]);
      await saveEntry(errorEntry);
      return result;
    }

    // Mark entry as undone
    await updateEntry(entry.id, { undone: true });

    // Log the undo action
    const undoLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      entryType: EntryType.UNDO,
      timestamp: new Date().toISOString(),
      type: LogType.INFO,
      message: `UNDO: ${entry.message}`,
      undoOf: entry.id,
    };
    setHistory(prev => [undoLogEntry, ...prev.map(e => e.id === entry.id ? { ...e, undone: true } : e)]);
    await saveEntry(undoLogEntry);

    // Update app state
    if (onStateChange) {
      onStateChange(`UNDO_${entry.command.type}`, result.result);
    }

    return { success: true };
  }, [history, onStateChange]);

  /**
   * Redo a single undone operation by entry ID
   */
  const redo = useCallback(async (entryId) => {
    // Find the specific entry to redo
    const entry = history.find(e => e.id === entryId);
    if (!entry) return { success: false, error: 'Entry not found' };
    if (entry.entryType !== EntryType.OPERATION || !entry.command) {
      return { success: false, error: 'Entry is not a redoable operation' };
    }
    if (!entry.undone) {
      return { success: false, error: 'Entry is not undone' };
    }

    if (DEBUG_HISTORY) {
      console.log('[History] Redoing single entry:', { id: entry.id, message: entry.message });
    }

    // Re-execute the command
    const state = stateRef.current;
    const result = await executeCommand(entry.command, state);

    if (!result.success) {
      const errorEntry = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        entryType: EntryType.LOG,
        timestamp: new Date().toISOString(),
        type: LogType.ERROR,
        message: `Failed to redo: ${result.error}`,
      };
      setHistory(prev => [errorEntry, ...prev]);
      await saveEntry(errorEntry);
      return result;
    }

    // Mark entry as not undone
    await updateEntry(entry.id, { undone: false });

    // Log the redo action
    const redoLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      entryType: EntryType.REDO,
      timestamp: new Date().toISOString(),
      type: LogType.INFO,
      message: `REDO: ${entry.message}`,
      redoOf: entry.id,
    };
    setHistory(prev => [redoLogEntry, ...prev.map(e => e.id === entry.id ? { ...e, undone: false } : e)]);
    await saveEntry(redoLogEntry);

    // Update app state
    if (onStateChange) {
      onStateChange(entry.command.type, result.result);
    }

    return { success: true };
  }, [history, onStateChange]);

  /**
   * Add a simple log entry (non-undoable)
   */
  const log = useCallback(async (type, message, details = null) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      entryType: EntryType.LOG,
      timestamp: new Date().toISOString(),
      type,
      message,
      details,
    };

    setHistory(prev => [entry, ...prev]);
    await saveEntry(entry);
  }, []);

  const logInfo = useCallback((message, details) => log(LogType.INFO, message, details), [log]);
  const logSuccess = useCallback((message, details) => log(LogType.SUCCESS, message, details), [log]);
  const logError = useCallback((message, details) => log(LogType.ERROR, message, details), [log]);
  const logWarning = useCallback((message, details) => log(LogType.WARNING, message, details), [log]);

  return {
    history,
    loading,
    dispatch,
    undo,
    redo,
    reloadHistory,
    logInfo,
    logSuccess,
    logError,
    logWarning,
  };
}
