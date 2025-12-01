import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';
import { LOG_TYPE } from '../hooks/useAppLog.js';

function formatTime(isoString) {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function LogIcon({ type }) {
  const iconSx = { fontSize: '0.875rem' };
  
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
        '&:hover': { bgcolor: 'action.hover' },
        cursor: entry.details ? 'pointer' : 'default',
      }}
      onClick={() => entry.details && setExpanded(!expanded)}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <LogIcon type={entry.type} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0 }}
        >
          {formatTime(entry.timestamp)}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.75rem',
            wordBreak: 'break-word',
            flexGrow: 1,
            color: entry.type === LOG_TYPE.ERROR ? 'error.main' : 'text.primary',
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

export default function ConsoleView({ logs, undoRedo }) {
  const { canUndo, canRedo, undoMessage, redoMessage, undo, redo, undoing } = undoRedo;
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
          Console
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
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ ...DESIGN_SYSTEM.typography.body, mb: 0.5 }}>
        {canUndo ? `Undo: ${undoMessage || 'last action'}` : canRedo ? `Redo: ${redoMessage || 'last action'}` : 'Activity log'}
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
