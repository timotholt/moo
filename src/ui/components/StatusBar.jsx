import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export default function StatusBar({ statusText, providerCredits }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0, // At the very bottom
        left: 0,
        right: 0,
        height: '1.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: '0.75rem',
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        fontSize: '0.75rem',
        zIndex: (theme) => theme.zIndex.appBar - 1,
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontSize: '0.7rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {statusText || ''}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontSize: '0.7rem', color: 'text.secondary', whiteSpace: 'nowrap' }}
      >
        {providerCredits}
      </Typography>
    </Box>
  );
}
