import { createSignal } from 'solid-js';
import { createSection, updateSection, updateActor, updateScene } from '../api/client.js';

/**
 * Hook for section CRUD operations
 */
export function useSectionOperations(props) {
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createSectionForOwner = async (ownerId, ownerType, contentType, customName = null) => {
        try {
            setCreating(true);
            setError(null);

            let name = customName || contentType;
            let extraData = {};

            if (customName && typeof customName === 'object') {
                name = customName.name || contentType;
                extraData = customName;
            }

            const sectionData = {
                owner_id: ownerId,
                owner_type: ownerType,
                content_type: contentType,
                name: name,
                ...extraData
            };

            console.log('[useSectionOperations] Creating section with payload:', sectionData);

            const result = await createSection(sectionData);

            if (result && result.section && props.onSectionCreated) {
                props.onSectionCreated(result.section);

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

    const updateSectionDefaultBlocks = async (sectionId, contentType, newSettings) => {
        try {
            const section = props.sections.find(s => s.id === sectionId);
            if (!section) {
                console.error('[useSectionOperations] Section not found:', sectionId);
                return;
            }

            const updatedBlocks = {
                ...section.default_blocks,
                [contentType]: newSettings
            };

            const result = await updateSection(sectionId, {
                default_blocks: updatedBlocks
            });

            if (result && result.section && props.onSectionUpdated) {
                props.onSectionUpdated(result.section);
            }
        } catch (err) {
            console.error('[useSectionOperations] Error:', err);
            setError(err.message || String(err));
        }
    };

    const updateSectionName = async (sectionId, newName, oldName) => {
        try {
            const result = await updateSection(sectionId, { name: newName });
            if (result && result.section && props.onSectionUpdated) {
                props.onSectionUpdated(result.section, oldName);
            }
        } catch (err) {
            setError(err.message || String(err));
        }
    };

    const toggleSectionComplete = async (sectionId, newCompleteValue) => {
        try {
            const result = await updateSection(sectionId, { section_complete: newCompleteValue });
            if (result && result.section && props.onSectionUpdated) {
                props.onSectionUpdated(result.section);
            }

            // If section is being marked incomplete, also mark parent incomplete
            if (newCompleteValue === false) {
                const section = props.sections.find((s) => s.id === sectionId);
                if (section && section.owner_id) {
                    try {
                        if (section.owner_type === 'actor') {
                            const actorResult = await updateActor(section.owner_id, { actor_complete: false });
                            if (actorResult && actorResult.actor && props.onActorUpdated) {
                                props.onActorUpdated(actorResult.actor);
                            }
                        } else if (section.owner_type === 'scene') {
                            const sceneResult = await updateScene(section.owner_id, { scene_complete: false });
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

    const deleteSectionById = async (sectionId) => {
        try {
            setCreating(true);
            setError(null);
            await deleteSection(sectionId);
            if (props.onSectionDeleted) {
                props.onSectionDeleted(sectionId);
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
        createSection: createSectionForOwner,
        updateProviderSettings: updateSectionDefaultBlocks, // Kept same name for compatibility
        updateSectionName,
        toggleSectionComplete,
        deleteSection: deleteSectionById,
    };
}
