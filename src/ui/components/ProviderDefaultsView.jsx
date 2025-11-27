import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import CircularProgress from '@mui/material/CircularProgress';
import ProviderSettingsEditor from './ProviderSettingsEditor.jsx';
import { useGlobalDefaults } from '../hooks/useGlobalDefaults.js';

export default function ProviderDefaultsView({ 
  contentType,
  voices,
  loadingVoices,
  error 
}) {
  const { defaults, loading, error: defaultsError, updateDefaults } = useGlobalDefaults();
  
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

  const handleSettingsChange = async (newSettings) => {
    try {
      await updateDefaults(contentType, newSettings);
    } catch (err) {
      console.error('Failed to update defaults:', err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const currentDefaults = defaults?.[contentType] || {
    provider: 'elevenlabs',
    batch_generate: 1,
    approval_count_default: 1,
    stability: contentType === 'dialogue' ? 0.5 : undefined,
    similarity_boost: contentType === 'dialogue' ? 0.75 : undefined
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Typography variant="h6" gutterBottom sx={{ fontSize: '1.1rem' }}>
        {getContentTypeTitle(contentType)} Defaults
      </Typography>
      
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        {getContentTypeDescription(contentType)}
      </Typography>

      <Box sx={{ p: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="subtitle2" gutterBottom sx={{ mb: 3 }}>
          {contentType.charAt(0).toUpperCase() + contentType.slice(1)} Default Settings
        </Typography>
        
        <ProviderSettingsEditor
          contentType={contentType}
          settings={currentDefaults}
          voices={voices}
          loadingVoices={loadingVoices}
          onSettingsChange={handleSettingsChange}
          isDefault={true}
          error={error || defaultsError}
        />
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 2 }}>
        Note: Changes to default settings will only affect new actors. Existing actors with custom settings will not be changed.
      </Typography>
    </Box>
  );
}
