import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DESIGN_SYSTEM } from '../../theme/designSystem.js';

export default function DefaultsView() {
  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: DESIGN_SYSTEM.spacing.containerPadding, minWidth: 0 }}>
      <Typography variant="h6" gutterBottom sx={DESIGN_SYSTEM.typography.pageTitle}>
        Provider Defaults
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={DESIGN_SYSTEM.typography.body}>
        Configure default settings for all content types. Individual actors can inherit these settings or override with custom values.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: DESIGN_SYSTEM.spacing.elementGap, ...DESIGN_SYSTEM.typography.body }}>
        Select a specific content type (Dialogue, Music, or SFX) from the tree to configure its default settings.
      </Typography>
    </Box>
  );
}
