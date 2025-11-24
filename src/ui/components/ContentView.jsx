import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import DeleteIcon from '@mui/icons-material/Delete';
import { deleteContent } from '../api/client.js';

export default function ContentView({ 
  item, 
  onContentDeleted,
  error: parentError 
}) {
  const [confirmDeleteContentOpen, setConfirmDeleteContentOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirmDeleteContent = async () => {
    try {
      setDeleting(true);
      setError(null);
      await deleteContent(item.id);
      if (onContentDeleted) onContentDeleted(item.id);
      setConfirmDeleteContentOpen(false);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2, minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" gutterBottom sx={{ flexGrow: 1 }}>
          {item.item_id || item.id}
        </Typography>
        <IconButton
          size="small"
          color="error"
          aria-label="Delete content"
          onClick={() => setConfirmDeleteContentOpen(true)}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      <Typography variant="subtitle2" gutterBottom>
        Type: {item.content_type}
      </Typography>
      <Typography variant="body1" gutterBottom>
        {item.prompt}
      </Typography>
      
      {(error || parentError) && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error || parentError}
        </Typography>
      )}

      {/* TODO: show takes for this content, actions, flags */}

      <Dialog
        open={confirmDeleteContentOpen}
        onClose={() => {
          if (!deleting) setConfirmDeleteContentOpen(false);
        }}
      >
        <DialogTitle>Delete content?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will remove this content item and all of its takes. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteContentOpen(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button color="error" onClick={handleConfirmDeleteContent} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
