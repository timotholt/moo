import { createSignal, For, Show } from 'solid-js';
import {
    Box, Typography, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, Button
} from '@suid/material';
import Tooltip from './Tooltip.jsx';
import {
    Delete as DeleteIcon, Info as InfoIcon, Warning as WarningIcon,
    Error as ErrorIcon, BugReport as BugReportIcon
} from '@suid/icons-material';

function formatTime(isoString) {
    const date = new Date(isoString);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ms = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}

function LogIcon(props) {
    const iconSx = { fontSize: '0.875rem', mr: 0.5 };

    return (
        <Show when={props.level === 'error'} fallback={
            <Show when={props.level === 'warn'} fallback={
                <Show when={props.level === 'info'} fallback={
                    <Show when={props.level === 'debug'} fallback={
                        <InfoIcon sx={{ ...iconSx, color: 'text.secondary' }} />
                    }>
                        <BugReportIcon sx={{ ...iconSx, color: 'text.secondary' }} />
                    </Show>
                }>
                    <InfoIcon sx={{ ...iconSx, color: 'info.main' }} />
                </Show>
            }>
                <WarningIcon sx={{ ...iconSx, color: 'warning.main' }} />
            </Show>
        }>
            <ErrorIcon sx={{ ...iconSx, color: 'error.main' }} />
        </Show>
    );
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

function ConsoleEntry(props) {
    const [expanded, setExpanded] = createSignal(false);

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
                cursor: props.entry.args ? 'pointer' : 'default',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
            }}
            onClick={() => props.entry.args && setExpanded(!expanded())}
        >
            <LogIcon level={props.entry.level} />
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
                {formatTime(props.entry.timestamp)}
            </Typography>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography
                    variant="body2"
                    sx={{
                        color: getTextColor(props.entry.level),
                        whiteSpace: expanded() ? 'pre-wrap' : 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        wordBreak: expanded() ? 'break-all' : 'normal',
                    }}
                >
                    {props.entry.message}
                </Typography>
                <Show when={expanded() && props.entry.args}>
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
                        <For each={props.entry.args}>
                            {(arg) => (
                                <Box>
                                    {typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)}
                                </Box>
                            )}
                        </For>
                    </Box>
                </Show>
            </Box>
        </Box>
    );
}

export default function BrowserConsoleView(props) {
    // props: entries, onClear
    const [confirmClearOpen, setConfirmClearOpen] = createSignal(false);

    const handleClear = () => {
        setConfirmClearOpen(false);
        if (props.onClear) {
            props.onClear();
        }
    };

    return (
        <Box sx={{
            flexGrow: 1,
            overflow: 'hidden',
            p: 2,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Console
                </Typography>
                <Tooltip title="Clear console">
                    <span>
                        <IconButton
                            size="small"
                            onClick={() => setConfirmClearOpen(true)}
                            disabled={props.entries.length === 0}
                            sx={{ color: 'text.secondary' }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            {/* Clear Console Confirmation Dialog */}
            <Dialog open={confirmClearOpen()} onClose={() => setConfirmClearOpen(false)}>
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
                Browser console output ({props.entries.length} entries)
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
                <Show when={props.entries.length > 0} fallback={
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            No console output yet.
                        </Typography>
                    </Box>
                }>
                    <For each={props.entries}>
                        {(entry) => <ConsoleEntry entry={entry} />}
                    </For>
                </Show>
            </Box>
        </Box>
    );
}
