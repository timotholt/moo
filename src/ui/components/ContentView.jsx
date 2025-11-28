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
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import RefreshIcon from '@mui/icons-material/Refresh';
import { deleteContent, updateContent, getTakes, updateTake, generateTakes, deleteTake } from '../api/client.js';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

// Helper to format date as "11/27 @ 3:22pm"
function formatStatusDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${month}/${day} @ ${hours}:${minutes}${ampm}`;
}

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
  onTakesGenerated,
  onTakeUpdated,
  onStatusChange,
  playingContentId,
  playingTakeId,
  onPlayRequest,
  onStopRequest,
  playedTakes = {},
  onTakePlayed,
  onCreditsRefresh,
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
  const [generatingTakes, setGeneratingTakes] = useState(false);
  const [expandedTakes, setExpandedTakes] = useState({});

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
    const effective = item.filename || newBaseFilename;
    setFilename(effective);

    // If the server doesn't have a filename yet, persist the UI-computed one
    // so the backend and UI always agree on naming.
    if (!item.filename && !sectionComplete) {
      // This will call updateContent('filename', effective)
      handleSaveField('filename', effective);
    }
  }, [item.id, item.item_id, item.prompt, item.filename, item.content_type, actor, blankSpaceConversion, capitalizationConversion, sectionComplete]);
  
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
      if (onStatusChange) onStatusChange('Processing');
      await deleteContent(item.id);
      if (onContentDeleted) onContentDeleted(item.id);
      setConfirmDeleteContentOpen(false);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDeleting(false);
      if (onStatusChange) onStatusChange('');
    }
  };

  const handleSaveField = async (field, value) => {
    if (sectionComplete) return;
    try {
      setSaving(true);
      setError(null);
      if (onStatusChange) onStatusChange('Processing');
      const result = await updateContent(item.id, { [field]: value });
      if (result.content && onContentUpdated) {
        onContentUpdated(result.content);
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
      if (onStatusChange) onStatusChange('');
    }
  };

  const handlePlayTake = (take) => {
    // Mark as played so (new) tag goes away everywhere
    if (onTakePlayed) {
      onTakePlayed(take.id);
    }

    const isCurrentlyPlaying = playingContentId === item.id && playingTakeId === take.id;

    if (isCurrentlyPlaying) {
      if (onStopRequest) onStopRequest();
    } else if (onPlayRequest) {
      onPlayRequest(item.id, take);
    }
  };

  const handleTakeStatus = async (takeId, status) => {
    if (sectionComplete) return;
    try {
      if (onStatusChange) onStatusChange('Processing');
      const result = await updateTake(takeId, { status });
      if (result.take) {
        setTakes(prev => prev.map(t => t.id === takeId ? result.take : t));
        // Notify parent to update tree view
        if (onTakeUpdated) {
          onTakeUpdated(result.take);
        }
        // If content's all_approved status changed, notify parent
        if (result.content && onContentUpdated) {
          onContentUpdated(result.content);
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      if (onStatusChange) onStatusChange('');
    }
  };

  const handleGenerateTakes = async () => {
    if (sectionComplete || generatingTakes) return;
    const count = actor?.provider_settings?.[item.content_type]?.batch_generate || 1;
    try {
      setGeneratingTakes(true);
      setError(null);
      if (onStatusChange) onStatusChange(`Generating take 1 of ${count}`);
      const result = await generateTakes(item.id, count);
      if (result.takes && result.takes.length > 0) {
        setTakes(prev => [...prev, ...result.takes]);
        // Notify parent to update tree view
        if (onTakesGenerated) {
          onTakesGenerated(result.takes);
        }
      }
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setGeneratingTakes(false);
      if (onStatusChange) onStatusChange('');
      // Refresh credits after generation
      if (onCreditsRefresh) onCreditsRefresh();
    }
  };

  const handleDeleteTake = async (takeId) => {
    if (sectionComplete) return;
    try {
      if (onStatusChange) onStatusChange('Processing');
      await deleteTake(takeId);
      setTakes(prev => prev.filter(t => t.id !== takeId));
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      if (onStatusChange) onStatusChange('');
    }
  };

  const isDisabled = sectionComplete;
  
  // Compute approval progress
  const approvedCount = takes.filter(t => t.status === 'approved').length;
  const requiredApprovals = actor?.provider_settings?.[item.content_type]?.approval_count_default || 1;

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
            // Also save so the server uses this exact base filename
            handleSaveField('filename', baseFilename);
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Box>
            <Typography variant="subtitle2" sx={DESIGN_SYSTEM.typography.sectionTitle}>
              Takes ({takes.length})
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', display: 'block' }}>
              {approvedCount} of {requiredApprovals} approved takes to be complete
            </Typography>
          </Box>
          <Tooltip 
            title={approvedCount === 0 && !item.all_approved ? "At least one take must be approved before marking complete" : ""}
            arrow
          >
            <span>
              <Button
                variant={item.all_approved ? 'outlined' : 'contained'}
                size="small"
                color={item.all_approved ? 'success' : 'primary'}
                disabled={saving || (approvedCount === 0 && !item.all_approved)}
                onClick={async () => {
                  // Bypass sectionComplete check for toggling all_approved
                  try {
                    setSaving(true);
                    setError(null);
                    const result = await updateContent(item.id, { all_approved: !item.all_approved });
                    if (result.content && onContentUpdated) {
                      onContentUpdated(result.content);
                    }
                  } catch (err) {
                    setError(err.message || String(err));
                  } finally {
                    setSaving(false);
                  }
                }}
                sx={{ ...DESIGN_SYSTEM.typography.small }}
              >
                {item.all_approved ? 'Completed ✓' : 'Mark As Completed'}
              </Button>
            </span>
          </Tooltip>
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
              <Box key={take.id} sx={{ mb: 0.5 }}>
                <ListItem
                  sx={{ 
                    py: 0.25, 
                    px: 0.5,
                    borderRadius: 1,
                    bgcolor: take.status === 'approved' ? 'success.dark' : 
                             take.status === 'rejected' ? 'error.light' : 'action.hover',
                    opacity: take.status === 'rejected' ? 0.6 : 1,
                  }}
                >
                  {/* Play button */}
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <IconButton
                      size="small"
                      onClick={() => handlePlayTake(take)}
                      sx={{ p: 0.25 }}
                    >
                      {playingTakeId === take.id ? (
                        <StopIcon sx={{ fontSize: '1rem' }} />
                      ) : (
                        <PlayArrowIcon sx={{ fontSize: '1rem' }} />
                      )}
                    </IconButton>
                  </ListItemIcon>
                  
                  {/* Take info - clicking anywhere here also plays the take */}
                  <Box
                    sx={{ flexGrow: 1, cursor: 'pointer' }}
                    onClick={() => handlePlayTake(take)}
                  >
                    <ListItemText
                      primary={`${take.filename || `${effectiveFilename}_${String(take.take_number).padStart(3, '0')}`}${take.status === 'new' && !playedTakes[take.id] ? ' (new)' : ''}`}
                      secondary={
                        take.status === 'approved' && take.status_changed_at
                          ? `${take.duration_sec?.toFixed(1) || '?'}s • approved ${formatStatusDate(take.status_changed_at)}`
                          : take.status === 'rejected' && take.status_changed_at
                          ? `${take.duration_sec?.toFixed(1) || '?'}s • rejected ${formatStatusDate(take.status_changed_at)}`
                          : `${take.duration_sec?.toFixed(1) || '?'}s • generated ${formatStatusDate(take.created_at)}`
                      }
                      primaryTypographyProps={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'common.white' }}
                      secondaryTypographyProps={{ fontSize: '0.65rem' }}
                      sx={{ my: 0 }}
                    />
                  </Box>
                  
                  {/* Like/Dislike buttons - bright white when selected, gray when not */}
                  <IconButton
                    size="small"
                    onClick={() => handleTakeStatus(take.id, take.status === 'approved' ? 'new' : 'approved')}
                    disabled={isDisabled}
                    sx={{ 
                      p: 0.25,
                      color: take.status === 'approved' ? 'common.white' : 'text.disabled',
                      '&.Mui-disabled': {
                        color: take.status === 'approved' ? 'common.white' : 'text.disabled'
                      }
                    }}
                  >
                    <ThumbUpIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => handleTakeStatus(take.id, take.status === 'rejected' ? 'new' : 'rejected')}
                    disabled={isDisabled}
                    sx={{ 
                      p: 0.25,
                      color: take.status === 'rejected' ? 'common.white' : 'text.disabled',
                      '&.Mui-disabled': {
                        color: take.status === 'rejected' ? 'common.white' : 'text.disabled'
                      }
                    }}
                  >
                    <ThumbDownIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                  
                  {/* Delete button */}
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteTake(take.id)}
                    disabled={isDisabled}
                    sx={{ 
                      p: 0.25,
                      ml: '0.5rem',
                      color: 'text.disabled',
                      '&:hover': {
                        color: 'error.main'
                      }
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: '0.875rem' }} />
                  </IconButton>
                  
                  {/* Expand button for generation settings */}
                  <IconButton
                    size="small"
                    onClick={() => setExpandedTakes(prev => ({ ...prev, [take.id]: !prev[take.id] }))}
                    sx={{ p: 0.25, ml: '0.5rem' }}
                  >
                    {expandedTakes[take.id] ? (
                      <ExpandLessIcon sx={{ fontSize: '0.875rem' }} />
                    ) : (
                      <ExpandMoreIcon sx={{ fontSize: '0.875rem' }} />
                    )}
                  </IconButton>
                </ListItem>
                
                {/* Expandable generation settings */}
                <Collapse in={expandedTakes[take.id]} timeout="auto" unmountOnExit>
                  <Box sx={{ 
                    px: 1, 
                    py: 0.5, 
                    ml: 3.5, 
                    bgcolor: 'action.hover', 
                    borderRadius: 1,
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    color: 'text.secondary'
                  }}>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                      <strong>Provider:</strong> {take.generation_params?.provider || take.generated_by || 'unknown'}
                    </Typography>
                    {take.generation_params?.voice_id && (
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                        <strong>Voice ID:</strong> {take.generation_params.voice_id}
                      </Typography>
                    )}
                    {take.generation_params?.stability !== undefined && (
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                        <strong>Stability:</strong> {take.generation_params.stability}
                      </Typography>
                    )}
                    {take.generation_params?.similarity_boost !== undefined && (
                      <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                        <strong>Similarity:</strong> {take.generation_params.similarity_boost}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                      <strong>Prompt:</strong> {take.generation_params?.prompt || item.prompt || item.item_id || 'unknown'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                      <strong>Generated:</strong> {formatStatusDate(take.generation_params?.generated_at || take.created_at)}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block' }}>
                      <strong>Format:</strong> {take.format} • {take.sample_rate}Hz • {take.bit_depth}bit • {take.channels}ch
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', fontFamily: 'monospace', display: 'block', wordBreak: 'break-all' }}>
                      <strong>Hash:</strong> {take.hash_sha256 || 'unknown'}
                    </Typography>
                  </Box>
                </Collapse>
              </Box>
            ))}
          </List>
        )}
        
        {/* Generate Takes Button at bottom */}
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            size="small"
            fullWidth
            disabled={isDisabled || generatingTakes}
            onClick={handleGenerateTakes}
            sx={{ ...DESIGN_SYSTEM.typography.small }}
          >
            {generatingTakes ? 'Generating...' : `Generate ${actor?.provider_settings?.[item.content_type]?.batch_generate || 1} Takes Now!`}
          </Button>
        </Box>
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
