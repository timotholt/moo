import { createSignal } from 'solid-js';
import { createSection, updateSection, updateActor } from '../api/client.js';

/**
 * Sanitize provider settings to only include valid schema properties
 */
function sanitizeProviderSettings(settings, contentType) {
    if (!settings || settings.provider === 'inherit') {
        return { provider: 'inherit' };
    }

    let validKeys;
    if (contentType === 'dialogue') {
        validKeys = ['provider', 'voice_id', 'model_id', 'min_candidates', 'approval_count_default', 'stability', 'similarity_boost'];
    } else if (contentType === 'music') {
        validKeys = ['provider', 'min_candidates', 'approval_count_default', 'duration_seconds'];
    } else {
        validKeys = ['provider', 'min_candidates', 'approval_count_default'];
    }

    const sanitized = {};
    for (const key of validKeys) {
        if (settings[key] !== undefined) {
            sanitized[key] = settings[key];
        }
    }
    return sanitized;
}

/**
 * Hook for section CRUD operations
 */
export function useSectionOperations(props) {
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createSectionForActor = async (actorId, contentType, customName = null) => {
        try {
            setCreating(true);
            setError(null);

            const sectionData = {
                actor_id: actorId,
                content_type: contentType,
            };

            if (customName) {
                sectionData.name = customName;
            }

            const result = await createSection(sectionData);

            if (result && result.section && props.onSectionCreated) {
                props.onSectionCreated(result.section);

                if (props.expandNode) {
                    props.expandNode('actors');
                    props.expandNode(`actor-${actorId}`);
                }
            }
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCreating(false);
        }
    };

    const updateSectionProviderSettings = async (sectionId, newSettings) => {
        try {
            const section = props.sections.find(s => s.id === sectionId);
            if (!section) {
                console.error('[useSectionOperations] Section not found:', sectionId);
                return;
            }

            const sanitizedSettings = sanitizeProviderSettings(newSettings, section.content_type);
            const result = await updateSection(sectionId, {
                provider_settings: sanitizedSettings
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

            // If section is being marked incomplete, also mark parent actor as incomplete
            if (newCompleteValue === false) {
                const section = props.sections.find((s) => s.id === sectionId);
                if (section) {
                    try {
                        const actorResult = await updateActor(section.actor_id, { actor_complete: false });
                        if (actorResult && actorResult.actor && props.onActorUpdated) {
                            props.onActorUpdated(actorResult.actor);
                        }
                    } catch (actorErr) {
                        setError(actorErr.message || String(actorErr));
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
            creating(false);
        }
    };

    return {
        creating,
        error,
        setError,
        createSection: createSectionForActor,
        updateProviderSettings: updateSectionProviderSettings,
        updateSectionName,
        toggleSectionComplete,
        deleteSection: deleteSectionById,
    };
}
