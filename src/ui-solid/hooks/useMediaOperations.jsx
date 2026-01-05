import { createSignal } from 'solid-js';
import { createMedia } from '../api/client.js';

/**
 * Hook for media item creation operations
 */
export function useMediaOperations(props) {
    const [mediaPrompt, setMediaPrompt] = createSignal('');
    const [mediaName, setMediaName] = createSignal('');
    const [creating, setCreating] = createSignal(false);
    const [error, setError] = createSignal(null);

    const createMediaItem = async (ownerId, ownerType, mediaType, binId) => {
        try {
            setCreating(true);
            setError(null);

            const result = await createMedia({
                owner_id: ownerId,
                owner_type: ownerType,
                media_type: mediaType,
                bin_id: binId,
                names: mediaName(),
                prompt: mediaPrompt() || undefined,
            });

            if (result && result.media && props.onMediaCreated) {
                if (Array.isArray(result.media)) {
                    result.media.forEach(item => props.onMediaCreated(item));
                } else {
                    props.onMediaCreated(result.media);
                }

                // Auto-expand to show the new media
                if (props.expandNode) {
                    props.expandNode(ownerType === 'actor' ? 'actors' : 'scenes');
                    props.expandNode(`${ownerType}-${ownerId}`);
                    if (binId) {
                        props.expandNode(`bin-${binId}`);
                    }
                }

                if (result.message) {
                    setError(result.message);
                }
            }

            setMediaPrompt('');
            setMediaName('');
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCreating(false);
        }
    };

    return {
        mediaPrompt,
        mediaName,
        creating,
        error,
        setMediaPrompt,
        setMediaName,
        setError,
        createMedia: createMediaItem,
    };
}
