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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { deleteContent, updateContent, updateSection, updateActor, getTakes, updateTake, generateTakes, deleteTake } from '../api/client.js';
import CompleteButton from './CompleteButton.jsx';
import DetailHeader from './DetailHeader.jsx';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { buildContentPath, buildSectionPath, buildActorPath, getSectionName } from '../utils/pathBuilder.js';
import { useLog, usePlayback, useStatus, useCredits } from '../contexts/AppContext.jsx';

// Local storage key for LLM settings (same as SettingsDialog)
const LLM_STORAGE_KEY = 'vofoundry-llm-settings';

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
  sections,
  onContentDeleted,
  onContentUpdated,
  onSectionUpdated,
  onActorUpdated,
  sectionComplete,
  blankSpaceConversion = 'underscore',
  capitalizationConversion = 'lowercase',
  onTakesGenerated,
  onTakeUpdated,
  error: parentError 
}) {
  const { logInfo, logError } = useLog();
  const { playingTakeId, onPlayRequest, onStopRequest, playedTakes, onTakePlayed } = usePlayback();
  const { onStatusChange } = useStatus();
  const { onCreditsRefresh } = useCredits();
  // Build the base filename for this content item
  // Strip trailing underscore from actor.base_filename and apply conversions to cue_id
  const actorBase = stripTrailingUnderscore(actor?.base_filename || 'unknown');
  const cueIdConverted = applyCapitalizationConversion(
    applyBlankSpaceConversion(item.cue_id || 'untitled', blankSpaceConversion),
    capitalizationConversion
  );
  const baseFilename = applyCapitalizationConversion(
    `${actorBase}_${item.content_type}_${cueIdConverted}`,
    capitalizationConversion
  );
  
  const [confirmDeleteContentOpen, setConfirmDeleteContentOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  
  // Editable fields
  const [cueId, setCueId] = useState(item.cue_id || '');
  // Default prompt to cue_id with first letter capitalized if not set
  const defaultPrompt = item.cue_id ? item.cue_id.charAt(0).toUpperCase() + item.cue_id.slice(1) : '';
  const [prompt, setPrompt] = useState(item.prompt || defaultPrompt);
  // Initialize filename with stored value or auto-generated baseFilename
  const [filename, setFilename] = useState(item.filename || baseFilename);
  const [saving, setSaving] = useState(false);
  
  // AI prompt generation state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  
  // Takes
  const [takes, setTakes] = useState([]);
  const [loadingTakes, setLoadingTakes] = useState(false);
  const [generatingTakes, setGeneratingTakes] = useState(false);
  const [expandedTakes, setExpandedTakes] = useState({});
  const [editingCueId, setEditingCueId] = useState(false);

  // When a cue is marked complete (all_approved), lock all controls except the Complete button
  const isDisabled = !!item.all_approved;

  // Sync local state when item changes
  useEffect(() => {
    setCueId(item.cue_id || '');
    // Use stored prompt or default to cue_id with first letter capitalized
    const newDefaultPrompt = item.cue_id ? item.cue_id.charAt(0).toUpperCase() + item.cue_id.slice(1) : '';
    setPrompt(item.prompt || newDefaultPrompt);
    // Use stored filename or regenerate from baseFilename with proper formatting
    const newActorBase = stripTrailingUnderscore(actor?.base_filename || 'unknown');
    const newCueIdConverted = applyCapitalizationConversion(
      applyBlankSpaceConversion(item.cue_id || 'untitled', blankSpaceConversion),
      capitalizationConversion
    );
    const newBaseFilename = applyCapitalizationConversion(
      `${newActorBase}_${item.content_type}_${newCueIdConverted}`,
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
  }, [item.id, item.cue_id, item.prompt, item.filename, item.content_type, actor, blankSpaceConversion, capitalizationConversion, sectionComplete]);
  
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
    try {
      setSaving(true);
      setError(null);
      if (onStatusChange) onStatusChange('Processing');
      
      const oldCueId = field === 'cue_id' ? item.cue_id : null;
      const result = await updateContent(item.id, { [field]: value });
      if (result.content && onContentUpdated) {
        onContentUpdated(result.content, oldCueId);
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

    // If this take is currently playing, stop it
    if (playingTakeId === take.id) {
      if (onStopRequest) onStopRequest();
    } else {
      // Play the selected take
      if (onPlayRequest) {
        onPlayRequest(item.id, take);
      }
    }
  };

  const handleTakeStatus = async (takeId, status) => {
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
        // Log to browser console (history log is handled by ProjectShell.onTakesGenerated)
        const filenames = result.takes.map(t => t.filename).join(', ');
        console.log(`[Generate] Created ${result.takes.length} take(s): ${filenames}`);
      }
    } catch (err) {
      const errorMsg = err.message || String(err);
      setError(errorMsg);
      console.error(`[Generate] Failed:`, errorMsg);
      logError(`Generation failed: ${errorMsg}`);
    } finally {
      setGeneratingTakes(false);
      if (onStatusChange) onStatusChange('');
      // Refresh credits after generation (small delay for ElevenLabs API to update)
      if (onCreditsRefresh) {
        setTimeout(() => onCreditsRefresh(), 1000);
      }
    }
  };

  const handleDeleteTake = async (takeId) => {
    try {
      if (onStatusChange) onStatusChange('Processing');
      const take = takes.find(t => t.id === takeId);
      await deleteTake(takeId);
      setTakes(prev => prev.filter(t => t.id !== takeId));
      logInfo(`Take deleted: ${take?.filename || takeId}`);
    } catch (err) {
      const errorMsg = err.message || String(err);
      setError(errorMsg);
      logError(`Failed to delete take: ${errorMsg}`);
    } finally {
      if (onStatusChange) onStatusChange('');
    }
  };

  // AI prompt handlers
  const getLLMSettings = () => {
    try {
      const stored = localStorage.getItem(LLM_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  };

  const handleAIGenerate = async () => {
    const settings = getLLMSettings();
    if (!settings?.apiKey) {
      setAiError('Configure AI in Settings first');
      return;
    }

    setAiLoading(true);
    setAiError('');

    try {
      const res = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          systemPrompt: settings.systemPrompts?.generate || '',
          contentName: item.cue_id || 'untitled',
          actorName: actor?.name || '',
          sectionType: item.content_type
        })
      });

      const data = await res.json();
      if (res.ok && data.prompt) {
        setPrompt(data.prompt);
        handleSaveField('prompt', data.prompt);
      } else {
        setAiError(data.error || data.details || 'Failed to generate');
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAIImprove = async () => {
    const settings = getLLMSettings();
    if (!settings?.apiKey) {
      setAiError('Configure AI in Settings first');
      return;
    }

    if (!prompt.trim()) {
      setAiError('Enter a prompt first');
      return;
    }

    setAiLoading(true);
    setAiError('');

    try {
      const res = await fetch('/api/llm/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: settings.provider,
          apiKey: settings.apiKey,
          model: settings.model,
          systemPrompt: settings.systemPrompts?.improve || '',
          currentPrompt: prompt,
          contentName: item.cue_id || 'untitled',
          sectionType: item.content_type
        })
      });

      const data = await res.json();
      if (res.ok && data.prompt) {
        setPrompt(data.prompt);
        handleSaveField('prompt', data.prompt);
      } else {
        setAiError(data.error || data.details || 'Failed to improve');
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleResetPrompt = () => {
    const newDefault = item.cue_id ? item.cue_id.charAt(0).toUpperCase() + item.cue_id.slice(1) : '';
    setPrompt(newDefault);
    handleSaveField('prompt', newDefault);
    setAiError('');
  };
  
  // Compute approval progress
  const approvedCount = takes.filter(t => t.status === 'approved').length;
  const requiredApprovals = actor?.provider_settings?.[item.content_type]?.approval_count_default || 1;

  const contentTypeLabel = item.content_type === 'dialogue' ? 'dialogue' : item.content_type === 'music' ? 'music' : 'sfx';
  const subtitle = `actor: ${actor?.display_name || 'unknown'} • type: ${contentTypeLabel}`;

  const handleSaveCueId = () => {
    if (cueId !== item.cue_id) {
      handleSaveField('cue_id', cueId);
    }
    setEditingCueId(false);
  };

  const handleStartEditCueId = () => {
    setEditingCueId(true);
    setCueId(item.cue_id || '');
  };

  return (
    <Box sx={{ flexGrow: 1, overflow: 'auto', p: DESIGN_SYSTEM.spacing.containerPadding, minWidth: 0 }}>
      {editingCueId ? (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              size="small"
              value={cueId}
              onChange={(e) => setCueId(e.target.value)}
              placeholder={item.cue_id || 'untitled'}
              autoFocus
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCueId();
                }
              }}
              sx={{ flexGrow: 1, ...DESIGN_SYSTEM.components.formControl }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveCueId}
            >
              Save
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setEditingCueId(false);
                setCueId(item.cue_id || '');
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      ) : (
        <DetailHeader
          title={item.cue_id || 'untitled'}
          subtitle={subtitle}
          onEdit={handleStartEditCueId}
          onDelete={() => setConfirmDeleteContentOpen(true)}
          editDisabled={isDisabled}
          deleteDisabled={isDisabled}
          editTooltip="Edit cue ID"
          deleteTooltip="Delete content"
          rightActions={
            <CompleteButton
              isComplete={item.all_approved}
              onToggle={async () => {
                try {
                  setSaving(true);
                  setError(null);

                  const nextAllApproved = !item.all_approved;
                  const result = await updateContent(item.id, { all_approved: nextAllApproved });

                  if (result.content && onContentUpdated) {
                    onContentUpdated(result.content);
                  }

                  // Status-only log for cue completion using full path
                  const actorName = actor?.display_name || 'Unknown';
                  const sectionName = getSectionName(item.section_id, sections);
                  const cueName = item.cue_id || item.id;
                  const path = buildContentPath(actorName, sectionName, cueName);
                  if (nextAllApproved) {
                    logInfo(`user marked ${path} as complete`);
                  } else {
                    logInfo(`user marked ${path} as incomplete`);
                  }

                  // If this cue is being marked incomplete, also mark its parent
                  // section and actor as incomplete, to keep the hierarchy in sync.
                  // Note: We don't log these cascaded changes here - the diff describer handles that.
                  if (!nextAllApproved) {
                    try {
                      if (item.section_id) {
                        const sectionResult = await updateSection(item.section_id, { section_complete: false });
                        if (sectionResult && sectionResult.section && onSectionUpdated) {
                          onSectionUpdated(sectionResult.section);
                        }
                      }
                      if (item.actor_id) {
                        const actorResult = await updateActor(item.actor_id, { actor_complete: false });
                        if (actorResult && actorResult.actor && onActorUpdated) {
                          onActorUpdated(actorResult.actor);
                        }
                      }
                    } catch (hierarchyErr) {
                      // Surface any hierarchy update issues through the same error channel
                      setError(hierarchyErr.message || String(hierarchyErr));
                    }
                  }
                } catch (err) {
                  setError(err.message || String(err));
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              itemType="cue"
              approvedCount={approvedCount}
            />
          }
        />
      )}

      {/* Editable Filename */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: DESIGN_SYSTEM.spacing.elementGap }}>
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
            handleSaveField('filename', baseFilename);
          }}
          disabled={isDisabled || saving || filename === baseFilename}
          title="Reset to default filename"
          sx={{ p: 0.5 }}
        >
          <RefreshIcon sx={{ fontSize: '1rem' }} />
        </IconButton>
      </Box>

      {/* Editable Prompt with AI toolbar */}
      <Box sx={{ mb: DESIGN_SYSTEM.spacing.elementGap }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {aiLoading && <CircularProgress size={16} />}
            <Tooltip title="Generate prompt with AI">
              <span>
                <IconButton
                  size="small"
                  onClick={handleAIGenerate}
                  disabled={isDisabled || aiLoading}
                  sx={{ 
                    p: 0.5,
                    color: 'text.disabled',
                    '&:hover': { color: 'text.secondary' }
                  }}
                >
                  <AutoAwesomeIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Improve prompt with AI">
              <span>
                <IconButton
                  size="small"
                  onClick={handleAIImprove}
                  disabled={isDisabled || aiLoading || !prompt.trim()}
                  sx={{ 
                    p: 0.5,
                    color: 'text.disabled',
                    '&:hover': { color: 'text.secondary' }
                  }}
                >
                  <AutoFixHighIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Reset to default">
              <span>
                <IconButton
                  size="small"
                  onClick={handleResetPrompt}
                  disabled={isDisabled}
                  sx={{ 
                    p: 0.5,
                    color: 'text.disabled',
                    '&:hover': { color: 'text.secondary' }
                  }}
                >
                  <RestartAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
        <TextField
          fullWidth
          size="small"
          label="Prompt"
          multiline
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onBlur={() => prompt !== item.prompt && handleSaveField('prompt', prompt)}
          disabled={isDisabled || saving}
          sx={DESIGN_SYSTEM.components.formControl}
        />
        {aiError && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
            {aiError}
          </Typography>
        )}
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
                      <strong>Prompt:</strong> {take.generation_params?.prompt || item.prompt || item.cue_id || 'unknown'}
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
          {(() => {
            const dialogueProvider = actor?.provider_settings?.dialogue;
            const voiceMissing = item.content_type === 'dialogue' && (!dialogueProvider || !dialogueProvider.voice_id);
            const disabled = isDisabled || generatingTakes || voiceMissing;
            const batchCount = actor?.provider_settings?.[item.content_type]?.batch_generate || 1;
            const label = generatingTakes
              ? 'Generating takes...'
              : `Generate ${batchCount} Take${batchCount > 1 ? 's' : ''}`;

            const button = (
              <Button
                variant="outlined"
                size="small"
                fullWidth
                disabled={disabled}
                onClick={handleGenerateTakes}
                sx={{ ...DESIGN_SYSTEM.typography.small }}
              >
                {label}
              </Button>
            );

            if (voiceMissing) {
              return (
                <Tooltip
                  title="Select a default dialogue voice in Provider settings before generating takes."
                  arrow
                >
                  <span>{button}</span>
                </Tooltip>
              );
            }

            return button;
          })()}
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
    </Box>
  );
}
