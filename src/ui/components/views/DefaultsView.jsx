import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function DefaultsView() {
  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Typography variant="h6" gutterBottom>
        Provider Defaults
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Configure default settings for all content types. Individual actors can inherit these settings or override with custom values.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Select a specific content type (Dialogue, Music, or SFX) from the tree to configure its default settings.
      </Typography>
    </Box>
  );
}
