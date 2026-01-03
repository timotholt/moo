import { createSignal } from 'solid-js';
import { createActor, updateActor, deleteActor } from '../api/client.js';

export function useActorOperations(props) {
    const [creating, setCreating] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createActorWithExpansion = async (actorData) => {
        try {
            setCreating(true);
            setError(null);

            const result = await createActor(actorData);

            // Handle batch creation (multiple actors) or single actor
            if (result && props.onActorCreated) {
                if (result.actors && Array.isArray(result.actors)) {
                    // Batch creation - multiple actors
                    result.actors.forEach(actor => props.onActorCreated(actor));
                } else if (result.actor) {
                    // Single actor creation
                    props.onActorCreated(result.actor);
                }

                // Auto-expand Actors to show the new actor(s)
                if (props.expandNode) {
                    props.expandNode('actors');
                }
            }

            // Show message about duplicates if any were skipped
            if (result.message) {
                setError(result.message);
            }

            return result;
        } catch (err) {
            setError(err.message || String(err));
            throw err;
        } finally {
            setCreating(false);
        }
    };

    const updateActorData = async (actorId, updates, oldName) => {
        try {
            setError(null);
            const result = await updateActor(actorId, updates);
            if (result.actor && props.onActorUpdated) {
                props.onActorUpdated(result.actor, oldName);
            }
            return result;
        } catch (err) {
            setError(err.message || String(err));
            throw err;
        }
    };

    const deleteActorById = async (actorId, actorName) => {
        try {
            setDeleting(true);
            setError(null);

            await deleteActor(actorId);
            if (props.onActorDeleted) {
                props.onActorDeleted(actorId);
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
