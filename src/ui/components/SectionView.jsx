import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Slider from '@mui/material/Slider';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Stack from '@mui/material/Stack';

export default function SectionView({ 
  sectionData,
  actor,
  contentType,
  voices,
  loadingVoices,
  contentPrompt,
  contentItemId,
  creatingContent,
  onContentPromptChange,
  onContentItemIdChange,
  onCreateContent,
  onUpdateSectionName,
  onUpdateProviderSettings,
  error
}) {
  const [editingSectionName, setEditingSectionName] = useState(false);
  const [sectionName, setSectionName] = useState('');
  const [providerSettingsExpanded, setProviderSettingsExpanded] = useState(false);

  const currentSectionName = sectionData?.name || contentType.toUpperCase();
  const providerSettings = actor.provider_settings?.[contentType] || { provider: 'elevenlabs' };

  const handleSaveSectionName = () => {
    onUpdateSectionName(sectionData.id, sectionName || currentSectionName);
    setEditingSectionName(false);
    setSectionName('');
  };

  const handleCancelEditSectionName = () => {
    setEditingSectionName(false);
    setSectionName('');
  };

  const handleStartEditSectionName = () => {
    setEditingSectionName(true);
    setSectionName(currentSectionName);
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      {/* Editable Section Name Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {editingSectionName ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder={currentSectionName}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveSectionName();
                }
              }}
              sx={{ fontSize: '0.9rem' }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveSectionName}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelEditSectionName}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontSize: '1.1rem' }}>
              {currentSectionName}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleStartEditSectionName}
              sx={{ fontSize: '0.8rem' }}
            >
              Edit Name
            </Button>
          </Box>
        )}
      </Box>

      <Typography variant="body2" gutterBottom sx={{ fontSize: '0.85rem' }}>
        Actor: {actor.display_name} • Type: {contentType}
      </Typography>

      {/* Provider Settings */}
      <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Box 
          sx={{ 
            p: 2, 
            cursor: 'pointer', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            '&:hover': { bgcolor: 'action.hover' }
          }}
          onClick={() => setProviderSettingsExpanded(!providerSettingsExpanded)}
        >
          <Typography variant="subtitle2" sx={{ fontSize: '0.9rem' }}>
            Provider Settings
          </Typography>
          {providerSettingsExpanded ? <ExpandLess /> : <ExpandMore />}
        </Box>
        
        <Collapse in={providerSettingsExpanded} timeout="auto" unmountOnExit>
          <Box sx={{ p: 2, pt: 0 }}>
            <Stack spacing={2}>
              {/* Provider Selection */}
              <FormControl size="small" fullWidth>
                <InputLabel>Provider Mode</InputLabel>
                <Select
                  value={providerSettings.provider === 'elevenlabs' || providerSettings.provider === 'manual' ? 'custom' : 'inherit'}
                  label="Provider Mode"
                  onChange={(e) => {
                    if (e.target.value === 'inherit') {
                      onUpdateProviderSettings(actor.id, contentType, { provider: 'inherit' });
                    } else {
                      // Switch to custom - populate with defaults
                      const defaultSettings = {
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
                      onUpdateProviderSettings(actor.id, contentType, defaultSettings[contentType]);
                    }
                  }}
                >
                  <MenuItem value="inherit">Inherit from Defaults</MenuItem>
                  <MenuItem value="custom">Custom Settings</MenuItem>
                </Select>
              </FormControl>

              {/* Custom Settings */}
              {(providerSettings.provider === 'elevenlabs' || providerSettings.provider === 'manual') && (
                <>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Provider</InputLabel>
                    <Select
                      value={providerSettings.provider || 'elevenlabs'}
                      label="Provider"
                      onChange={(e) => onUpdateProviderSettings(actor.id, contentType, { provider: e.target.value })}
                    >
                      <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                      <MenuItem value="manual">Manual</MenuItem>
                    </Select>
                  </FormControl>

                  {providerSettings.provider === 'elevenlabs' && (
                    <>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Voice</InputLabel>
                        <Select
                          value={providerSettings.voice_id || ''}
                          label="Voice"
                          onChange={(e) => onUpdateProviderSettings(actor.id, contentType, { voice_id: e.target.value })}
                          disabled={loadingVoices}
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
                        label="Batch Generate"
                        type="number"
                        value={providerSettings.batch_generate || 1}
                        onChange={(e) => onUpdateProviderSettings(actor.id, contentType, { batch_generate: parseInt(e.target.value) || 1 })}
                        inputProps={{ min: 1, max: 10 }}
                        sx={{ width: 120 }}
                      />

                      {/* Dialogue-specific settings */}
                      {contentType === 'dialogue' && (
                        <>
                          <Box>
                            <Typography variant="body2" gutterBottom>
                              Stability: {providerSettings.stability || 0.5}
                            </Typography>
                            <Slider
                              value={providerSettings.stability || 0.5}
                              onChange={(e, value) => {
                                onUpdateProviderSettings(actor.id, contentType, { stability: value });
                              }}
                              min={0}
                              max={1}
                              step={0.1}
                              size="small"
                            />
                          </Box>
                          
                          <Box>
                            <Typography variant="body2" gutterBottom>
                              Similarity Boost: {providerSettings.similarity_boost || 0.75}
                            </Typography>
                            <Slider
                              value={providerSettings.similarity_boost || 0.75}
                              onChange={(e, value) => {
                                onUpdateProviderSettings(actor.id, contentType, { similarity_boost: value });
                              }}
                              min={0}
                              max={1}
                              step={0.05}
                              size="small"
                            />
                          </Box>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </Stack>
          </Box>
        </Collapse>
      </Box>

      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mt: 3, fontSize: '0.8rem' }}>
        Add and manage {contentType} content for this actor.
      </Typography>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ fontSize: '0.9rem' }}>
          Add New {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Content
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: '0.8rem' }}>
          Use commas to create multiple items at once: "Hi, Yes, No, My name is, Go away, I'm gonna kill you"
        </Typography>
        <TextField
          fullWidth
          size="small"
          label="Item IDs (required)"
          placeholder="Hi, Yes, No, My name is, Go away, I'm gonna kill you"
          value={contentItemId}
          onChange={onContentItemIdChange}
          required
          sx={{ mb: 1 }}
          helperText="Separate multiple items with commas for batch creation"
        />
        <TextField
          fullWidth
          size="small"
          multiline
          rows={3}
          label={`${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Prompt (optional)`}
          placeholder={`${contentType} prompt or description`}
          value={contentPrompt}
          onChange={onContentPromptChange}
          sx={{ mb: 2 }}
        />
        <Button
          variant="contained"
          size="small"
          disabled={!contentItemId.trim() || creatingContent}
          onClick={() => onCreateContent(sectionData.actor_id, sectionData.content_type)}
        >
          {creatingContent ? 'Creating…' : `Add ${contentType.charAt(0).toUpperCase() + contentType.slice(1)} Content`}
        </Button>
      </Box>

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
