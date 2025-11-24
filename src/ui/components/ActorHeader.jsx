import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';

export default function ActorHeader({ 
  actor, 
  onDelete, 
  onUpdateBaseFilename,
  error 
}) {
  const [editingBaseFilename, setEditingBaseFilename] = useState(false);
  const [baseFilename, setBaseFilename] = useState('');

  const handleSaveBaseFilename = () => {
    onUpdateBaseFilename(actor.id, baseFilename || actor.base_filename);
    setEditingBaseFilename(false);
    setBaseFilename('');
  };

  const handleCancelEdit = () => {
    setEditingBaseFilename(false);
    setBaseFilename('');
  };

  const handleStartEdit = () => {
    setEditingBaseFilename(true);
    setBaseFilename(actor.base_filename);
  };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle1" gutterBottom sx={{ flexGrow: 1, fontSize: '1.1rem' }}>
          {actor.display_name}
        </Typography>
        <IconButton
          size="small"
          color="error"
          aria-label="Delete actor"
          onClick={onDelete}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
      
      {/* Editable Base Filename */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {editingBaseFilename ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>Base filename:</Typography>
            <TextField
              size="small"
              value={baseFilename}
              onChange={(e) => setBaseFilename(e.target.value)}
              placeholder={actor.base_filename}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveBaseFilename();
                }
              }}
              sx={{ fontSize: '0.8rem' }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveBaseFilename}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelEdit}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
              Base filename: {actor.base_filename}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleStartEdit}
              sx={{ fontSize: '0.7rem' }}
            >
              Edit
            </Button>
          </Box>
        )}
      </Box>
      
      <Typography variant="body2" gutterBottom sx={{ fontSize: '0.8rem' }}>
        Aliases: {actor.aliases && actor.aliases.length ? actor.aliases.join(', ') : '—'}
      </Typography>

      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </>
  );
}
