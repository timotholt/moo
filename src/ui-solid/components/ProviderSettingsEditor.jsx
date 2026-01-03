import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import {
    Box, Typography, TextField, Select, MenuItem, FormControl,
    InputLabel, Stack, Button, CircularProgress
} from '@suid/material';
import { PlayArrow as PlayArrowIcon } from '@suid/icons-material';
import Slider from './Slider.jsx';
import { previewVoice } from '../api/client.js';

// Default settings by content type
const DEFAULT_SETTINGS = {
    dialogue: {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
        stability: 0.5,
        similarity_boost: 0.75,
    },
    music: {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
        duration_seconds: 30,
    },
    sfx: {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
    }
};

// Format helpers for music duration (stored as seconds, shown as mm:ss)
const formatSecondsToMmSs = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const total = Math.floor(seconds);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

const parseMmSsToSeconds = (input) => {
    const trimmed = String(input || '').trim();
    if (!trimmed) return null;

    // Allow plain seconds like "90"
    if (!trimmed.includes(':')) {
        const sec = Number(trimmed);
        return Number.isFinite(sec) ? sec : null;
    }

    // Accept formats like "1:30", "1:3", "1:" (=> 1 minute)
    const [mmStrRaw, ssStrRaw = ''] = trimmed.split(':');
    const mmStr = mmStrRaw.trim();
    const ssStr = ssStrRaw.trim();

    const mm = Number(mmStr);
    if (!Number.isFinite(mm) || mm < 0) return null;

    let ss = 0;
    if (ssStr !== '') {
        ss = Number(ssStr);
        if (!Number.isFinite(ss) || ss < 0) return null;
    }

    // Clamp seconds component to [0,59]
    if (ss > 59) ss = 59;

    return mm * 60 + ss;
};

