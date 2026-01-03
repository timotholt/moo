import { createSignal, onMount } from 'solid-js';
import { getGlobalDefaults, updateGlobalDefaults } from '../api/client.js';

export function useGlobalDefaults() {
    const [defaults, setDefaults] = createSignal(null);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    let debounceTimer = null;

    const loadDefaults = async () => {
        try {
            setLoading(true);
            setError(null);
            const result = await getGlobalDefaults();
            setDefaults(result.defaults);
        } catch (err) {
            console.error('Failed to load global defaults:', err);
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const updateDefaults = async (contentType, newSettings) => {
        // Update local state immediately
        const current = defaults();
        const updated = {
            ...(current || {}),
            [contentType]: {
                ...(current?.[contentType] || {}),
                ...newSettings,
            },
        };
        setDefaults(updated);

        if (debounceTimer) clearTimeout(debounceTimer);

        return new Promise((resolve, reject) => {
            debounceTimer = setTimeout(async () => {
                try {
                    setError(null);
                    const result = await updateGlobalDefaults(contentType, newSettings);
                    setDefaults(result.defaults);
                    resolve(result);
                } catch (err) {
                    console.error('Failed to update global defaults:', err);
                    setError(err.message || String(err));
                    reject(err);
                }
            }, 750);
        });
    };

    onMount(loadDefaults);

    return {
        defaults,
        loading,
        error,
        updateDefaults,
        reload: loadDefaults
    };
}
