import { createSignal, createEffect, onMount, For, Show } from 'solid-js';
import {
    Box, Typography, Select, MenuItem, FormControl,
    InputLabel, Stack, Button, CircularProgress
} from '@suid/material';
import PlayArrowIcon from '@suid/icons-material/PlayArrow';
import Slider from './Slider.jsx';
import TextInput from './TextInput.jsx';
import { previewVoice } from '../api/client.js';

// Absolute fallback defaults
const FALLBACK_DEFAULTS = {
    dialogue: {
        provider: 'elevenlabs',
        min_candidates: 1,
        approval_count_default: 1,
        stability: 0.5,
        similarity_boost: 0.75,
        model_id: 'eleven_multilingual_v2'
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
    },
    video: {
        provider: 'openai',
        min_candidates: 1,
        approval_count_default: 1,
        motion_strength: 0.5,
    },
    image: {
        provider: 'openai',
        min_candidates: 1,
        approval_count_default: 1,
        model: 'dall-e-3',
        quality: 'standard',
        size: '1024x1024',
    },
    text: {
        provider: 'openai',
        min_candidates: 1,
        approval_count_default: 1,
        model_id: 'gpt-4o',
    }
};

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
    if (!trimmed.includes(':')) {
        const sec = Number(trimmed);
        return Number.isFinite(sec) ? sec : null;
    }
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
    if (ss > 59) ss = 59;
    return mm * 60 + ss;
};

