import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CircularProgress from '@mui/material/CircularProgress';
import { previewVoice } from '../api/client.js';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// Default settings by content type
const DEFAULT_SETTINGS = {
  dialogue: {
    provider: 'elevenlabs',
    batch_generate: 1,
    approval_count_default: 1,
    stability: 0.5,
    similarity_boost: 0.75,
  },
  music: {
    provider: 'elevenlabs',
    batch_generate: 1,
    approval_count_default: 1,
  },
  sfx: {
    provider: 'elevenlabs',
    batch_generate: 1,
    approval_count_default: 1,
  }
};

export default function ProviderSettingsEditor({ 
  contentType,
  settings,
  voices,
  loadingVoices,
  onSettingsChange,
  allowInherit = false,
  error 
}) {
  const [playingPreview, setPlayingPreview] = useState(false);

  // Only include valid provider_settings properties to avoid schema validation errors
  const sanitizeSettings = (rawSettings) => {
    if (!rawSettings || rawSettings.provider === 'inherit') {
      return { provider: 'inherit' };
    }
    const validKeys = ['provider', 'voice_id', 'model_id', 'batch_generate', 'approval_count_default', 'stability', 'similarity_boost'];
    const sanitized = {};
    for (const key of validKeys) {
      if (rawSettings[key] !== undefined) {
        sanitized[key] = rawSettings[key];
      }
    }
    return sanitized;
  };

  // Use currentSettings as base to ensure we're working with actual values, not undefined
  const getBaseSettings = () => {
    const isInheriting = settings?.provider === 'inherit';
    return isInheriting ? DEFAULT_SETTINGS[contentType] : (settings || DEFAULT_SETTINGS[contentType]);
  };

  const handleChange = (key, value) => {
    if (onSettingsChange) {
      const base = getBaseSettings();
      const newSettings = { ...base, [key]: value };
      console.log('[ProviderSettingsEditor] handleChange:', key, value, 'new settings:', newSettings);
      onSettingsChange(sanitizeSettings(newSettings));
    }
  };

  // Handle multiple changes at once to avoid stale state issues
  const handleMultiChange = (changes) => {
    if (onSettingsChange) {
      const base = getBaseSettings();
      const newSettings = { ...base, ...changes };
      console.log('[ProviderSettingsEditor] handleMultiChange:', changes, 'new settings:', newSettings);
      onSettingsChange(sanitizeSettings(newSettings));
    }
  };

  const handlePlayPreview = async () => {
    if (!currentSettings.voice_id) return;
    
    let stability = currentSettings.stability || 0.5;
    const similarityBoost = currentSettings.similarity_boost || 0.75;
    const modelId = currentSettings.model_id || 'eleven_multilingual_v2';
    
    // v3 only accepts specific stability values: 0.0, 0.5, 1.0
    if (modelId === 'eleven_v3') {
      // Snap to nearest valid value
      if (stability < 0.25) stability = 0.0;
      else if (stability < 0.75) stability = 0.5;
      else stability = 1.0;
    }
    
    try {
      setPlayingPreview(true);
      
      // Always generate fresh preview (no cache - settings may have changed)
      console.log('Generating voice preview for:', currentSettings.voice_id, 'model:', modelId, 'stability:', stability);
      const result = await previewVoice(
        currentSettings.voice_id,
        "The quick brown fox jumps over the lazy dog!",
        stability,
        similarityBoost,
        modelId
      );
      
      // Play the audio
      const audio = new Audio(`data:audio/mp3;base64,${result.audio}`);
      await audio.play();
    } catch (err) {
      console.error('Failed to play voice preview:', err);
    } finally {
      setPlayingPreview(false);
    }
  };

  const isInheriting = settings?.provider === 'inherit';
  const currentSettings = isInheriting ? DEFAULT_SETTINGS[contentType] : (settings || DEFAULT_SETTINGS[contentType]);

  const handleModeChange = (mode) => {
    console.log('[ProviderSettingsEditor] handleModeChange:', mode, 'current settings:', settings);
    if (mode === 'inherit') {
      console.log('[ProviderSettingsEditor] Switching to inherit mode');
      onSettingsChange({ provider: 'inherit' });
    } else {
      console.log('[ProviderSettingsEditor] Switching to custom mode with defaults:', DEFAULT_SETTINGS[contentType]);
      onSettingsChange(DEFAULT_SETTINGS[contentType]);
    }
  };

  return (
    <Stack spacing="0.75rem">
      {/* Inherit/Custom Mode - only shown when allowInherit is true */}
      {allowInherit && (
        <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
          <InputLabel>Provider Mode</InputLabel>
          <Select
            value={isInheriting ? 'inherit' : 'custom'}
            label="Provider Mode"
            onChange={(e) => handleModeChange(e.target.value)}
          >
            <MenuItem value="inherit">Inherit from Defaults</MenuItem>
            <MenuItem value="custom">Custom Settings</MenuItem>
          </Select>
        </FormControl>
      )}

      {/* Only show settings when not inheriting (or when inherit mode is disabled) */}
      {!isInheriting && (
        <>
          {/* Provider Selection */}
          <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
            <InputLabel>Provider</InputLabel>
            <Select
              value={currentSettings.provider || 'elevenlabs'}
              label="Provider"
              onChange={(e) => handleChange('provider', e.target.value)}
            >
              <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
              <MenuItem value="manual">Manual</MenuItem>
            </Select>
          </FormControl>

          {/* ElevenLabs Settings */}
          {currentSettings.provider === 'elevenlabs' && (
            <>
              {/* Model selection for dialogue */}
              {contentType === 'dialogue' && (
                <FormControl size="small" sx={DESIGN_SYSTEM.components.formControl}>
                  <InputLabel>Model</InputLabel>
                  <Select
                    value={currentSettings.model_id || 'eleven_multilingual_v2'}
                    label="Model"
                    onChange={(e) => {
                      console.log('[ProviderSettingsEditor] Model onChange fired:', e.target.value);
                      handleChange('model_id', e.target.value);
                    }}
                  >
                    <MenuItem value="eleven_v3">Eleven v3 (alpha) - Audio tags [angry], [whispers]</MenuItem>
                    <MenuItem value="eleven_multilingual_v2">Eleven Multilingual v2 - Best quality</MenuItem>
                    <MenuItem value="eleven_turbo_v2_5">Eleven Turbo v2.5 - Fast, multilingual</MenuItem>
                    <MenuItem value="eleven_flash_v2_5">Eleven Flash v2.5 - Ultra fast</MenuItem>
                  </Select>
                </FormControl>
              )}

              {/* Voice selection only for dialogue - Voice and Play Sample on same line */}
              {contentType === 'dialogue' && (() => {
                const selectedModel = currentSettings.model_id || 'eleven_multilingual_v2';
                // Filter voices that support the selected model
                const compatibleVoices = voices.filter(voice => {
                  const modelIds = voice.high_quality_base_model_ids || [];
                  return modelIds.some(id => id.includes(selectedModel) || selectedModel.includes(id));
                });
                // Only use saved voice_id if it exists in the compatible voices list
                const currentVoiceId = compatibleVoices.some(v => v.voice_id === currentSettings.voice_id)
                  ? currentSettings.voice_id
                  : '';
                
                return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <FormControl size="small" sx={{ ...DESIGN_SYSTEM.components.formControl, flexGrow: 1 }}>
                    <InputLabel>Voice</InputLabel>
                    <Select
                      value={currentVoiceId}
                      label="Voice"
                      onChange={(e) => handleChange('voice_id', e.target.value)}
                      disabled={loadingVoices || voices.length === 0}
                    >
                      {voices.length === 0 ? (
                        <MenuItem value="" disabled>
                          {loadingVoices ? 'Loading voices...' : 'No voices available (check API key)'}
                        </MenuItem>
                      ) : compatibleVoices.length === 0 ? (
                        <MenuItem value="" disabled>
                          No voices available for this model
                        </MenuItem>
                      ) : (
                        compatibleVoices.map((voice) => (
                          <MenuItem key={voice.voice_id} value={voice.voice_id}>
                            {voice.name}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                  </FormControl>
                  
                  {/* Play Sample button */}
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={playingPreview ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                    onClick={handlePlayPreview}
                    disabled={playingPreview || !currentSettings.voice_id}
                    sx={{ ...DESIGN_SYSTEM.typography.small, whiteSpace: 'nowrap' }}
                  >
                    {playingPreview ? 'Playing...' : 'Play Sample'}
                  </Button>
                </Box>
                );
              })()}

              {/* Batch Generate and Approval Count on same line */}
              <Box sx={{ display: 'flex', gap: '1rem' }}>
                <TextField
                  size="small"
                  label="Batch Generate"
                  type="number"
                  value={currentSettings.batch_generate || 1}
                  onChange={(e) => handleChange('batch_generate', parseInt(e.target.value) || 1)}
                  inputProps={{ min: 1, max: 10 }}
                  sx={{ width: 140, ...DESIGN_SYSTEM.components.formControl }}
                />

                <TextField
                  size="small"
                  label="Approval Count"
                  type="number"
                  value={currentSettings.approval_count_default || 1}
                  onChange={(e) => handleChange('approval_count_default', parseInt(e.target.value) || 1)}
                  inputProps={{ min: 1, max: 5 }}
                  sx={{ width: 140, ...DESIGN_SYSTEM.components.formControl }}
                />
              </Box>

              {/* Dialogue-specific settings */}
              {contentType === 'dialogue' && (() => {
                const isV3 = currentSettings.model_id === 'eleven_v3';
                // v3 only supports 0.0 (Creative), 0.5 (Natural), 1.0 (Robust)
                const v3StabilityMarks = [
                  { value: 0, label: 'Creative' },
                  { value: 0.5, label: 'Natural' },
                  { value: 1, label: 'Robust' },
                ];
                const stabilityValue = currentSettings.stability ?? 0.5;
                const stabilityLabel = isV3 
                  ? (stabilityValue === 0 ? 'Creative' : stabilityValue === 1 ? 'Robust' : 'Natural')
                  : stabilityValue;
                
                return (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Typography variant="body2" sx={{ ...DESIGN_SYSTEM.typography.caption, minWidth: '120px', mb: 0 }}>
                      Stability: {stabilityLabel}
                    </Typography>
                    <Slider
                      value={stabilityValue}
                      onChange={(e, value) => handleChange('stability', value)}
                      min={0}
                      max={1}
                      step={isV3 ? 0.5 : 0.1}
                      marks={isV3 ? v3StabilityMarks : false}
                      size="small"
                      sx={{ flexGrow: 1 }}
                    />
                  </Box>
                  
                  {/* Similarity boost - only for v2 models */}
                  {!isV3 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <Typography variant="body2" sx={{ ...DESIGN_SYSTEM.typography.caption, minWidth: '120px', mb: 0 }}>
                        Similarity Boost: {currentSettings.similarity_boost || 0.75}
                      </Typography>
                      <Slider
                        value={currentSettings.similarity_boost || 0.75}
                        onChange={(e, value) => handleChange('similarity_boost', value)}
                        min={0}
                        max={1}
                        step={0.05}
                        size="small"
                        sx={{ flexGrow: 1 }}
                      />
                    </Box>
                  )}
                </>
                );
              })()}
            </>
          )}
        </>
      )}

      {error && (
        <Typography color="error" variant="body2">
          {error}
        </Typography>
      )}
    </Stack>
  );
}
