import { useState } from 'react';
import { createActor, updateActor, deleteActor } from '../api/client.js';

export function useActorOperations({ onActorCreated, onActorUpdated, onActorDeleted, expandNode }) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const createActorWithExpansion = async (actorData) => {
    try {
      setCreating(true);
      setError(null);
      const result = await createActor(actorData);
      if (result && result.actor && onActorCreated) {
        onActorCreated(result.actor);
        
        // Auto-expand Actors to show the new actor
        if (expandNode) {
          expandNode('actors');
        }
      }
      return result;
    } catch (err) {
      setError(err.message || String(err));
      throw err;
    } finally {
      setCreating(false);
    }
  };

  const updateActorData = async (actorId, updates) => {
    try {
      setError(null);
      const result = await updateActor(actorId, updates);
      if (result && result.actor && onActorUpdated) {
        onActorUpdated(result.actor);
      }
      return result;
    } catch (err) {
      setError(err.message || String(err));
      throw err;
    }
  };

  const deleteActorById = async (actorId) => {
    try {
      setDeleting(true);
      setError(null);
      await deleteActor(actorId);
      if (onActorDeleted) {
        onActorDeleted(actorId);
      }
    } catch (err) {
      setError(err.message || String(err));
      throw err;
    } finally {
      setDeleting(false);
    }
  };

  return {
    creating,
    deleting,
    error,
    setError,
    createActor: createActorWithExpansion,
    updateActor: updateActorData,
    deleteActor: deleteActorById
  };
}
