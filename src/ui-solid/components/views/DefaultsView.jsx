import { Box, Typography, CircularProgress } from '@suid/material';
import { Show } from 'solid-js';
import DefaultBlockManager from '../DefaultBlockManager.jsx';
import { useGlobalDefaults } from '../../hooks/useGlobalDefaults.jsx';
import { useVoices } from '../../hooks/useVoices.jsx';

export default function DefaultsView() {
    const { defaults, loading, error, updateDefaults } = useGlobalDefaults();
    const voiceOps = useVoices();

    const handleUpdate = async (newBlocks) => {
        // Find which type changed
        const current = defaults() || {};
        const changedType = Object.keys(newBlocks).find(
            type => JSON.stringify(newBlocks[type]) !== JSON.stringify(current[type])
        );

        // If a type was removed
        const removedType = Object.keys(current).find(type => !newBlocks[type]);

        if (changedType) {
            await updateDefaults(changedType, newBlocks[changedType]);
        } else if (removedType) {
            // In global defaults, we probably shouldn't "remove" but reset to hard defaults
            // For now, let's just update with the new block set if provided
            // Actually our API updateGlobalDefaults(mediaType, settings)
        }
    };

    return (
        <Show when={!loading()} fallback={
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        }>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
                <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Project Defaults
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    Define the baseline settings for your project. These blocks serve as the ultimate fallback for all bins and media items.
                </Typography>

                <DefaultBlockManager
                    owner={{ default_blocks: defaults() || {} }}
                    ownerType="project"
                    parent={null}
                    projectDefaults={{}} // We are the defaults
                    voices={voiceOps.voices()}
                    loadingVoices={voiceOps.loadingVoices()}
                    onUpdate={(newBlocks) => {
                        // Logic to sync back to server via updateDefaults
                        // The manager passes the WHOLE default_blocks object
                        Object.entries(newBlocks).forEach(([type, settings]) => {
                            if (JSON.stringify(settings) !== JSON.stringify(defaults()?.[type])) {
                                updateDefaults(type, settings);
                            }
                        });

                        // Handle removal
                        if (defaults()) {
                            Object.keys(defaults()).forEach(type => {
                                if (!newBlocks[type]) {
                                    // Reset to an empty object or handle as needed
                                    updateDefaults(type, { provider: 'elevenlabs' });
                                }
                            });
                        }
                    }}
                />
            </Box>
        </Show>
    );
}
