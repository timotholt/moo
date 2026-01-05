import { Show } from 'solid-js';
import { Box, Typography, CircularProgress } from '@suid/material';
import ProviderSettingsEditor from './ProviderSettingsEditor.jsx';
import { useGlobalDefaults } from '../hooks/useGlobalDefaults.jsx';

export default function ProviderDefaultsView(props) {
    // props: mediaType, voices, loadingVoices, error
    const { defaults, loading, error: defaultsError, updateDefaults } = useGlobalDefaults();

    const getMediaTypeTitle = (type) => {
        return type.charAt(0).toUpperCase() + type.slice(1);
    };

    const getMediaTypeDescription = (type) => {
        switch (type) {
            case 'dialogue':
                return 'Default settings for all dialogue media. Actors can inherit these settings or override with custom values.';
            case 'music':
                return 'Default settings for all music media. Actors can inherit these settings or override with custom values.';
            case 'sfx':
                return 'Default settings for all sound effects media. Actors can inherit these settings or override with custom values.';
            default:
                return 'Default provider settings for this media type.';
        }
    };

    const handleSettingsChange = async (newSettings) => {
        try {
            await updateDefaults(props.mediaType, newSettings);
        } catch (err) {
            console.error('Failed to update defaults:', err);
        }
    };

    const currentDefaults = () => defaults()?.[props.mediaType] || {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
        stability: props.mediaType === 'dialogue' ? 0.5 : undefined,
        similarity_boost: props.mediaType === 'dialogue' ? 0.75 : undefined
    };

    return (
        <Show when={!loading()} fallback={
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
            </Box>
        }>
            <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
                <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {getMediaTypeTitle(props.mediaType)} Defaults
                </Typography>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {getMediaTypeDescription(props.mediaType)}
                </Typography>

                <Box sx={{ p: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <ProviderSettingsEditor
                        mediaType={props.mediaType}
                        settings={currentDefaults()}
                        voices={props.voices()}
                        loadingVoices={props.loadingVoices()}
                        onSettingsChange={handleSettingsChange}
                        error={props.error || defaultsError()}
                    />
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 2 }}>
                    Note: Changes to default settings will only affect items created with "inherit".
                </Typography>
            </Box>
        </Show>
    );
}