export default function ProviderSettingsEditor(props) {
    // props: contentType, settings, voices, loadingVoices, onSettingsChange, allowInherit, error

    const [playingPreview, setPlayingPreview] = createSignal(false);
    // Local text state for music duration in mm:ss format
    const [durationText, setDurationText] = createSignal(formatSecondsToMmSs(DEFAULT_SETTINGS.music.duration_seconds));

    // Determine effective settings (handled inherit logic)
    const isInheriting = () => props.settings?.provider === 'inherit';

    const currentSettings = () => {
        if (isInheriting()) {
            return DEFAULT_SETTINGS[props.contentType] || {};
        }
        return props.settings || DEFAULT_SETTINGS[props.contentType] || {};
    };

    // Only include valid provider_settings properties
    const sanitizeSettings = (rawSettings) => {
        if (!rawSettings || rawSettings.provider === 'inherit') {
            return { provider: 'inherit' };
        }
        const validKeys = ['provider', 'voice_id', 'model_id', 'min_candidates', 'approval_count_default', 'stability', 'similarity_boost', 'duration_seconds'];
        const sanitized = {};
        for (const key of validKeys) {
            if (rawSettings[key] !== undefined) {
                sanitized[key] = rawSettings[key];
            }
        }
        return sanitized;
    };

    const handleChange = (key, value) => {
        if (props.onSettingsChange) {
            const base = currentSettings();
            const newSettings = { ...base, [key]: value };
            // If we were inheriting, we are now customizing, so make sure to copy all defaults
            if (isInheriting()) {
                Object.assign(newSettings, DEFAULT_SETTINGS[props.contentType]);
                newSettings[key] = value; // Apply override
            }
            props.onSettingsChange(sanitizeSettings(newSettings));
        }
    };

    const handleMultiChange = (changes) => {
        if (props.onSettingsChange) {
            const base = currentSettings();
            const newSettings = { ...base, ...changes };
            if (isInheriting()) {
                Object.assign(newSettings, DEFAULT_SETTINGS[props.contentType]);
                Object.assign(newSettings, changes);
            }
            props.onSettingsChange(sanitizeSettings(newSettings));
        }
    };

    const handleModeChange = (mode) => {
        if (mode === 'inherit') {
            props.onSettingsChange({ provider: 'inherit' });
        } else {
            // Switching to custom: start from defaults
            let base = { ...DEFAULT_SETTINGS[props.contentType] };
            // Try to pick a voice if needed
            if (props.contentType === 'dialogue' && Array.isArray(props.voices) && props.voices.length > 0) {
                const existingVoice = props.settings?.voice_id && props.voices.find(v => v.voice_id === props.settings.voice_id);
                if (existingVoice) {
                    base.voice_id = existingVoice.voice_id;
                } else {
                    base.voice_id = props.voices[0].voice_id;
                }
            }
            props.onSettingsChange(base);
        }
    };

    // Keep durationText in sync
    createEffect(() => {
        if (props.contentType === 'music') {
            const settings = currentSettings();
            const duration = settings.duration_seconds || DEFAULT_SETTINGS.music.duration_seconds;
            setDurationText(formatSecondsToMmSs(duration));
        }
    });

    const handlePlayPreview = async () => {
        const settings = currentSettings();
        if (!settings.voice_id) return;

        let stability = settings.stability || 0.5;
        const similarityBoost = settings.similarity_boost || 0.75;
        const modelId = settings.model_id || 'eleven_multilingual_v2';

        // v3 only accepts specific stability values
        if (modelId === 'eleven_v3') {
            if (stability < 0.25) stability = 0.0;
            else if (stability < 0.75) stability = 0.5;
            else stability = 1.0;
        }

        try {
            setPlayingPreview(true);
            const result = await previewVoice(
                settings.voice_id,
                "The quick brown fox jumps over the lazy dog!",
                stability,
                similarityBoost,
                modelId
            );

            const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
            await audio.play();
        } catch (err) {
            console.error('Failed to play voice preview:', err);
        } finally {
            setPlayingPreview(false);
        }
    };

    return (
        <Stack spacing={2}>
            {/* Inherit/Custom Mode */}
            <Show when={props.allowInherit}>
                <FormControl size="small" fullWidth>
                    <InputLabel>Provider Mode</InputLabel>
                    <Select
                        value={isInheriting() ? 'inherit' : 'custom'}
                        label="Provider Mode"
                        onChange={(e) => handleModeChange(e.target.value)}
                    >
                        <MenuItem value="inherit">Inherit from Defaults</MenuItem>
                        <MenuItem value="custom">Custom Settings</MenuItem>
                    </Select>
                </FormControl>
            </Show>

            <Show when={!isInheriting()}>
                {/* Provider Selection (always visible when custom) */}
                <FormControl size="small" fullWidth>
                    <InputLabel>Provider</InputLabel>
                    <Select
                        value={currentSettings().provider || 'elevenlabs'}
                        label="Provider"
                        onChange={(e) => handleChange('provider', e.target.value)}
                    >
                        <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                        <MenuItem value="manual">Manual</MenuItem>
                    </Select>
                </FormControl>

                <Show when={currentSettings().provider === 'elevenlabs'}>
                    {/* Model Selection */}
                    <Show when={props.contentType === 'dialogue'}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Model</InputLabel>
                            <Select
                                value={currentSettings().model_id || 'eleven_multilingual_v2'}
                                label="Model"
                                onChange={(e) => {
                                    const newModel = e.target.value;
                                    let newStability = currentSettings().stability;
                                    if (newModel === 'eleven_v3') {
                                        if (newStability == null) newStability = 0.5;
                                        if (newStability < 0.25) newStability = 0.0;
                                        else if (newStability < 0.75) newStability = 0.5;
                                        else newStability = 1.0;
                                    } else {
                                        if (newStability == null || Number.isNaN(newStability)) {
                                            newStability = 0.5;
                                        }
                                    }
                                    handleMultiChange({ model_id: newModel, stability: newStability });
                                }}
                            >
                                <MenuItem value="eleven_v3">Eleven v3 (alpha)</MenuItem>
                                <MenuItem value="eleven_multilingual_v2">Eleven Multilingual v2</MenuItem>
                                <MenuItem value="eleven_turbo_v2_5">Eleven Turbo v2.5</MenuItem>
                                <MenuItem value="eleven_flash_v2_5">Eleven Flash v2.5</MenuItem>
                            </Select>
                        </FormControl>
                    </Show>

                    {/* Voice Selection */}
                    <Show when={props.contentType === 'dialogue'}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <FormControl size="small" fullWidth>
                                <InputLabel shrink>Voice</InputLabel>
                                <Select
                                    value={currentSettings().voice_id || ''}
                                    label="Voice"
                                    displayEmpty
                                    onChange={(e) => handleChange('voice_id', e.target.value)}
                                    disabled={props.loadingVoices}
                                >
                                    <MenuItem value="">
                                        <em>- None -</em>
                                    </MenuItem>
                                    <For each={props.voices}>
                                        {(voice) => (
                                            <MenuItem value={voice.voice_id}>{voice.name}</MenuItem>
                                        )}
                                    </For>
                                </Select>
                            </FormControl>
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={playingPreview() ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                                onClick={handlePlayPreview}
                                disabled={playingPreview() || !currentSettings().voice_id}
                            >
                                {playingPreview() ? 'Playing...' : 'Sample'}
                            </Button>
                        </Box>
                    </Show>

                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            size="small"
                            label="Min Approved"
                            type="number"
                            value={currentSettings().approval_count_default || 1}
                            onChange={(e) => handleChange('approval_count_default', parseInt(e.target.value) || 1)}
                            inputProps={{ min: 1, max: 5 }}
                            sx={{ width: 140 }}
                        />
                        <TextField
                            size="small"
                            label="Min Candidates"
                            type="number"
                            value={currentSettings().min_candidates || 1}
                            onChange={(e) => handleChange('min_candidates', parseInt(e.target.value) || 1)}
                            inputProps={{ min: 1, max: 10 }}
                            sx={{ width: 140 }}
                        />
                    </Box>

                    {/* Dialogue Stability/Similarity */}
                    <Show when={props.contentType === 'dialogue'}>
                        <Box>
                            <Typography variant="caption" gutterBottom>
                                Stability: {currentSettings().stability ?? 0.5}
                            </Typography>
                            <Slider
                                value={currentSettings().stability ?? 0.5}
                                onChange={(e, value) => handleChange('stability', value)}
                                min={0}
                                max={1}
                                step={currentSettings().model_id === 'eleven_v3' ? 0.5 : 0.1}
                                size="small"
                            />
                        </Box>
                        <Show when={currentSettings().model_id !== 'eleven_v3'}>
                            <Box>
                                <Typography variant="caption" gutterBottom>
                                    Similarity Boost: {currentSettings().similarity_boost ?? 0.75}
                                </Typography>
                                <Slider
                                    value={currentSettings().similarity_boost ?? 0.75}
                                    onChange={(e, value) => handleChange('similarity_boost', value)}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    size="small"
                                />
                            </Box>
                        </Show>
                    </Show>

                    {/* Music Duration */}
                    <Show when={props.contentType === 'music'}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <TextField
                                size="small"
                                label="Duration (mm:ss)"
                                value={durationText()}
                                onChange={(e) => {
                                    setDurationText(e.target.value);
                                    const width_secs = parseMmSsToSeconds(e.target.value);
                                    if (width_secs != null) handleChange('duration_seconds', width_secs);
                                }}
                                sx={{ width: 160 }}
                            />
                            <Slider
                                value={currentSettings().duration_seconds || 30}
                                onChange={(e, value) => handleChange('duration_seconds', value)}
                                min={1}
                                max={300}
                                step={1}
                                size="small"
                            />
                        </Box>
                    </Show>
                </Show>
            </Show>

            <Show when={props.error}>
                <Typography color="error" variant="body2">
                    {props.error}
                </Typography>
            </Show>
        </Stack>
    );
}
