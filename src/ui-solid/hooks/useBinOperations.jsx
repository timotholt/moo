import { createSignal } from 'solid-js';
import { createBin, updateBin, updateActor, updateScene, deleteBin } from '../api/client.js';

/**
 * Hook for media bin CRUD operations
 */
export function useBinOperations(props) {
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createBinForOwner = async (ownerId, ownerType, mediaType, customName = null) => {
        try {
            setCreating(true);
            setError(null);

            let name = customName || mediaType;
            let extraData = {};

            if (customName && typeof customName === 'object') {
                name = customName.name || mediaType;
                extraData = customName;
            }

            const binData = {
                owner_id: ownerId,
                owner_type: ownerType,
                media_type: mediaType,
                name: name,
                ...extraData
            };

            console.log('[useBinOperations] Creating bin with payload:', binData);

            const result = await createBin(binData);

            if (result && result.bin && props.onBinCreated) {
                props.onBinCreated(result.bin);

                if (props.expandNode) {
                    props.expandNode(ownerType === 'actor' ? 'actors' : 'scenes');
                    props.expandNode(`${ownerType}-${ownerId}`);
                }
            }
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCreating(false);
        }
    };

    const updateBinField = async (binId, fields) => {
        try {
            const result = await updateBin(binId, fields);
            if (result && result.bin && props.onBinUpdated) {
                props.onBinUpdated(result.bin);
            }
        } catch (err) {
            setError(err.message || String(err));
        }
    };

    const updateBinDefaultBlocks = async (binId, mediaType, newSettings) => {
        try {
            const bin = props.bins.find(b => b.id === binId);
            if (!bin) {
                console.error('[useBinOperations] Bin not found:', binId);
                return;
            }

            const updatedBlocks = {
                ...bin.default_blocks,
                [mediaType]: newSettings
            };

            await updateBinField(binId, {
                default_blocks: updatedBlocks
            });
        } catch (err) {
            console.error('[useBinOperations] Error:', err);
            setError(err.message || String(err));
        }
    };

    const updateBinName = async (binId, newName, oldName) => {
        try {
            const result = await updateBin(binId, { name: newName });
            if (result && result.bin && props.onBinUpdated) {
                props.onBinUpdated(result.bin, oldName);
            }
        } catch (err) {
            setError(err.message || String(err));
        }
    };

    const toggleBinComplete = async (binId, newCompleteValue) => {
        try {
            const result = await updateBin(binId, { bin_complete: newCompleteValue });
            if (result && result.bin && props.onBinUpdated) {
                props.onBinUpdated(result.bin);
            }

            // If bin is being marked incomplete, also mark parent incomplete
            if (newCompleteValue === false) {
                const bin = props.bins.find((b) => b.id === binId);
                if (bin && bin.owner_id) {
                    try {
                        if (bin.owner_type === 'actor') {
                            const actorResult = await updateActor(bin.owner_id, { actor_complete: false });
                            if (actorResult && actorResult.actor && props.onActorUpdated) {
                                props.onActorUpdated(actorResult.actor);
                            }
                        } else if (bin.owner_type === 'scene') {
                            const sceneResult = await updateScene(bin.owner_id, { scene_complete: false });
                            if (sceneResult && sceneResult.scene && props.onSceneUpdated) {
                                props.onSceneUpdated(sceneResult.scene);
                            }
                        }
                    } catch (err) {
                        setError(err.message || String(err));
                    }
                }
            }
        } catch (err) {
            setError(err.message || String(err));
        }
    };

    const deleteBinById = async (binId) => {
        try {
            setCreating(true);
            setError(null);
            await deleteBin(binId);
            if (props.onBinDeleted) {
                props.onBinDeleted(binId);
            }
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCreating(false);
        }
    };

    return {
        creating,
        error,
        setError,
        createBin: createBinForOwner,
        updateBinField,
        updateProviderSettings: updateBinDefaultBlocks,
        updateBinName,
        toggleBinComplete,
        deleteBin: deleteBinById,
    };
}
