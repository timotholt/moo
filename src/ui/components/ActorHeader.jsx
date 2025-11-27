import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

export default function ActorHeader({ 
  actor, 
  onDelete, 
  onUpdateBaseFilename,
  onUpdateDisplayName,
  error 
}) {
  const [editingBaseFilename, setEditingBaseFilename] = useState(false);
  const [baseFilename, setBaseFilename] = useState('');
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState('');

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

  const handleSaveDisplayName = () => {
    if (onUpdateDisplayName) {
      onUpdateDisplayName(actor.id, displayName || actor.display_name);
    }
    setEditingDisplayName(false);
    setDisplayName('');
  };

  const handleCancelDisplayNameEdit = () => {
    setEditingDisplayName(false);
    setDisplayName('');
  };

  const handleStartDisplayNameEdit = () => {
    setEditingDisplayName(true);
    setDisplayName(actor.display_name);
  };

  // Compact button style
  const compactButtonSx = { py: 0, px: 0.5, minHeight: 0, fontSize: '0.7rem' };

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {editingDisplayName ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <TextField
              size="small"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={actor.display_name}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveDisplayName();
                }
              }}
              sx={DESIGN_SYSTEM.components.formControl}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveDisplayName}
              sx={compactButtonSx}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelDisplayNameEdit}
              sx={compactButtonSx}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <>
            <Typography variant="subtitle1" sx={{ ...DESIGN_SYSTEM.typography.pageTitle }}>
              {actor.display_name}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleStartDisplayNameEdit}
              sx={compactButtonSx}
            >
              Edit
            </Button>
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
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
            <Typography variant="body2" sx={DESIGN_SYSTEM.typography.body}>Base filename:</Typography>
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
              sx={DESIGN_SYSTEM.components.formControl}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveBaseFilename}
              sx={compactButtonSx}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={handleCancelEdit}
              sx={compactButtonSx}
            >
              Cancel
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={DESIGN_SYSTEM.typography.body}>
              Base filename: {actor.base_filename}
            </Typography>
            <Button
              size="small"
              variant="text"
              onClick={handleStartEdit}
              sx={compactButtonSx}
            >
              Edit
            </Button>
          </Box>
        )}
      </Box>
      
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
    </>
  );
}
