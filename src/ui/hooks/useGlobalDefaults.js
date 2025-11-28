import { useState, useEffect, useRef } from 'react';
import { getGlobalDefaults, updateGlobalDefaults } from '../api/client.js';

export function useGlobalDefaults() {
  const [defaults, setDefaults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

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
    // Update local state immediately so UI feels responsive
    setDefaults(prev => ({
      ...(prev || {}),
      [contentType]: {
        ...(prev?.[contentType] || {}),
        ...newSettings,
      },
    }));

    // Debounce server call to avoid spamming on slider moves
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    return new Promise((resolve, reject) => {
      debounceRef.current = setTimeout(async () => {
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

  useEffect(() => {
    loadDefaults();
  }, []);

  return {
    defaults,
    loading,
    error,
    updateDefaults,
    reload: loadDefaults
  };
}
