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

// Cache for voice previews to avoid regenerating the same audio
const voicePreviewCache = new Map();

export default function ProviderSettingsEditor({ 
  contentType,
  settings,
  voices,
  loadingVoices,
  onSettingsChange,
  isDefault = false,
  error 
}) {
  const [playingPreview, setPlayingPreview] = useState(false);

  const handleChange = (key, value) => {
    if (onSettingsChange) {
      onSettingsChange({ ...settings, [key]: value });
    }
  };

  const handlePlayPreview = async () => {
    if (!currentSettings.voice_id) return;
    
    // Create cache key based on voice settings
    const stability = currentSettings.stability || 0.5;
    const similarityBoost = currentSettings.similarity_boost || 0.75;
    const cacheKey = `${currentSettings.voice_id}-${stability}-${similarityBoost}`;
    
    try {
      setPlayingPreview(true);
      
      // Check if we have cached audio for this voice/settings combination
      let audioData = voicePreviewCache.get(cacheKey);
      
      if (!audioData) {
        // Generate new audio and cache it
        console.log('Generating new voice preview for:', currentSettings.voice_id);
        const result = await previewVoice(
          currentSettings.voice_id,
          "The quick brown fox jumps over the lazy dog!",
          stability,
          similarityBoost
        );
        audioData = result.audio;
        voicePreviewCache.set(cacheKey, audioData);
      } else {
        console.log('Using cached voice preview for:', currentSettings.voice_id);
      }
      
      // Create audio element and play the cached or new audio
      const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
      await audio.play();
    } catch (err) {
      console.error('Failed to play voice preview:', err);
    } finally {
      setPlayingPreview(false);
    }
  };

  const currentSettings = settings || {
    provider: 'elevenlabs',
    batch_generate: 1,
    approval_count_default: 1,
    stability: contentType === 'dialogue' ? 0.5 : undefined,
    similarity_boost: contentType === 'dialogue' ? 0.75 : undefined
  };

  return (
    <Stack spacing={isDefault ? "1rem" : "0.5rem"}>
      {/* Provider Selection */}
      <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
        <InputLabel>{isDefault ? 'Default Provider' : 'Provider'}</InputLabel>
        <Select
          value={currentSettings.provider || 'elevenlabs'}
          label={isDefault ? 'Default Provider' : 'Provider'}
          onChange={(e) => handleChange('provider', e.target.value)}
        >
          <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
          <MenuItem value="manual">Manual</MenuItem>
        </Select>
      </FormControl>

      {/* ElevenLabs Settings */}
      {currentSettings.provider === 'elevenlabs' && (
        <>
          {/* Voice selection only for dialogue */}
          {contentType === 'dialogue' && (
            <Box>
              <FormControl size="small" fullWidth sx={{ ...DESIGN_SYSTEM.components.formControl, mb: DESIGN_SYSTEM.spacing.tightGap }}>
                <InputLabel>{isDefault ? 'Default Voice' : 'Voice'}</InputLabel>
                <Select
                  value={
                    // Only use saved voice_id if it exists in the voices array, otherwise use empty string
                    voices.some(v => v.voice_id === currentSettings.voice_id) 
                      ? currentSettings.voice_id 
                      : ''
                  }
                  label={isDefault ? 'Default Voice' : 'Voice'}
                  onChange={(e) => handleChange('voice_id', e.target.value)}
                  disabled={loadingVoices || voices.length === 0}
                >
                  {voices.length === 0 ? (
                    <MenuItem value="" disabled>
                      {loadingVoices ? 'Loading voices...' : 'No voices available (check API key)'}
                    </MenuItem>
                  ) : (
                    voices.map((voice) => (
                      <MenuItem key={voice.voice_id} value={voice.voice_id}>
                        {voice.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
              
              {/* Play Sample button */}
              {currentSettings.voice_id && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={playingPreview ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                  onClick={handlePlayPreview}
                  disabled={playingPreview || !currentSettings.voice_id}
                  sx={DESIGN_SYSTEM.typography.small}
                >
                  {playingPreview ? 'Playing...' : 'Play Sample'}
                </Button>
              )}
            </Box>
          )}

          <TextField
            size="small"
            label={isDefault ? 'Default Batch Generate' : 'Batch Generate'}
            type="number"
            value={currentSettings.batch_generate || 1}
            onChange={(e) => handleChange('batch_generate', parseInt(e.target.value) || 1)}
            inputProps={{ min: 1, max: 10 }}
            sx={{ width: isDefault ? 200 : 120, ...DESIGN_SYSTEM.components.formControl }}
          />

          <TextField
            size="small"
            label={isDefault ? 'Default Approval Count' : 'Approval Count'}
            type="number"
            value={currentSettings.approval_count_default || 1}
            onChange={(e) => handleChange('approval_count_default', parseInt(e.target.value) || 1)}
            inputProps={{ min: 1, max: 5 }}
            sx={{ width: isDefault ? 200 : 120, ...DESIGN_SYSTEM.components.formControl }}
          />

          {/* Dialogue-specific settings */}
          {contentType === 'dialogue' && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Typography variant="body2" sx={{ ...DESIGN_SYSTEM.typography.caption, minWidth: '120px', mb: 0 }}>
                  {isDefault ? 'Default Stability' : 'Stability'}: {currentSettings.stability || 0.5}
                </Typography>
                <Slider
                  value={currentSettings.stability || 0.5}
                  onChange={(e, value) => handleChange('stability', value)}
                  min={0}
                  max={1}
                  step={0.1}
                  size="small"
                  sx={{ flexGrow: 1 }}
                />
              </Box>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Typography variant="body2" sx={{ ...DESIGN_SYSTEM.typography.caption, minWidth: '120px', mb: 0 }}>
                  {isDefault ? 'Default Similarity Boost' : 'Similarity Boost'}: {currentSettings.similarity_boost || 0.75}
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
