import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';

export default function RootView({ actorOps, error }) {
  const [actorName, setActorName] = useState('');

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Typography variant="h6" gutterBottom>
        Actors
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Manage voice actors and their content.
      </Typography>

      <Box sx={{ mt: 3 }}>
        <Typography variant="subtitle2" gutterBottom>
          Add New Actor
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Actor name"
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="contained"
            size="small"
            disabled={!actorName.trim() || actorOps.creating}
            onClick={() => actorOps.createActor({ display_name: actorName || 'New Actor' }).then(() => setActorName(''))}
          >
            {actorOps.creating ? 'Creating…' : 'Add Simple Actor'}
          </Button>
        </Stack>
      </Box>

      {(error || actorOps.error) && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error || actorOps.error}
        </Typography>
      )}
    </Box>
  );
}
