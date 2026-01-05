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

// Local storage keys for LLM settings
const LLM_STORAGE_KEY = 'moo-llm-settings';
// Global storage for ElevenLabs API key (shared across projects)
const ELEVENLABS_KEY_STORAGE = 'moo-elevenlabs-apikey';

// Load LLM settings from localStorage
function loadLLMSettings() {
    try {
        const stored = localStorage.getItem(LLM_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load LLM settings:', e);
    }
    return {
        provider: 'groq',
        apiKey: '',
        model: 'llama-3.1-8b-instant',
        systemPrompts: { generate: '', improve: '' }
    };
}

// Save LLM settings to localStorage
function saveLLMSettings(settings) {
    try {
        localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save LLM settings:', e);
    }
}

export default function SettingsDialog(props) {
    const [activeTab, setActiveTab] = createSignal('provider');
    const [advancedExpanded, setAdvancedExpanded] = createSignal(false);

    // ElevenLabs settings state
    const [elevenLabsApiKey, setElevenLabsApiKey] = createSignal(
        localStorage.getItem(ELEVENLABS_KEY_STORAGE) || ''
    );
    const [showElevenLabsKey, setShowElevenLabsKey] = createSignal(false);
    const [elevenLabsTestStatus, setElevenLabsTestStatus] = createSignal(null);
    const [elevenLabsTestError, setElevenLabsTestError] = createSignal('');

    // LLM settings state
    const [providers, setProviders] = createSignal([]);
    const [llmSettings, setLLMSettings] = createSignal(loadLLMSettings());
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

        // Check for existing ElevenLabs key on server
        fetch('/api/provider/api-key')
            .then(res => res.json())
            .then(data => {
                if (data.hasKey) {
                    setElevenLabsTestStatus('success');
                }
            })
            .catch(err => console.error('Failed to check API key:', err));
    });

    // Save LLM settings when they change
    createEffect(() => {
        saveLLMSettings(llmSettings());
    });

    // ElevenLabs handlers
    const handleElevenLabsKeyChange = (value) => {
        setElevenLabsApiKey(value);
        try {
            localStorage.setItem(ELEVENLABS_KEY_STORAGE, value);
        } catch (e) {
            console.error('Failed to save ElevenLabs key to localStorage:', e);
        }
        setElevenLabsTestStatus(null);
    };

    const handleTestElevenLabs = async () => {
        setElevenLabsTestStatus('testing');
        setElevenLabsTestError('');

        try {
            const testRes = await fetch('/api/provider/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: elevenLabsApiKey() })
            });

            const testData = await testRes.json();

            if (testRes.ok && testData.success) {
                await fetch('/api/provider/api-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apiKey: elevenLabsApiKey() })
                });
                setElevenLabsTestStatus('success');
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
        setLLMSettings(prev => ({ ...prev, [key]: value }));
        setTestStatus(null);
    };

    const handleSystemPromptChange = (type, value) => {
        setLLMSettings(prev => ({
            ...prev,
            systemPrompts: { ...prev.systemPrompts, [type]: value }
        }));
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
                    provider: llmSettings().provider,
                    apiKey: llmSettings().apiKey
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
                            Configure your ElevenLabs API key for voice generation.
                        </Typography>

                        <TextInput
                            size="small"
                            fullWidth
                            label="API Key"
                            type={showElevenLabsKey() ? 'text' : 'password'}
                            value={elevenLabsApiKey()}
                            onValueChange={handleElevenLabsKeyChange}
                            placeholder="Enter your ElevenLabs API key"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            onClick={() => setShowElevenLabsKey(!showElevenLabsKey())}
                                            edge="end"
                                            sx={{ p: 0.5 }}
                                        >
                                            <Show when={showElevenLabsKey()} fallback={<VisibilityIcon fontSize="small" />}>
                                                <VisibilityOffIcon fontSize="small" />
                                            </Show>
                                        </IconButton>
                                    </InputAdornment>
                                ),
                                sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
                            }}
                            sx={DESIGN_SYSTEM.components.formControl}
                        />

                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={handleTestElevenLabs}
                                disabled={!elevenLabsApiKey() || elevenLabsTestStatus() === 'testing'}
                            >
                                <Show when={elevenLabsTestStatus() === 'testing'}>
                                    <CircularProgress size={16} sx={{ mr: 1 }} />
                                </Show>
                                Test Connection
                            </Button>

                            <Show when={elevenLabsTestStatus() === 'success'}>
                                <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}>
                                    <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />
                                    <Typography variant="caption">Connected</Typography>
                                </Box>
                            </Show>

                            <Show when={elevenLabsTestStatus() === 'error'}>
                                <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
                                    <ErrorIcon fontSize="small" sx={{ mr: 0.5 }} />
                                    <Typography variant="caption">{elevenLabsTestError()}</Typography>
                                </Box>
                            </Show>

                            <Button
                                size="small"
                                variant="text"
                                component="a"
                                href="https://elevenlabs.io/app/settings/api-keys"
                                target="_blank"
                                endIcon={<OpenInNewIcon fontSize="small" />}
                                sx={{ ml: 'auto' }}
                            >
                                Get API Key
                            </Button>
                        </Box>
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
