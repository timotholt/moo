import { createSignal } from 'solid-js';
import { updateActor } from '../api/client.js';
import { useVoices } from './useVoices.jsx';
import { useSectionOperations } from './useSectionOperations.jsx';
import { useContentOperations } from './useContentOperations.jsx';

/**
 * Composite hook for data operations
 * Combines voices, section, and content operations into a single interface
 */
export function useDataOperations(props) {
    const [actorError, setActorError] = createSignal(null);

    // Compose smaller hooks
    const voiceOps = useVoices(props);

    const sectionOps = useSectionOperations(props);

    const contentOps = useContentOperations(props);

    // Actor-specific operations (kept here as they're simple)
    const updateBaseFilename = async (actorId, newBaseFilename) => {
        try {
            const result = await updateActor(actorId, { base_filename: newBaseFilename });
            if (result && result.actor && props.onActorUpdated) {
                props.onActorUpdated(result.actor);
            }
        } catch (err) {
            setActorError(err.message || String(err));
        }
    };

    const updateDisplayName = async (actorId, newDisplayName, oldDisplayName) => {
        try {
            const result = await updateActor(actorId, { display_name: newDisplayName });
            if (result && result.actor && props.onActorUpdated) {
                props.onActorUpdated(result.actor, oldDisplayName);
            }
        } catch (err) {
            setActorError(err.message || String(err));
        }
    };

    // Combine errors from all sources
    const error = () => actorError() || sectionOps.error() || contentOps.error() || voiceOps.voiceError();

    const setError = (err) => {
        setActorError(err);
        sectionOps.setError(err);
        contentOps.setError(err);
    };

    return {
        // State (backward compatible interface)
        contentPrompt: contentOps.contentPrompt,
        contentCueId: contentOps.contentCueId,
        creatingContent: () => contentOps.creating() || sectionOps.creating(),
        voices: voiceOps.voices,
        loadingVoices: voiceOps.loadingVoices,
        error,
        setError,

        // Handlers (backward compatible interface)
        setContentPrompt: contentOps.setContentPrompt,
        setContentCueId: contentOps.setContentCueId,
        createContent: contentOps.createContent,
        createSection: sectionOps.createSection,
        updateProviderSettings: sectionOps.updateProviderSettings,
        updateSectionName: sectionOps.updateSectionName,
        updateBaseFilename,
        updateDisplayName,
        toggleSectionComplete: sectionOps.toggleSectionComplete,
        deleteSection: sectionOps.deleteSection,
        deleteActor: props.deleteActor || (() => { }), // Need to ensure it's passed or used from useActorOperations

        // Expose voice loader for refresh if needed
        loadVoices: voiceOps.loadVoices
    };
}
