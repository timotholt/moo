import { createSignal } from 'solid-js';
import { updateActor, updateScene } from '../api/client.js';
import { useVoices } from './useVoices.jsx';
import { useBinOperations } from './useBinOperations.jsx';
import { useMediaOperations } from './useMediaOperations.jsx';

/**
 * Composite hook for data operations
 * Combines voices, bin, and media operations into a single interface
 */
export function useDataOperations(props) {
    const [actorError, setActorError] = createSignal(null);

    // Compose smaller hooks
    const voiceOps = useVoices(props);

    const binOps = useBinOperations(props);

    const mediaOps = useMediaOperations(props);

    // Actor-specific operations
    const updateActorField = async (actorId, fields) => {
        try {
            const result = await updateActor(actorId, fields);
            if (result && result.actor && props.onActorUpdated) {
                props.onActorUpdated(result.actor);
            }
        } catch (err) {
            setActorError(err.message || String(err));
        }
    };

    // Scene-specific operations
    const updateSceneField = async (sceneId, fields) => {
        try {
            const result = await updateScene(sceneId, fields);
            if (result && result.scene && props.onSceneUpdated) {
                props.onSceneUpdated(result.scene);
            }
        } catch (err) {
            setActorError(err.message || String(err));
        }
    };

    // Combine errors from all sources
    const error = () => actorError() || binOps.error() || mediaOps.error() || voiceOps.voiceError();

    const setError = (err) => {
        setActorError(err);
        binOps.setError(err);
        mediaOps.setError(err);
    };

    return {
        // State
        mediaPrompt: mediaOps.mediaPrompt,
        mediaName: mediaOps.mediaName,
        creatingMedia: () => mediaOps.creating() || binOps.creating(),
        voices: voiceOps.voices,
        loadingVoices: voiceOps.loadingVoices,
        error,
        setError,

        // Handlers
        setMediaPrompt: mediaOps.setMediaPrompt,
        setMediaName: mediaOps.setMediaName,
        createMedia: mediaOps.createMedia,
        createBin: binOps.createBin,
        updateProviderSettings: binOps.updateProviderSettings,
        updateBinName: binOps.updateBinName,
        updateBinField: binOps.updateBinField,
        updateActorField,
        updateSceneField,
        toggleBinComplete: binOps.toggleBinComplete,
        deleteBin: binOps.deleteBin,
        deleteActor: props.deleteActor || (() => { }),
        deleteScene: props.deleteScene || (() => { }),

        // Expose voice loader for refresh if needed
        loadVoices: voiceOps.loadVoices
    };
}
