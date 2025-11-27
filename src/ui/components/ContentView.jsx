import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CircularProgress from '@mui/material/CircularProgress';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import RefreshIcon from '@mui/icons-material/Refresh';
import { deleteContent, updateContent, getTakes, updateTake } from '../api/client.js';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// Helper to apply blank space conversion setting
function applyBlankSpaceConversion(str, conversion) {
  if (!str) return str;
  switch (conversion) {
    case 'underscore':
      return str.replace(/\s+/g, '_');
    case 'delete':
      return str.replace(/\s+/g, '');
    case 'keep':
    default:
      return str;
  }
}

// Helper to strip trailing underscore
function stripTrailingUnderscore(str) {
  return str ? str.replace(/_+$/, '') : str;
}

// Helper to apply capitalization conversion setting
function applyCapitalizationConversion(str, conversion) {
  if (!str) return str;
  switch (conversion) {
    case 'lowercase':
      return str.toLowerCase();
    case 'keep':
    default:
      return str;
  }
}

export default function ContentView({ 
  item, 
  actor,
  onContentDeleted,
  onContentUpdated,
  sectionComplete,
  blankSpaceConversion = 'underscore',
  capitalizationConversion = 'lowercase',
  error: parentError 
}) {
  // Build the base filename for this content item
  // Strip trailing underscore from actor.base_filename and apply conversions to item_id
  const actorBase = stripTrailingUnderscore(actor?.base_filename || 'unknown');
  const itemIdConverted = applyCapitalizationConversion(
    applyBlankSpaceConversion(item.item_id || 'untitled', blankSpaceConversion),
    capitalizationConversion
  );
  const baseFilename = applyCapitalizationConversion(
    `${actorBase}_${item.content_type}_${itemIdConverted}`,
    capitalizationConversion
  );
  
  const [confirmDeleteContentOpen, setConfirmDeleteContentOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  
  // Editable fields
  const [itemId, setItemId] = useState(item.item_id || '');
  // Default prompt to item_id with first letter capitalized if not set
  const defaultPrompt = item.item_id ? item.item_id.charAt(0).toUpperCase() + item.item_id.slice(1) : '';
  const [prompt, setPrompt] = useState(item.prompt || defaultPrompt);
  // Initialize filename with stored value or auto-generated baseFilename
  const [filename, setFilename] = useState(item.filename || baseFilename);
  const [saving, setSaving] = useState(false);
  
  // Takes
  const [takes, setTakes] = useState([]);
  const [loadingTakes, setLoadingTakes] = useState(false);
  const [playingTakeId, setPlayingTakeId] = useState(null);
  const [audioElement, setAudioElement] = useState(null);

  // Sync local state when item changes
  useEffect(() => {
    setItemId(item.item_id || '');
    // Use stored prompt or default to item_id with first letter capitalized
    const newDefaultPrompt = item.item_id ? item.item_id.charAt(0).toUpperCase() + item.item_id.slice(1) : '';
    setPrompt(item.prompt || newDefaultPrompt);
    // Use stored filename or regenerate from baseFilename with proper formatting
    const newActorBase = stripTrailingUnderscore(actor?.base_filename || 'unknown');
    const newItemIdConverted = applyCapitalizationConversion(
      applyBlankSpaceConversion(item.item_id || 'untitled', blankSpaceConversion),
      capitalizationConversion
    );
    const newBaseFilename = applyCapitalizationConversion(
      `${newActorBase}_${item.content_type}_${newItemIdConverted}`,
      capitalizationConversion
    );
    setFilename(item.filename || newBaseFilename);
  }, [item.item_id, item.prompt, item.filename, item.content_type, actor, blankSpaceConversion, capitalizationConversion]);
  
  // Compute effective filename (custom or auto-generated)
  const effectiveFilename = filename || baseFilename;

  // Load takes for this content
  useEffect(() => {
    let cancelled = false;
    async function loadTakes() {
      try {
        setLoadingTakes(true);
        const result = await getTakes(item.id);
        if (!cancelled) {
          setTakes(result.takes || []);
        }
      } catch (err) {
        console.error('Failed to load takes:', err);
      } finally {
        if (!cancelled) setLoadingTakes(false);
      }
    }
    loadTakes();
    return () => { cancelled = true; };
  }, [item.id]);

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

  const handleSaveField = async (field, value) => {
    if (sectionComplete) return;
    try {
      setSaving(true);
      setError(null);
      const result = await updateContent(item.id, { [field]: value });
      if (result.content && onContentUpdated) {
        onContentUpdated(result.content);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePlayTake = async (take) => {
    // Stop current audio if playing
    if (audioElement) {
      audioElement.pause();
      audioElement.currentTime = 0;
      setAudioElement(null);
    }
    
    if (playingTakeId === take.id) {
      setPlayingTakeId(null);
      return;
    }

    try {
      setPlayingTakeId(take.id);
      // Construct audio URL from take path
      const audio = new Audio(`/media/${take.path}`);
      audio.onended = () => {
        setPlayingTakeId(null);
        setAudioElement(null);
      };
      audio.onerror = () => {
        console.error('Failed to play audio:', take.path);
        setPlayingTakeId(null);
        setAudioElement(null);
      };
      setAudioElement(audio);
      await audio.play();
    } catch (err) {
      console.error('Failed to play take:', err);
      setPlayingTakeId(null);
    }
  };

  const handleTakeStatus = async (takeId, status) => {
    if (sectionComplete) return;
    try {
      const result = await updateTake(takeId, { status });
      if (result.take) {
        setTakes(prev => prev.map(t => t.id === takeId ? result.take : t));
      }
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const isDisabled = sectionComplete;

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: DESIGN_SYSTEM.spacing.containerPadding, minWidth: 0 }}>
      {/* Header with delete button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h6" sx={{ flexGrow: 1, ...DESIGN_SYSTEM.typography.pageTitle }}>
          {item.content_type === 'dialogue' ? 'Dialogue Cue' : item.content_type === 'music' ? 'Music Cue' : 'Sound Effect'}
        </Typography>
        <IconButton
          size="small"
          color="error"
          aria-label="Delete content"
          onClick={() => setConfirmDeleteContentOpen(true)}
          disabled={isDisabled}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Editable Item ID */}
      <TextField
        fullWidth
        size="small"
        label="Item ID"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        onBlur={() => itemId !== item.item_id && handleSaveField('item_id', itemId)}
        disabled={isDisabled || saving}
        sx={{ mb: DESIGN_SYSTEM.spacing.elementGap, ...DESIGN_SYSTEM.components.formControl }}
      />

      {/* Editable Prompt */}
      <TextField
        fullWidth
        size="small"
        multiline
        rows={3}
        label="Prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => prompt !== item.prompt && handleSaveField('prompt', prompt)}
        disabled={isDisabled || saving}
        sx={{ mb: DESIGN_SYSTEM.spacing.elementGap, ...DESIGN_SYSTEM.components.formControl }}
      />

      {/* Editable Filename */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <TextField
          size="small"
          label="Filename"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          onBlur={() => filename !== (item.filename || baseFilename) && handleSaveField('filename', filename)}
          disabled={isDisabled || saving}
          placeholder={baseFilename}
          sx={{ flexGrow: 1, ...DESIGN_SYSTEM.components.formControl }}
          InputProps={{
            sx: { fontFamily: 'monospace', fontSize: '0.8rem' }
          }}
        />
        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          _001
        </Typography>
        <IconButton
          size="small"
          onClick={() => {
            setFilename(baseFilename);
            // Also save to clear any custom filename
            handleSaveField('filename', '');
          }}
          disabled={isDisabled || saving || filename === baseFilename}
          title="Reset to default filename"
          sx={{ p: 0.5 }}
        >
          <RefreshIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Box>
      
      {(error || parentError) && (
        <Typography color="error" variant="body2" sx={{ mt: 1, mb: 1 }}>
          {error || parentError}
        </Typography>
      )}

      {/* Takes List */}
      <Box sx={{ mt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" sx={DESIGN_SYSTEM.typography.sectionTitle}>
            Takes ({takes.length})
          </Typography>
          <Button
            variant="contained"
            size="small"
            disabled={isDisabled}
            sx={{ ...DESIGN_SYSTEM.typography.small }}
          >
            Generate {actor?.provider_settings?.[item.content_type]?.batch_generate || 1} Takes Now!
          </Button>
        </Box>
        
        {loadingTakes ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={16} />
            <Typography variant="body2">Loading takes...</Typography>
          </Box>
        ) : takes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={DESIGN_SYSTEM.typography.body}>
            No takes yet. Generate audio to create takes.
          </Typography>
        ) : (
          <List dense disablePadding>
            {takes.map((take) => (
              <ListItem
                key={take.id}
                sx={{ 
                  py: 0.5, 
                  px: 1,
                  borderRadius: 1,
                  bgcolor: take.status === 'approved' ? 'success.light' : 
                           take.status === 'rejected' ? 'error.light' : 'transparent',
                  opacity: take.status === 'rejected' ? 0.6 : 1,
                  mb: 0.5
                }}
              >
                {/* Play button */}
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <IconButton
                    size="small"
                    onClick={() => handlePlayTake(take)}
                    sx={{ p: 0.5 }}
                  >
                    {playingTakeId === take.id ? (
                      <StopIcon sx={{ fontSize: '1.25rem' }} />
                    ) : (
                      <PlayArrowIcon sx={{ fontSize: '1.25rem' }} />
                    )}
                  </IconButton>
                </ListItemIcon>
                
                {/* Take info */}
                <ListItemText
                  primary={`${effectiveFilename}_${String(take.take_number).padStart(3, '0')}`}
                  secondary={`${take.duration_sec?.toFixed(1) || '?'}s • ${take.status}`}
                  primaryTypographyProps={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
                  secondaryTypographyProps={{ fontSize: '0.7rem' }}
                />
                
                {/* Like/Dislike buttons */}
                <IconButton
                  size="small"
                  onClick={() => handleTakeStatus(take.id, take.status === 'approved' ? 'new' : 'approved')}
                  disabled={isDisabled}
                  sx={{ 
                    p: 0.5,
                    color: take.status === 'approved' ? 'success.main' : 'text.secondary'
                  }}
                >
                  <ThumbUpIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => handleTakeStatus(take.id, take.status === 'rejected' ? 'new' : 'rejected')}
                  disabled={isDisabled}
                  sx={{ 
                    p: 0.5,
                    color: take.status === 'rejected' ? 'error.main' : 'text.secondary'
                  }}
                >
                  <ThumbDownIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

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