export default function ProviderSettingsEditor(props) {
    // props: mediaType, settings, inheritedSettings, voices, loadingVoices, onSettingsChange, allowInherit, error

    const [playingPreview, setPlayingPreview] = createSignal(false);
    const [durationText, setDurationText] = createSignal('00:30');

    const isInheriting = () => props.settings?.provider === 'inherit';

    const effectiveInherited = () => {
        const inherited = props.inheritedSettings;
        if (!inherited || Object.keys(inherited).length === 0) {
            return FALLBACK_DEFAULTS[props.mediaType] || {};
        }
        return inherited;
    };

    const currentSettings = () => {
        if (isInheriting()) {
            return effectiveInherited();
        }
        // Merge settings with fallback to ensure no undefined fields
        return { ...FALLBACK_DEFAULTS[props.mediaType], ...props.settings };
    };

    const sanitizeSettings = (rawSettings) => {
        if (!rawSettings || rawSettings.provider === 'inherit') {
            return { provider: 'inherit' };
        }
        const validKeys = [
            'provider', 'voice_id', 'model_id', 'min_candidates',
            'approval_count_default', 'stability', 'similarity_boost',
            'duration_seconds', 'motion_strength', 'aspect_ratio', 'fps',
            'model', 'style', 'quality', 'size', 'negative_prompt',
            'templates'
        ];
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
            if (isInheriting()) {
                // If we were inheriting, now we copy EVERYTHING from parent and override one key
                Object.assign(newSettings, effectiveInherited());
                newSettings[key] = value;
            }
            props.onSettingsChange(sanitizeSettings(newSettings));
        }
    };

    const handleMultiChange = (changes) => {
        if (props.onSettingsChange) {
            const base = currentSettings();
            const newSettings = { ...base, ...changes };
            if (isInheriting()) {
                Object.assign(newSettings, effectiveInherited());
                Object.assign(newSettings, changes);
            }
            props.onSettingsChange(sanitizeSettings(newSettings));
        }
    };

    const handleModeChange = (mode) => {
        if (mode === 'inherit') {
            props.onSettingsChange({ provider: 'inherit' });
        } else {
            // Switching to custom: copy everything from inherited as a starting point
            props.onSettingsChange(sanitizeSettings({ ...effectiveInherited() }));
        }
    };

    createEffect(() => {
        if (props.mediaType === 'music') {
            const settings = currentSettings();
            const duration = settings.duration_seconds || 30;
            setDurationText(formatSecondsToMmSs(duration));
        }
    });

    const handlePlayPreview = async () => {
        const settings = currentSettings();
        if (!settings.voice_id) return;

        let stability = settings.stability ?? 0.5;
        const similarityBoost = settings.similarity_boost ?? 0.75;
        const modelId = settings.model_id || 'eleven_multilingual_v2';

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
                        sx={{ bgcolor: isInheriting() ? 'action.hover' : 'transparent' }}
                    >
                        <MenuItem value="inherit">Inherit from Parent</MenuItem>
                        <MenuItem value="custom">Custom Overrides</MenuItem>
                    </Select>
                </FormControl>
            </Show>

            <Show when={!isInheriting()}>
                <Stack spacing={2}>
                    <FormControl size="small" fullWidth>
                        <InputLabel>Provider</InputLabel>
                        <Select
                            value={currentSettings().provider || 'elevenlabs'}
                            label="Provider"
                            onChange={(e) => handleChange('provider', e.target.value)}
                        >
                            <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                            <MenuItem value="openai">OpenAI</MenuItem>
                            <MenuItem value="runway">Runway</MenuItem>
                            <MenuItem value="manual">Manual</MenuItem>
                        </Select>
                    </FormControl>

                    {/* Prompt Template - Common for all */}
                    <Box>
                        <Typography variant="caption" sx={{ mb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                            PROMPT TEMPLATE
                        </Typography>
                        <TextInput
                            multiline
                            rows={2}
                            size="small"
                            placeholder="{prompt}"
                            value={currentSettings().templates?.prompt || ''}
                            onValueChange={(val) => {
                                const currentTemplates = currentSettings().templates || {};
                                handleChange('templates', { ...currentTemplates, prompt: val });
                            }}
                            fullWidth
                        />
                    </Box>

                    <Show when={currentSettings().provider === 'elevenlabs'}>
                        <Stack spacing={2}>
                            <Show when={props.mediaType === 'dialogue'}>
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

                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <FormControl size="small" fullWidth>
                                        <InputLabel>Voice</InputLabel>
                                        <Select
                                            value={currentSettings().voice_id || ''}
                                            label="Voice"
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

                                <Box>
                                    <Typography variant="caption" gutterBottom color="text.secondary">
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
                                        <Typography variant="caption" gutterBottom color="text.secondary">
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

                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextInput
                                    size="small"
                                    label="Min Approved"
                                    type="number"
                                    value={String(currentSettings().approval_count_default || 1)}
                                    onValueChange={(val) => handleChange('approval_count_default', parseInt(val) || 1)}
                                    sx={{ width: 140 }}
                                />
                                <TextInput
                                    size="small"
                                    label="Min Candidates"
                                    type="number"
                                    value={String(currentSettings().min_candidates || 1)}
                                    onValueChange={(val) => handleChange('min_candidates', parseInt(val) || 1)}
                                    sx={{ width: 140 }}
                                />
                            </Box>
                        </Stack>
                    </Show>

                    <Show when={props.mediaType === 'video'}>
                        <Box>
                            <Typography variant="caption" gutterBottom color="text.secondary">
                                Motion Strength: {currentSettings().motion_strength ?? 0.5}
                            </Typography>
                            <Slider
                                value={currentSettings().motion_strength ?? 0.5}
                                onChange={(e, value) => handleChange('motion_strength', value)}
                                min={0}
                                max={1}
                                step={0.05}
                                size="small"
                            />
                        </Box>
                    </Show>

                    <Show when={props.mediaType === 'image'}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Model</InputLabel>
                            <Select
                                value={currentSettings().model || 'dall-e-3'}
                                label="Model"
                                onChange={(e) => handleChange('model', e.target.value)}
                            >
                                <MenuItem value="dall-e-3">DALL-E 3</MenuItem>
                                <MenuItem value="dall-e-2">DALL-E 2</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Quality</InputLabel>
                            <Select
                                value={currentSettings().quality || 'standard'}
                                label="Quality"
                                onChange={(e) => handleChange('quality', e.target.value)}
                            >
                                <MenuItem value="standard">Standard</MenuItem>
                                <MenuItem value="hd">HD</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Size</InputLabel>
                            <Select
                                value={currentSettings().size || '1024x1024'}
                                label="Size"
                                onChange={(e) => handleChange('size', e.target.value)}
                            >
                                <MenuItem value="1024x1024">1024x1024</MenuItem>
                                <MenuItem value="1024x1792">1024x1792 (Tall)</MenuItem>
                                <MenuItem value="1792x1024">1792x1024 (Wide)</MenuItem>
                            </Select>
                        </FormControl>
                    </Show>

                    <Show when={props.mediaType === 'text'}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Model</InputLabel>
                            <Select
                                value={currentSettings().model_id || 'gpt-4o'}
                                label="Model"
                                onChange={(e) => handleChange('model_id', e.target.value)}
                            >
                                <MenuItem value="gpt-4o">GPT-4o</MenuItem>
                                <MenuItem value="gpt-4o-mini">GPT-4o mini</MenuItem>
                                <MenuItem value="gpt-4-turbo">GPT-4 Turbo</MenuItem>
                                <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
                            </Select>
                        </FormControl>
                    </Show>

                    <Box sx={{ mt: 1, borderTop: 1, borderColor: 'divider', pt: 2 }}>
                        <Typography variant="caption" sx={{ mb: 1, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                            FILENAME TEMPLATE
                        </Typography>
                        <TextInput
                            size="small"
                            placeholder="{name}_{take_number}"
                            value={currentSettings().templates?.filename || ''}
                            onValueChange={(val) => {
                                const currentTemplates = currentSettings().templates || {};
                                handleChange('templates', { ...currentTemplates, filename: val });
                            }}
                            fullWidth
                        />
                    </Box>
                </Stack>
            </Show>

            <Show when={props.error}>
                <Typography color="error" variant="body2">{props.error}</Typography>
            </Show>
        </Stack>
    );
}
