import { createSignal, For, Show } from 'solid-js';
import {
    Box, Typography, Button, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions
} from '@suid/material';
import Tooltip from './Tooltip.jsx';
import CheckCircleIcon from '@suid/icons-material/CheckCircle';
import CheckBoxIcon from '@suid/icons-material/CheckBox';
import IndeterminateCheckBoxIcon from '@suid/icons-material/IndeterminateCheckBox';
import ErrorIcon from '@suid/icons-material/Error';
import WarningIcon from '@suid/icons-material/Warning';
import InfoIcon from '@suid/icons-material/Info';
import UndoIcon from '@suid/icons-material/Undo';
import RedoIcon from '@suid/icons-material/Redo';
import RecordVoiceOverIcon from '@suid/icons-material/RecordVoiceOver';
import MusicNoteIcon from '@suid/icons-material/MusicNote';
import GraphicEqIcon from '@suid/icons-material/GraphicEq';
import DeleteIcon from '@suid/icons-material/Delete';
import ThumbUpIcon from '@suid/icons-material/ThumbUp';
import ThumbDownIcon from '@suid/icons-material/ThumbDown';

function formatDateTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');

    const datePart = date.getFullYear() !== now.getFullYear()
        ? `${month}/${day}/${date.getFullYear()}`
        : `${month}/${day}`;

    return `${datePart} ${hours}:${minutes}:${seconds}`;
}

function LogIcon(props) {
    const iconSx = { fontSize: '0.875rem' };
    const message = props.message || '';

    // Generated sound files show content-type specific icons
    if (/^Generated \d+ take/i.test(message)) {
        if (/→ dialogue →/i.test(message)) return <RecordVoiceOverIcon sx={{ ...iconSx, color: 'success.main' }} />;
        if (/→ music →/i.test(message)) return <MusicNoteIcon sx={{ ...iconSx, color: 'success.main' }} />;
        if (/→ sfx →/i.test(message)) return <GraphicEqIcon sx={{ ...iconSx, color: 'success.main' }} />;
        return <RecordVoiceOverIcon sx={{ ...iconSx, color: 'success.main' }} />;
    }

    if (/^user marked .* as complete$/i.test(message)) return <CheckBoxIcon sx={{ ...iconSx, color: 'success.main' }} />;
    if (/^user marked .* as incomplete$/i.test(message)) return <IndeterminateCheckBoxIcon sx={{ ...iconSx, color: 'warning.main' }} />;

    if (/^user approved /i.test(message)) return <ThumbUpIcon sx={{ ...iconSx, color: 'success.main' }} />;
    if (/^user rejected /i.test(message)) return <ThumbDownIcon sx={{ ...iconSx, color: 'error.main' }} />;
    if (/^user unapproved /i.test(message) || /^user unrejected /i.test(message)) return <InfoIcon sx={{ ...iconSx, color: 'text.secondary' }} />;

    switch (props.type) {
        case 'success': return <CheckCircleIcon sx={{ ...iconSx, color: 'success.main' }} />;
        case 'error': return <ErrorIcon sx={{ ...iconSx, color: 'error.main' }} />;
        case 'warning': return <WarningIcon sx={{ ...iconSx, color: 'warning.main' }} />;
        case 'info':
        default: return <InfoIcon sx={{ ...iconSx, color: 'info.main' }} />;
    }
}

function LogEntry(props) {
    const [expanded, setExpanded] = createSignal(false);

    return (
        <Box
            sx={{
                py: 0.5, px: 1, borderBottom: 1, borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                cursor: props.entry.details ? 'pointer' : 'default',
            }}
            onClick={() => props.entry.details && setExpanded(!expanded())}
        >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <LogIcon type={props.entry.type} message={props.entry.message} />
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', flexShrink: 0 }}>
                    {formatDateTime(props.entry.timestamp)}
                </Typography>
                <Typography
                    variant="body2"
                    sx={{
                        fontSize: '0.75rem', wordBreak: 'break-word', flexGrow: 1,
                        color: props.entry.type === 'error' ? 'error.main' : 'text.secondary',
                    }}
                >
                    {props.entry.message}
                </Typography>
            </Box>
            <Show when={expanded() && props.entry.details}>
                <Box sx={{ mt: 0.5, ml: 3, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap' }}>
                    {typeof props.entry.details === 'string' ? props.entry.details : JSON.stringify(props.entry.details, null, 2)}
                </Box>
            </Show>
        </Box>
    );
}

export default function HistoryView(props) {
    // props: logs, undoRedo, onClearLogs
    const [confirmClearOpen, setConfirmClearOpen] = createSignal(false);

    const handleClearLogs = async () => {
        setConfirmClearOpen(false);
        if (props.onClearLogs) await props.onClearLogs();
        if (props.undoRedo?.refreshUndoState) await props.undoRedo.refreshUndoState();
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'hidden', p: 2, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    History
                </Typography>
                <Show when={props.undoRedo?.canUndo?.()}>
                    <Tooltip title={props.undoRedo.undoMessage() || 'Undo'}>
                        <span>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<UndoIcon />}
                                onClick={props.undoRedo.undo}
                                disabled={props.undoRedo.undoing()}
                            >
                                {props.undoRedo.undoing() ? '...' : 'Undo'}
                            </Button>
                        </span>
                    </Tooltip>
                </Show>
                <Show when={props.undoRedo?.canRedo?.()}>
                    <Tooltip title={props.undoRedo.redoMessage() || 'Redo'}>
                        <span>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<RedoIcon />}
                                onClick={props.undoRedo.redo}
                                disabled={props.undoRedo.undoing()}
                            >
                                {props.undoRedo.undoing() ? '...' : 'Redo'}
                            </Button>
                        </span>
                    </Tooltip>
                </Show>
                <Tooltip title="Clear history">
                    <span>
                        <IconButton size="small" onClick={() => setConfirmClearOpen(true)} disabled={props.logs.length === 0}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            <Dialog open={confirmClearOpen()} onClose={() => setConfirmClearOpen(false)}>
                <DialogTitle>Clear History?</DialogTitle>
                <DialogContent>
                    Permanently delete all activity history?
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
                    <Button onClick={handleClearLogs} color="error" variant="contained">Clear</Button>
                </DialogActions>
            </Dialog>

            <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: '0.7rem', mb: 0.5, display: 'block' }}
            >
                {props.undoRedo?.canUndo?.()
                    ? `Undo: ${props.undoRedo.undoMessage() || 'last action'}`
                    : props.undoRedo?.canRedo?.()
                        ? `Redo: ${props.undoRedo.redoMessage() || 'last action'}`
                        : 'Activity log'}
            </Typography>

            <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 1, flexGrow: 1, overflow: 'auto' }}>
                <Show when={props.logs.length > 0} fallback={<Box sx={{ p: 2, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">No activity yet.</Typography></Box>}>
                    <For each={props.logs}>
                        {(entry) => <LogEntry entry={entry} />}
                    </For>
                </Show>
            </Box>
        </Box>
    );
}
