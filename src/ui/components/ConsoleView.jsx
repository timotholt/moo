import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import DeleteIcon from '@mui/icons-material/Delete';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { LOG_TYPE } from '../hooks/useAppLog.js';

function formatDateTime(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  // Include year only if different from current year
  const datePart = date.getFullYear() !== now.getFullYear()
    ? `${month}/${day}/${date.getFullYear()}`
    : `${month}/${day}`;
  
  return `${datePart} ${hours}:${minutes}:${seconds}`;
}

function LogIcon({ type, message }) {
  const iconSx = { fontSize: '0.875rem' };
  
  // Generated sound files show content-type specific icons
  const isGeneratedSound = message && /^Generated \d+ take/i.test(message);
  if (isGeneratedSound) {
    // Check the path for content type (section name indicates type)
    if (/→ dialogue →/i.test(message)) {
      return <RecordVoiceOverIcon sx={{ ...iconSx, color: 'success.main' }} />;
    }
    if (/→ music →/i.test(message)) {
      return <MusicNoteIcon sx={{ ...iconSx, color: 'success.main' }} />;
    }
    if (/→ sfx →/i.test(message)) {
      return <GraphicEqIcon sx={{ ...iconSx, color: 'success.main' }} />;
    }
    // Fallback to dialogue icon if type not detected
    return <RecordVoiceOverIcon sx={{ ...iconSx, color: 'success.main' }} />;
  }
  
  // Checkbox icons for USER-initiated completion messages (Marked actor → ...)
  // Excludes automatic/cascaded messages (those with parenthetical notes like "child cue changed")
  const isAutomatic = message && /\(child .* changed\)/i.test(message);
  
  if (!isAutomatic) {
    const isPathBasedComplete = message && /^Marked actor →.*as complete$/i.test(message);
    const isPathBasedIncomplete = message && /^Marked actor →.*as incomplete$/i.test(message);
    
    if (isPathBasedComplete) {
      return <CheckBoxIcon sx={{ ...iconSx, color: 'success.main' }} />;
    }
    if (isPathBasedIncomplete) {
      return <IndeterminateCheckBoxIcon sx={{ ...iconSx, color: 'warning.main' }} />;
    }
  }
  
  switch (type) {
    case LOG_TYPE.SUCCESS:
      return <CheckCircleIcon sx={{ ...iconSx, color: 'success.main' }} />;
    case LOG_TYPE.ERROR:
      return <ErrorIcon sx={{ ...iconSx, color: 'error.main' }} />;
    case LOG_TYPE.WARNING:
      return <WarningIcon sx={{ ...iconSx, color: 'warning.main' }} />;
    case LOG_TYPE.INFO:
    default:
      return <InfoIcon sx={{ ...iconSx, color: 'info.main' }} />;
  }
}

function LogEntry({ entry }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <Box
      sx={{
        py: 0.5,
        px: 1,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': { 
          bgcolor: 'action.hover',
          '& .log-message': {
            color: entry.type === LOG_TYPE.ERROR ? 'error.main' : 'common.white',
          },
        },
        cursor: entry.details ? 'pointer' : 'default',
      }}
      onClick={() => entry.details && setExpanded(!expanded)}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <LogIcon type={entry.type} message={entry.message} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0 }}
        >
          {formatDateTime(entry.timestamp)}
        </Typography>
        <Typography
          variant="body2"
          className="log-message"
          sx={{
            fontSize: '0.75rem',
            wordBreak: 'break-word',
            flexGrow: 1,
            color: entry.type === LOG_TYPE.ERROR ? 'error.main' : 'text.secondary',
            transition: 'color 0.2s',
          }}
        >
          {entry.message}
        </Typography>
      </Box>
      {expanded && entry.details && (
        <Box
          sx={{
            mt: 0.5,
            ml: 3,
            p: 1,
            bgcolor: 'action.hover',
            borderRadius: 1,
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {typeof entry.details === 'string'
            ? entry.details
            : JSON.stringify(entry.details, null, 2)}
        </Box>
      )}
    </Box>
  );
}

export default function ConsoleView({ logs, undoRedo, onClearLogs }) {
  const { canUndo, canRedo, undoMessage, redoMessage, undo, redo, undoing, refreshUndoState } = undoRedo;
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleClearLogs = async () => {
    setConfirmClearOpen(false);
    if (onClearLogs) {
      await onClearLogs();
    }
    // Refresh undo state since history was cleared
    if (refreshUndoState) {
      await refreshUndoState();
    }
  };
  
  return (
    <Box sx={{ 
      flexGrow: 1, 
      overflow: 'hidden', // No outer scrollbar
      p: DESIGN_SYSTEM.spacing.containerPadding, 
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" sx={{ ...DESIGN_SYSTEM.typography.pageTitle, flexGrow: 1, color: 'text.secondary' }}>
          History
        </Typography>
        {canUndo && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<UndoIcon />}
            onClick={undo}
            disabled={undoing}
            title={undoMessage ? `Undo: ${undoMessage}` : 'Undo'}
          >
            {undoing ? '...' : 'Undo'}
          </Button>
        )}
        {canRedo && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<RedoIcon />}
            onClick={redo}
            disabled={undoing}
            title={redoMessage ? `Redo: ${redoMessage}` : 'Redo'}
          >
            {undoing ? '...' : 'Redo'}
          </Button>
        )}
        <Tooltip title="Clear history">
          <IconButton
            size="small"
            onClick={() => setConfirmClearOpen(true)}
            disabled={logs.length === 0}
            sx={{ color: 'text.secondary' }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Clear History Confirmation Dialog */}
      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)}>
        <DialogTitle>Clear History?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will permanently delete all history entries. Your undo/redo capability will remain intact.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
          <Button onClick={handleClearLogs} color="error" variant="contained">
            Clear History
          </Button>
        </DialogActions>
      </Dialog>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: '0.7rem', mb: 0.5, display: 'block' }}
      >
        {canUndo
          ? `Undo: ${undoMessage || 'last action'}`
          : canRedo
          ? `Redo: ${redoMessage || 'last action'}`
          : 'Activity log'}
      </Typography>

      <Box
        sx={{
          mt: 1,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          flexGrow: 1,
          overflow: 'auto',
          bgcolor: 'background.default',
        }}
      >
        {logs.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              No activity yet. Operations will appear here.
            </Typography>
          </Box>
        ) : (
          logs.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))
        )}
      </Box>
    </Box>
  );
}
