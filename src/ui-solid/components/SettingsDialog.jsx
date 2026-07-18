import { createSignal, Show, onMount, createEffect, For } from 'solid-js';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
    Typography, FormControl, InputLabel, Select, MenuItem, ButtonGroup,
    IconButton, InputAdornment, CircularProgress,
    ListItemButton, ListItemText
} from '@suid/material';
import VisibilityIcon from '@suid/icons-material/Visibility';
import VisibilityOffIcon from '@suid/icons-material/VisibilityOff';
import CheckCircleIcon from '@suid/icons-material/CheckCircle';
import ErrorIcon from '@suid/icons-material/Error';
import OpenInNewIcon from '@suid/icons-material/OpenInNew';
import ExpandMoreIcon from '@suid/icons-material/ExpandMore';
import ExpandLessIcon from '@suid/icons-material/ExpandLess';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import Collapse from './Collapse.jsx';
import TextInput from './TextInput.jsx';

const DEFAULT_LLM_SETTINGS = { provider: 'groq', apiKey: '', model: 'llama-3.1-8b-instant', systemPrompts: { generate: '', improve: '' } };
const GENERATION_PROVIDERS = [
    { id: 'elevenlabs', name: 'ElevenLabs', description: 'Voice and audio generation', keyPlaceholder: 'Enter your ElevenLabs API key', modelPlaceholder: 'eleven_multilingual_v2', keyUrl: 'https://elevenlabs.io/app/settings/api-keys' },
    { id: 'openai', name: 'OpenAI', description: 'Image and video generation', keyPlaceholder: 'Enter your OpenAI API key', modelPlaceholder: 'Optional default image or video model', keyUrl: 'https://platform.openai.com/api-keys' },
    { id: 'google', name: 'Google', description: 'Image and video generation', keyPlaceholder: 'Enter your Google AI API key', modelPlaceholder: 'Optional default image or video model', keyUrl: 'https://aistudio.google.com/app/apikey' },
];

function defaultGenerationProviderSettings() {
    return Object.fromEntries(GENERATION_PROVIDERS.map(({ id }) => [id, { api_key: '', enabled: false, model: '' }]));
}

