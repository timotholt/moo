import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';

export default function ProviderDefaultsView({ 
  contentType,
  voices,
  loadingVoices,
  error 
}) {
  // This would typically load and manage default provider settings
  // For now, it's a placeholder showing the structure
  
  const getContentTypeTitle = (type) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getContentTypeDescription = (type) => {
    switch (type) {
      case 'dialogue':
        return 'Default settings for all dialogue content. Actors can inherit these settings or override with custom values.';
      case 'music':
        return 'Default settings for all music content. Actors can inherit these settings or override with custom values.';
      case 'sfx':
        return 'Default settings for all sound effects content. Actors can inherit these settings or override with custom values.';
      default:
        return 'Default provider settings for this content type.';
    }
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Typography variant="h6" gutterBottom sx={{ fontSize: '1.1rem' }}>
        {getContentTypeTitle(contentType)} Defaults
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        {getContentTypeDescription(contentType)}
      </Typography>

      <Stack spacing={3}>
        {/* Provider Selection */}
        <FormControl size="small" fullWidth>
          <InputLabel>Default Provider</InputLabel>
          <Select
            value="elevenlabs"
            label="Default Provider"
            // onChange would update global defaults
          >
            <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
            <MenuItem value="manual">Manual</MenuItem>
          </Select>
        </FormControl>

        {/* ElevenLabs Settings */}
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            ElevenLabs Settings
          </Typography>
          
          <Stack spacing={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Default Voice</InputLabel>
              <Select
                value=""
                label="Default Voice"
                disabled={loadingVoices}
                // onChange would update default voice
              >
                {voices.map((voice) => (
                  <MenuItem key={voice.voice_id} value={voice.voice_id}>
                    {voice.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              size="small"
              label="Default Batch Generate"
              type="number"
              defaultValue={1}
              inputProps={{ min: 1, max: 10 }}
              sx={{ width: 200 }}
            />

            <TextField
              size="small"
              label="Default Approval Count"
              type="number"
              defaultValue={1}
              inputProps={{ min: 1, max: 5 }}
              sx={{ width: 200 }}
            />

            {/* Dialogue-specific defaults */}
            {contentType === 'dialogue' && (
              <>
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Default Stability: 0.5
                  </Typography>
                  <Slider
                    defaultValue={0.5}
                    min={0}
                    max={1}
                    step={0.1}
                    size="small"
                    // onChange would update default stability
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" gutterBottom>
                    Default Similarity Boost: 0.75
                  </Typography>
                  <Slider
                    defaultValue={0.75}
                    min={0}
                    max={1}
                    step={0.05}
                    size="small"
                    // onChange would update default similarity boost
                  />
                </Box>
              </>
            )}
          </Stack>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          Note: Changes to default settings will only affect new actors. Existing actors with custom settings will not be changed.
        </Typography>
      </Stack>

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
