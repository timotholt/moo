import { createSignal } from 'solid-js';
import { createContent } from '../api/client.js';

/**
 * Hook for content/cue creation operations
 */
export function useContentOperations(props) {
    const [contentPrompt, setContentPrompt] = createSignal('');
    const [contentCueId, setContentCueId] = createSignal('');
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createContentItem = async (actorId, contentType, sectionId) => {
        try {
            setCreating(true);
            setError(null);

            const result = await createContent({
                actor_id: actorId,
                content_type: contentType,
                section_id: sectionId,
                cue_id: contentCueId(),
                prompt: contentPrompt() || undefined,
            });

            if (result && result.content && props.onContentCreated) {
                if (Array.isArray(result.content)) {
                    result.content.forEach(item => props.onContentCreated(item));
                } else {
                    props.onContentCreated(result.content);
                }

                // Auto-expand to show the new content
                if (props.expandNode) {
                    props.expandNode('actors');
                    props.expandNode(`actor-${actorId}`);
                    if (sectionId) {
                        props.expandNode(`section-${sectionId}`);
                    }
                }

                if (result.message) {
                    setError(result.message);
                }
            }

            setContentPrompt('');
            setContentCueId('');
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCreating(false);
        }
    };

    return {
        contentPrompt,
        contentCueId,
        creating,
        error,
        setContentPrompt,
        setContentCueId,
        setError,
        createContent: createContentItem,
    };
}
