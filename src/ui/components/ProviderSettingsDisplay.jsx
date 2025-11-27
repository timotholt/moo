import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

export default function ProviderSettingsDisplay({ actor }) {
  return (
    <Box sx={{ mt: DESIGN_SYSTEM.spacing.sectionGap }}>
      <Typography variant="subtitle2" gutterBottom sx={DESIGN_SYSTEM.typography.sectionTitle}>
        Provider Settings
      </Typography>
      
      {/* Dialogue Provider */}
      <Box sx={{ mb: DESIGN_SYSTEM.spacing.elementGap, p: DESIGN_SYSTEM.spacing.elementGap, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" gutterBottom sx={{ ...DESIGN_SYSTEM.typography.body, fontWeight: 500 }}>
          Dialogue
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={DESIGN_SYSTEM.typography.caption}>
          Provider: {actor.provider_settings?.dialogue?.provider || 'manual'}
          {actor.provider_settings?.dialogue?.voice_id && (
            <> • Voice ID: {actor.provider_settings.dialogue.voice_id}</>
          )}
        </Typography>
        {actor.provider_settings?.dialogue?.provider === 'elevenlabs' && (
          <Typography variant="body2" color="text.secondary" sx={DESIGN_SYSTEM.typography.caption}>
            Batch: {actor.provider_settings.dialogue.batch_generate || 1} • 
            Approval: {actor.provider_settings.dialogue.approval_count_default || 1} • 
            Stability: {actor.provider_settings.dialogue.stability || 0.5} • 
            Similarity: {actor.provider_settings.dialogue.similarity_boost || 0.75}
          </Typography>
        )}
      </Box>

      {/* Music Provider */}
      <Box sx={{ mb: DESIGN_SYSTEM.spacing.elementGap, p: DESIGN_SYSTEM.spacing.elementGap, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" gutterBottom sx={{ ...DESIGN_SYSTEM.typography.body, fontWeight: 500 }}>
          Music
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={DESIGN_SYSTEM.typography.caption}>
          Provider: {actor.provider_settings?.music?.provider || 'manual'}
          {actor.provider_settings?.music?.provider === 'elevenlabs' && (
            <> • Batch: {actor.provider_settings.music.batch_generate || 1} • 
            Approval: {actor.provider_settings.music.approval_count_default || 1}</>
          )}
        </Typography>
      </Box>

      {/* SFX Provider */}
      <Box sx={{ mb: DESIGN_SYSTEM.spacing.elementGap, p: DESIGN_SYSTEM.spacing.elementGap, border: 1, borderColor: 'divider', borderRadius: 1 }}>
        <Typography variant="body2" gutterBottom sx={{ ...DESIGN_SYSTEM.typography.body, fontWeight: 500 }}>
          SFX
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={DESIGN_SYSTEM.typography.caption}>
          Provider: {actor.provider_settings?.sfx?.provider || 'manual'}
          {actor.provider_settings?.sfx?.provider === 'elevenlabs' && (
            <> • Batch: {actor.provider_settings.sfx.batch_generate || 1} • 
            Approval: {actor.provider_settings.sfx.approval_count_default || 1}</>
          )}
        </Typography>
      </Box>
    </Box>
  );
}
