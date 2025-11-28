import React, { useState, useEffect } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// Local storage keys for LLM settings
const LLM_STORAGE_KEY = 'vofoundry-llm-settings';
// Global storage for ElevenLabs API key (shared across projects)
const ELEVENLABS_KEY_STORAGE = 'vofoundry-elevenlabs-apikey';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

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

export default function SettingsDialog({ 
  open, 
  onClose,
  themeMode,
  onThemeModeChange,
  fontSize,
  onFontSizeChange,
  blankSpaceConversion,
  onBlankSpaceConversionChange,
  capitalizationConversion,
  onCapitalizationConversionChange
}) {
  const [tabValue, setTabValue] = useState(0);
  
  // ElevenLabs settings state
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(() => 
    localStorage.getItem(ELEVENLABS_KEY_STORAGE) || ''
  );
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);
  const [elevenLabsTestStatus, setElevenLabsTestStatus] = useState(null);
  const [elevenLabsTestError, setElevenLabsTestError] = useState('');
  
  // LLM settings state
  const [providers, setProviders] = useState([]);
  const [llmSettings, setLLMSettings] = useState(loadLLMSettings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'testing' | 'success' | 'error'
  const [testError, setTestError] = useState('');
  const [defaultPrompts, setDefaultPrompts] = useState({ generate: '', improve: '' });

  // Load providers on mount
  useEffect(() => {
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
  }, []);

  // Save LLM settings when they change
  useEffect(() => {
    saveLLMSettings(llmSettings);
  }, [llmSettings]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Load saved API key info on mount (do not overwrite localStorage value)
  useEffect(() => {
    fetch('/api/provider/api-key')
      .then(res => res.json())
      .then(data => {
        if (data.hasKey) {
          // A key exists on the server; assume it's valid for now
          setElevenLabsTestStatus('success');
        }
      })
      .catch(err => console.error('Failed to check API key:', err));
  }, []);

  // ElevenLabs handlers
  const handleElevenLabsKeyChange = (value) => {
    setElevenLabsApiKey(value);
    // Persist like the Groq key so the field survives reloads
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
      // Test the key
      const testRes = await fetch('/api/provider/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: elevenLabsApiKey })
      });
      
      const testData = await testRes.json();
      
      if (testRes.ok && testData.success) {
        // Save the key if test passed
        await fetch('/api/provider/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: elevenLabsApiKey })
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
    setTestStatus(null); // Reset test status when settings change
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
          provider: llmSettings.provider,
          apiKey: llmSettings.apiKey
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

  const currentProvider = providers.find(p => p.id === llmSettings.provider);

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: { maxHeight: '90vh' }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>Settings</DialogTitle>
      <DialogContent sx={{ overflowY: 'scroll' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="settings tabs">
            <Tab label="Provider" id="settings-tab-0" aria-controls="settings-tabpanel-0" />
            <Tab label="AI" id="settings-tab-1" aria-controls="settings-tabpanel-1" />
            <Tab label="Theme" id="settings-tab-2" aria-controls="settings-tabpanel-2" />
            <Tab label="Filename" id="settings-tab-3" aria-controls="settings-tabpanel-3" />
          </Tabs>
        </Box>
        
        {/* Provider Tab (index 0) */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Configure your ElevenLabs API key for voice generation.
            </Typography>

            <TextField
              size="small"
              fullWidth
              label="API Key"
              type={showElevenLabsKey ? 'text' : 'password'}
              value={elevenLabsApiKey}
              onChange={(e) => handleElevenLabsKeyChange(e.target.value)}
              placeholder="Enter your ElevenLabs API key"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowElevenLabsKey(!showElevenLabsKey)}
                      edge="end"
                      sx={{ p: 0.5 }}
                    >
                      {showElevenLabsKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
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
                disabled={!elevenLabsApiKey || elevenLabsTestStatus === 'testing'}
              >
                {elevenLabsTestStatus === 'testing' ? (
                  <CircularProgress size={16} sx={{ mr: 1 }} />
                ) : null}
                Test Connection
              </Button>
              
              {elevenLabsTestStatus === 'success' && (
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'success.main' }}>
                  <CheckCircleIcon fontSize="small" sx={{ mr: 0.5 }} />
                  <Typography variant="caption">Connected</Typography>
                </Box>
              )}
              
              {elevenLabsTestStatus === 'error' && (
                <Box sx={{ display: 'flex', alignItems: 'center', color: 'error.main' }}>
                  <ErrorIcon fontSize="small" sx={{ mr: 0.5 }} />
                  <Typography variant="caption">{elevenLabsTestError}</Typography>
                </Box>
              )}
              
              <Button
                size="small"
                variant="text"
                href="https://elevenlabs.io/app/settings/api-keys"
                target="_blank"
                endIcon={<OpenInNewIcon fontSize="small" />}
                sx={{ ml: 'auto' }}
              >
                Get API Key
              </Button>
            </Box>
          </Box>
        </TabPanel>

        {/* AI Tab (index 1) */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Configure AI to help generate and improve voice-over prompts.
            </Typography>

            {/* Provider Selection with Get API Key button */}
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ flexGrow: 1, minWidth: 120, ...DESIGN_SYSTEM.components.formControl }}>
                <InputLabel>Provider</InputLabel>
                <Select
                  value={llmSettings.provider}
                  label="Provider"
                  onChange={(e) => handleLLMSettingChange('provider', e.target.value)}
                >
                  {providers.map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {currentProvider?.signupUrl && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<OpenInNewIcon fontSize="small" />}
                  onClick={() => window.open(currentProvider.signupUrl, '_blank')}
                  sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
                >
                  Get Key
                </Button>
              )}
            </Box>

            {/* API Key - single row with inline eye icon, like Provider tab */}
            <TextField
              size="small"
              fullWidth
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={llmSettings.apiKey}
              onChange={(e) => handleLLMSettingChange('apiKey', e.target.value)}
              placeholder="Enter your API key"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowApiKey(!showApiKey)}
                      edge="end"
                      sx={{ p: 0.5 }}
                    >
                      {showApiKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
              }}
              sx={DESIGN_SYSTEM.components.formControl}
            />

            {/* Model Selection */}
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Model</InputLabel>
              <Select
                value={llmSettings.model}
                label="Model"
                onChange={(e) => handleLLMSettingChange('model', e.target.value)}
              >
                {(currentProvider?.models || []).map(m => (
                  <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Test Connection */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={handleTestConnection}
                disabled={!llmSettings.apiKey || testStatus === 'testing'}
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              {testStatus === 'testing' && <CircularProgress size={20} />}
              {testStatus === 'success' && <CheckCircleIcon color="success" fontSize="small" />}
              {testStatus === 'error' && (
                <>
                  <ErrorIcon color="error" fontSize="small" />
                  <Typography variant="caption" color="error">{testError}</Typography>
                </>
              )}
            </Box>

            {/* Advanced Section */}
            <Accordion sx={{ mt: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Advanced</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {/* Generate System Prompt */}
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        System Prompt (Generate)
                      </Typography>
                      <Button size="small" onClick={() => handleResetSystemPrompt('generate')}>
                        Reset to Default
                      </Button>
                    </Box>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      rows={4}
                      value={llmSettings.systemPrompts?.generate || ''}
                      onChange={(e) => handleSystemPromptChange('generate', e.target.value)}
                      placeholder={defaultPrompts.generate || 'Using default system prompt...'}
                    />
                  </Box>

                  {/* Improve System Prompt */}
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">
                        System Prompt (Improve)
                      </Typography>
                      <Button size="small" onClick={() => handleResetSystemPrompt('improve')}>
                        Reset to Default
                      </Button>
                    </Box>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      rows={4}
                      value={llmSettings.systemPrompts?.improve || ''}
                      onChange={(e) => handleSystemPromptChange('improve', e.target.value)}
                      placeholder={defaultPrompts.improve || 'Using default system prompt...'}
                    />
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          </Box>
        </TabPanel>

        {/* Theme Tab (index 2) */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Theme Mode</InputLabel>
              <Select
                value={themeMode}
                label="Theme Mode"
                onChange={(e) => onThemeModeChange(e.target.value)}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Font Size</InputLabel>
              <Select
                value={fontSize}
                label="Font Size"
                onChange={(e) => onFontSizeChange(e.target.value)}
              >
                <MenuItem value="small">Small</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="large">Large</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </TabPanel>

        {/* Filename Tab (index 3) */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Blank Space Conversion</InputLabel>
              <Select
                value={blankSpaceConversion || 'underscore'}
                label="Blank Space Conversion"
                onChange={(e) => onBlankSpaceConversionChange(e.target.value)}
              >
                <MenuItem value="underscore">Convert blank spaces to underscores (recommended)</MenuItem>
                <MenuItem value="delete">Delete blank spaces from filenames</MenuItem>
                <MenuItem value="keep">Leave blank spaces</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Capitalization Conversion</InputLabel>
              <Select
                value={capitalizationConversion || 'lowercase'}
                label="Capitalization Conversion"
                onChange={(e) => onCapitalizationConversionChange(e.target.value)}
              >
                <MenuItem value="lowercase">Convert to lower case (recommended)</MenuItem>
                <MenuItem value="keep">Leave capitals as is</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
