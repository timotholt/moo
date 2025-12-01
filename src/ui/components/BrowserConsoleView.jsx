import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import DeleteIcon from '@mui/icons-material/Delete';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import BugReportIcon from '@mui/icons-material/BugReport';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

function formatTime(isoString) {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function LogIcon({ level }) {
  const iconSx = { fontSize: '0.875rem', mr: 0.5 };
  
  switch (level) {
    case 'error':
      return <ErrorIcon sx={{ ...iconSx, color: 'error.main' }} />;
    case 'warn':
      return <WarningIcon sx={{ ...iconSx, color: 'warning.main' }} />;
    case 'info':
      return <InfoIcon sx={{ ...iconSx, color: 'info.main' }} />;
    case 'debug':
      return <BugReportIcon sx={{ ...iconSx, color: 'text.secondary' }} />;
    case 'log':
    default:
      return <InfoIcon sx={{ ...iconSx, color: 'text.secondary' }} />;
  }
}

function getTextColor(level) {
  switch (level) {
    case 'error': return 'error.main';
    case 'warn': return 'warning.main';
    case 'info': return 'info.main';
    case 'debug': return 'text.secondary';
    default: return 'text.primary';
  }
}

function ConsoleEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        px: 1,
        py: 0.25,
        borderBottom: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
        cursor: entry.args ? 'pointer' : 'default',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
      }}
      onClick={() => entry.args && setExpanded(!expanded)}
    >
      <LogIcon level={entry.level} />
      <Typography
        variant="caption"
        sx={{ 
          color: 'text.secondary', 
          mr: 1, 
          flexShrink: 0,
          fontFamily: 'monospace',
          fontSize: '0.7rem',
        }}
      >
        {formatTime(entry.timestamp)}
      </Typography>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          sx={{ 
            color: getTextColor(entry.level),
            whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            wordBreak: expanded ? 'break-all' : 'normal',
          }}
        >
          {entry.message}
        </Typography>
        {expanded && entry.args && (
          <Box
            sx={{
              mt: 0.5,
              p: 1,
              bgcolor: 'action.hover',
              borderRadius: 1,
              fontSize: '0.7rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {entry.args.map((arg, i) => (
              <Box key={i}>
                {typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function BrowserConsoleView({ entries, onClear }) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const handleClear = () => {
    setConfirmClearOpen(false);
    if (onClear) {
      onClear();
    }
  };

  return (
    <Box sx={{ 
      flexGrow: 1, 
      overflow: 'hidden',
      p: DESIGN_SYSTEM.spacing.containerPadding, 
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h6" sx={{ ...DESIGN_SYSTEM.typography.pageTitle, flexGrow: 1, color: 'text.secondary' }}>
          Console
        </Typography>
        <Tooltip title="Clear console">
          <span>
            <IconButton
              size="small"
              onClick={() => setConfirmClearOpen(true)}
              disabled={entries.length === 0}
              sx={{ color: 'text.secondary' }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Clear Console Confirmation Dialog */}
      <Dialog open={confirmClearOpen} onClose={() => setConfirmClearOpen(false)} disableRestoreFocus>
        <DialogTitle>Clear Console?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will clear all console output. This does not affect your browser's developer console.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
          <Button onClick={handleClear} color="error" variant="contained">
            Clear Console
          </Button>
        </DialogActions>
      </Dialog>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ fontSize: '0.7rem', mb: 0.5, display: 'block' }}
      >
        Browser console output ({entries.length} entries)
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
        {entries.length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
              No console output yet. Messages from console.log, console.warn, console.error will appear here.
            </Typography>
          </Box>
        ) : (
          entries.map((entry) => (
            <ConsoleEntry key={entry.id} entry={entry} />
          ))
        )}
      </Box>
    </Box>
  );
}
