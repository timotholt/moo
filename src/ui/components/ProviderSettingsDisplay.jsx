import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

export default function ProviderSettingsDisplay({ actor }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Box sx={{ mt: DESIGN_SYSTEM.spacing.sectionGap, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Box 
        sx={{ 
          p: 1, 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          '&:hover': { bgcolor: 'action.hover' }
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Typography variant="body2" sx={{ fontSize: '1rem', fontWeight: 400 }}>
          Provider Settings
        </Typography>
        {expanded ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
      </Box>
      
      <Collapse in={expanded} timeout="auto" unmountOnExit>
        <Box sx={{ p: 2, pt: 0 }}>
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
                Approved: {actor.provider_settings.dialogue.approval_count_default || 1} • 
                Candidates: {actor.provider_settings.dialogue.min_candidates || 1} • 
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
                <> • Approved: {actor.provider_settings.music.approval_count_default || 1} • 
                Candidates: {actor.provider_settings.music.min_candidates || 1}</>
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
                <> • Approved: {actor.provider_settings.sfx.approval_count_default || 1} • 
                Candidates: {actor.provider_settings.sfx.min_candidates || 1}</>
              )}
            </Typography>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
}
