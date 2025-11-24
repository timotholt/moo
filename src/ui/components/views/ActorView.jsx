import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import ActorHeader from '../ActorHeader.jsx';
import ProviderSettingsDisplay from '../ProviderSettingsDisplay.jsx';
import SectionManagement from '../SectionManagement.jsx';

export default function ActorView({ 
  actor, 
  sections, 
  actorOps, 
  dataOps, 
  error 
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  if (!actor) {
    return (
      <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
        <Typography color="error">Actor not found.</Typography>
      </Box>
    );
  }

  const handleConfirmDelete = async () => {
    try {
      await actorOps.deleteActor(actor.id);
      setConfirmDeleteOpen(false);
    } catch (err) {
      // Error handled by hook
    }
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <ActorHeader 
        actor={actor}
        onDelete={() => setConfirmDeleteOpen(true)}
        onUpdateBaseFilename={dataOps.updateBaseFilename}
        error={error || actorOps.error}
      />

      <ProviderSettingsDisplay actor={actor} />

      <SectionManagement 
        actor={actor}
        sections={sections}
        onCreateSection={dataOps.createSection}
        creatingContent={dataOps.creatingContent}
      />

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => {
          if (!actorOps.deleting) setConfirmDeleteOpen(false);
        }}
      >
        <DialogTitle>Delete actor?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will remove this actor and all of their content and takes. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={actorOps.deleting}>
            Cancel
          </Button>
          <Button color="error" onClick={handleConfirmDelete} disabled={actorOps.deleting}>
            {actorOps.deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