export default function SettingsDialog(props) {
    const [activeTab, setActiveTab] = createSignal('provider');
    const [advancedExpanded, setAdvancedExpanded] = createSignal(false);

    // Generation provider settings state. MOO is local-only, so loaded keys are
    // intentionally retained in the form and can be revealed by the author.
    const [generationProviderSettings, setGenerationProviderSettings] = createSignal(defaultGenerationProviderSettings());
    const [providerKeyVisibility, setProviderKeyVisibility] = createSignal({});
    const [providerSaveStatus, setProviderSaveStatus] = createSignal({});
    const [providerSaveError, setProviderSaveError] = createSignal({});
    const [elevenLabsTestStatus, setElevenLabsTestStatus] = createSignal(null);
    const [elevenLabsTestError, setElevenLabsTestError] = createSignal('');

    // LLM settings state
    const [providers, setProviders] = createSignal([]);
    const [llmSettings, setLLMSettings] = createSignal(DEFAULT_LLM_SETTINGS);
    const [showApiKey, setShowApiKey] = createSignal(false);
    const [testStatus, setTestStatus] = createSignal(null); // null | 'testing' | 'success' | 'error'
    const [testError, setTestError] = createSignal('');
    const [defaultPrompts, setDefaultPrompts] = createSignal({ generate: '', improve: '' });

    // Load providers on mount
    onMount(() => {
        fetch('/api/llm/providers')
            .then(res => res.json())
            .then(data => {
                if (data.providers) {
                    setProviders(data.providers);
                }
            })
            .catch(err => console.error('Failed to load LLM providers:', err));

        fetch('/api/llm/defaults')
            .then(res => res.json())
            .then(data => {
                if (data.systemPrompts) {
                    setDefaultPrompts(data.systemPrompts);
                }
            })
            .catch(err => console.error('Failed to load default prompts:', err));

        fetch('/api/llm/settings')
            .then(res => res.json())
            .then(data => {
                if (data.settings) setLLMSettings({
                    provider: data.settings.provider || 'groq',
                    apiKey: data.settings.api_key || '',
                    model: data.settings.model || 'llama-3.1-8b-instant',
                    systemPrompts: data.settings.system_prompts || { generate: '', improve: '' },
                });
            })
            .catch(err => console.error('Failed to load AI settings:', err));

        fetch('/api/generation/providers/settings')
            .then(res => res.json())
            .then(data => {
                const loaded = data.providers || {};
                setGenerationProviderSettings({
                    ...defaultGenerationProviderSettings(),
                    ...Object.fromEntries(GENERATION_PROVIDERS.map(({ id }) => [id, {
                        ...defaultGenerationProviderSettings()[id],
                        ...(loaded[id] || {}),
                    }])),
                });
                if (loaded.elevenlabs?.api_key) setElevenLabsTestStatus('success');
            })
            .catch(err => console.error('Failed to load generation provider settings:', err));
    });

    const persistLLMSettings = async (settings) => {
        await fetch('/api/llm/settings', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: settings.provider, api_key: settings.apiKey, model: settings.model, system_prompts: settings.systemPrompts }),
        });
    };

    const generationProvider = (providerId) => generationProviderSettings()[providerId] || { api_key: '', enabled: false, model: '' };

    const updateGenerationProvider = (providerId, updates) => {
        setGenerationProviderSettings(current => ({
            ...current,
            [providerId]: { ...generationProvider(providerId), ...updates },
        }));
        setProviderSaveStatus(current => ({ ...current, [providerId]: null }));
        setProviderSaveError(current => ({ ...current, [providerId]: '' }));
        if (providerId === 'elevenlabs') setElevenLabsTestStatus(null);
    };

    const handleSaveGenerationProvider = async (providerId) => {
        const settings = generationProvider(providerId);
        setProviderSaveStatus(current => ({ ...current, [providerId]: 'saving' }));
        setProviderSaveError(current => ({ ...current, [providerId]: '' }));

        try {
            const response = await fetch(`/api/generation/providers/${providerId}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: settings.api_key, enabled: settings.enabled, model: settings.model }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Unable to save settings');
            updateGenerationProvider(providerId, data.settings || settings);
            setProviderSaveStatus(current => ({ ...current, [providerId]: 'success' }));
            return true;
        } catch (err) {
            setProviderSaveStatus(current => ({ ...current, [providerId]: 'error' }));
            setProviderSaveError(current => ({ ...current, [providerId]: err.message || 'Unable to save settings' }));
            return false;
        }
    };

    const handleTestElevenLabs = async () => {
        setElevenLabsTestStatus('testing');
        setElevenLabsTestError('');

        try {
            const testRes = await fetch('/api/provider/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: generationProvider('elevenlabs').api_key })
            });

            const testData = await testRes.json();

            if (testRes.ok && testData.success) {
                if (await handleSaveGenerationProvider('elevenlabs')) {
                    setElevenLabsTestStatus('success');
                } else {
                    setElevenLabsTestStatus('error');
                    setElevenLabsTestError('Connection worked, but MOO could not save the API key');
                }
            } else {
                setElevenLabsTestStatus('error');
                setElevenLabsTestError(testData.error || 'Connection failed');
            }
        } catch (err) {
            setElevenLabsTestStatus('error');
            setElevenLabsTestError(err.message);
        }
    };

    const handleLLMSettingChange = (key, value) => {
        const next = { ...llmSettings(), [key]: value };
        setLLMSettings(next);
        void persistLLMSettings(next);
        setTestStatus(null);
    };

    const handleSystemPromptChange = (type, value) => {
        const next = { ...llmSettings(), systemPrompts: { ...llmSettings().systemPrompts, [type]: value } };
        setLLMSettings(next);
        void persistLLMSettings(next);
    };

    const handleResetSystemPrompt = (type) => {
        handleSystemPromptChange(type, '');
    };

    const handleTestConnection = async () => {
        setTestStatus('testing');
        setTestError('');

        try {
            const res = await fetch('/api/llm/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: llmSettings().provider
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setTestStatus('success');
            } else {
                setTestStatus('error');
                setTestError(data.error || 'Connection failed');
            }
        } catch (err) {
            setTestStatus('error');
            setTestError(err.message);
        }
    };

    const currentProvider = () => providers().find(p => p.id === llmSettings().provider);

    return (
        <Dialog
            open={props.open}
            onClose={props.onClose}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: { maxHeight: '90vh' }
            }}
        >
            <DialogTitle sx={{ pb: 1 }}>Settings</DialogTitle>
            <DialogContent sx={{ overflowY: 'scroll' }}>
                {/* Tab Buttons */}
                <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <ButtonGroup variant="text" fullWidth>
                        <For each={['provider', 'ai', 'theme', 'filename']}>
                            {(tab) => (
                                <Button
                                    onClick={() => setActiveTab(tab)}
                                    sx={{
                                        borderBottom: activeTab() === tab ? 2 : 0,
                                        borderColor: 'primary.main',
                                        borderRadius: 0,
                                        textTransform: 'capitalize'
                                    }}
                                >
                                    {tab}
                                </Button>
                            )}
                        </For>
                    </ButtonGroup>
                </Box>

                {/* Provider Tab */}
                <Show when={activeTab() === 'provider'}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Configure the generation services MOO can use. API keys stay on this local machine.
                        </Typography>

                        <For each={GENERATION_PROVIDERS}>
                            {(provider) => (
                                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                        <Box sx={{ flexGrow: 1 }}>
                                            <Typography variant="subtitle2">{provider.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{provider.description}</Typography>
                                        </Box>
                                        <Button
                                            size="small"
                                            variant={generationProvider(provider.id).enabled ? 'contained' : 'outlined'}
                                            aria-pressed={generationProvider(provider.id).enabled}
                                            onClick={() => updateGenerationProvider(provider.id, { enabled: !generationProvider(provider.id).enabled })}
                                        >
                                            {generationProvider(provider.id).enabled ? 'Enabled' : 'Disabled'}
                                        </Button>
                                    </Box>

                                    <TextInput
                                        size="small"
                                        fullWidth
                                        label={`${provider.name} API Key`}
                                        type={providerKeyVisibility()[provider.id] ? 'text' : 'password'}
                                        value={generationProvider(provider.id).api_key || ''}
                                        onValueChange={(value) => updateGenerationProvider(provider.id, { api_key: value })}
                                        placeholder={provider.keyPlaceholder}
                                        InputProps={{
                                            endAdornment: (
                                                <InputAdornment position="end">
                                                    <IconButton
                                                        size="small"
                                                        aria-label={providerKeyVisibility()[provider.id] ? `Hide ${provider.name} API key` : `Show ${provider.name} API key`}
                                                        onClick={() => setProviderKeyVisibility(current => ({ ...current, [provider.id]: !current[provider.id] }))}
                                                        edge="end"
                                                        sx={{ p: 0.5 }}
                                                    >
                                                        <Show when={providerKeyVisibility()[provider.id]} fallback={<VisibilityIcon fontSize="small" />}>
                                                            <VisibilityOffIcon fontSize="small" />
                                                        </Show>
                                                    </IconButton>
                                                </InputAdornment>
                                            ),
                                            sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
                                        }}
                                        sx={DESIGN_SYSTEM.components.formControl}
                                    />

                                    <TextInput
                                        size="small"
                                        fullWidth
                                        label="Default model (optional)"
                                        value={generationProvider(provider.id).model || ''}
                                        onValueChange={(value) => updateGenerationProvider(provider.id, { model: value })}
                                        placeholder={provider.modelPlaceholder}
                                        sx={DESIGN_SYSTEM.components.formControl}
                                    />

                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            onClick={() => handleSaveGenerationProvider(provider.id)}
                                            disabled={providerSaveStatus()[provider.id] === 'saving'}
                                        >
                                            <Show when={providerSaveStatus()[provider.id] === 'saving'} fallback="Save">
                                                <CircularProgress size={16} sx={{ mr: 1 }} /> Saving
                                            </Show>
                                        </Button>

                                        <Show when={provider.id === 'elevenlabs'}>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={handleTestElevenLabs}
                                                disabled={!generationProvider('elevenlabs').api_key || elevenLabsTestStatus() === 'testing'}
                                            >
                                                <Show when={elevenLabsTestStatus() === 'testing'}>
                                                    <CircularProgress size={16} sx={{ mr: 1 }} />
                                                </Show>
                                                Test Connection
                                            </Button>
                                        </Show>

                                        <Button
                                            size="small"
                                            variant="text"
                                            component="a"
                                            href={provider.keyUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            endIcon={<OpenInNewIcon fontSize="small" />}
                                        >
                                            Get API Key
                                        </Button>

                                        <Show when={providerSaveStatus()[provider.id] === 'success'}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}>
                                                <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="caption">Saved</Typography>
                                            </Box>
                                        </Show>
                                        <Show when={providerSaveStatus()[provider.id] === 'error'}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
                                                <ErrorIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="caption">{providerSaveError()[provider.id]}</Typography>
                                            </Box>
                                        </Show>
                                        <Show when={provider.id === 'elevenlabs' && elevenLabsTestStatus() === 'success'}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}>
                                                <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="caption">Connected</Typography>
                                            </Box>
                                        </Show>
                                        <Show when={provider.id === 'elevenlabs' && elevenLabsTestStatus() === 'error'}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
                                                <ErrorIcon fontSize="small" sx={{ mr: 0.5 }} />
                                                <Typography variant="caption">{elevenLabsTestError()}</Typography>
                                            </Box>
                                        </Show>
                                    </Box>
                                </Box>
                            )}
                        </For>
                    </Box>
                </Show>

                {/* AI Tab */}
                <Show when={activeTab() === 'ai'}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Configure AI to help generate and improve voice-over prompts.
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <FormControl size="small" sx={{ flexGrow: 1, minWidth: 120 }}>
                                <InputLabel>Provider</InputLabel>
                                <Select
                                    value={llmSettings().provider}
                                    label="Provider"
                                    onChange={(e) => handleLLMSettingChange('provider', e.target.value)}
                                >
                                    <For each={providers()}>
                                        {(p) => <MenuItem value={p.id}>{p.name}</MenuItem>}
                                    </For>
                                </Select>
                            </FormControl>
                            <Show when={currentProvider()?.signupUrl}>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<OpenInNewIcon fontSize="small" />}
                                    onClick={() => window.open(currentProvider().signupUrl, '_blank')}
                                    sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                                >
                                    Get Key
                                </Button>
                            </Show>
                        </Box>

                        <TextInput
                            size="small"
                            fullWidth
                            label="API Key"
                            type={showApiKey() ? 'text' : 'password'}
                            value={llmSettings().apiKey}
                            onValueChange={(val) => handleLLMSettingChange('apiKey', val)}
                            placeholder="Enter your API key"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowApiKey(!showApiKey())}
                                            edge="end"
                                            sx={{ p: 0.5 }}
                                        >
                                            <Show when={showApiKey()} fallback={<VisibilityIcon fontSize="small" />}>
                                                <VisibilityOffIcon fontSize="small" />
                                            </Show>
                                        </IconButton>
                                    </InputAdornment>
                                ),
                                sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
                            }}
                        />

                        <FormControl size="small" fullWidth>
                            <InputLabel>Model</InputLabel>
                            <Select
                                value={llmSettings().model}
                                label="Model"
                                onChange={(e) => handleLLMSettingChange('model', e.target.value)}
                            >
                                <For each={currentProvider()?.models || []}>
                                    {(m) => <MenuItem value={m.id}>{m.name}</MenuItem>}
                                </For>
                            </Select>
                        </FormControl>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={handleTestConnection}
                                disabled={!llmSettings().apiKey || testStatus() === 'testing'}
                            >
                                {testStatus() === 'testing' ? 'Testing...' : 'Test Connection'}
                            </Button>
                            <Show when={testStatus() === 'testing'}>
                                <CircularProgress size={20} />
                            </Show>
                            <Show when={testStatus() === 'success'}>
                                <CheckCircleIcon color="success" fontSize="small" />
                            </Show>
                            <Show when={testStatus() === 'error'}>
                                <ErrorIcon color="error" fontSize="small" />
                                <Typography variant="caption" color="error">{testError()}</Typography>
                            </Show>
                        </Box>

                        <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                            <ListItemButton onClick={() => setAdvancedExpanded(!advancedExpanded())} sx={{ py: 0.5 }}>
                                <ListItemText primary={<Typography variant="body2">Advanced Settings</Typography>} />
                                <Show when={advancedExpanded()} fallback={<ExpandMoreIcon sx={{ fontSize: '1rem' }} />}>
                                    <ExpandLessIcon sx={{ fontSize: '1rem' }} />
                                </Show>
                            </ListItemButton>
                            <Collapse in={advancedExpanded()}>
                                <Box sx={{ p: 1.5, pt: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                System Prompt (Generate)
                                            </Typography>
                                            <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0 }} onClick={() => handleResetSystemPrompt('generate')}>
                                                Reset
                                            </Button>
                                        </Box>
                                        <TextInput
                                            size="small"
                                            fullWidth
                                            multiline
                                            rows={4}
                                            value={llmSettings().systemPrompts.generate}
                                            onValueChange={(val) => handleSystemPromptChange('generate', val)}
                                            placeholder={defaultPrompts().generate || 'Using default...'}
                                            sx={DESIGN_SYSTEM.components.formControl}
                                        />
                                    </Box>
                                    <Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary">
                                                System Prompt (Improve)
                                            </Typography>
                                            <Button size="small" variant="text" sx={{ minWidth: 'auto', p: 0 }} onClick={() => handleResetSystemPrompt('improve')}>
                                                Reset
                                            </Button>
                                        </Box>
                                        <TextInput
                                            size="small"
                                            fullWidth
                                            multiline
                                            rows={4}
                                            value={llmSettings().systemPrompts.improve}
                                            onValueChange={(val) => handleSystemPromptChange('improve', val)}
                                            placeholder={defaultPrompts().improve || 'Using default...'}
                                            sx={DESIGN_SYSTEM.components.formControl}
                                        />
                                    </Box>
                                </Box>
                            </Collapse>
                        </Box>
                    </Box>
                </Show>

                {/* Theme Tab */}
                <Show when={activeTab() === 'theme'}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
                            <InputLabel>Theme Mode</InputLabel>
                            <Select
                                value={props.themeMode}
                                label="Theme Mode"
                                onChange={(e) => props.onThemeModeChange(e.target.value)}
                            >
                                <MenuItem value="light">Light</MenuItem>
                                <MenuItem value="dark">Dark</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
                            <InputLabel>Font Size</InputLabel>
                            <Select
                                value={props.fontSize}
                                label="Font Size"
                                onChange={(e) => props.onFontSizeChange(e.target.value)}
                            >
                                <MenuItem value="small">Small</MenuItem>
                                <MenuItem value="medium">Medium</MenuItem>
                                <MenuItem value="large">Large</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </Show>

                {/* Filename Tab */}
                <Show when={activeTab() === 'filename'}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
                            <InputLabel>Blank Space Conversion</InputLabel>
                            <Select
                                value={props.blankSpaceConversion || 'underscore'}
                                label="Blank Space Conversion"
                                onChange={(e) => props.onBlankSpaceConversionChange(e.target.value)}
                            >
                                <MenuItem value="underscore">Convert blank spaces to underscores (recommended)</MenuItem>
                                <MenuItem value="delete">Delete blank spaces from filenames</MenuItem>
                                <MenuItem value="keep">Leave blank spaces</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
                            <InputLabel>Capitalization Conversion</InputLabel>
                            <Select
                                value={props.capitalizationConversion || 'lowercase'}
                                label="Capitalization Conversion"
                                onChange={(e) => props.onCapitalizationConversionChange(e.target.value)}
                            >
                                <MenuItem value="lowercase">Convert to lower case (recommended)</MenuItem>
                                <MenuItem value="keep">Leave capitals as is</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </Show>
            </DialogContent>
            <DialogActions>
                <Button onClick={props.onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}
