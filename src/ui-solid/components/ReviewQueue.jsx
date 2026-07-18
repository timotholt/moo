import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
    DialogContent, DialogTitle, Divider, IconButton, List, ListItemButton,
    ListItemText, Paper, Typography,
} from '@suid/material';
import RefreshIcon from '@suid/icons-material/Refresh';
import DoneAllIcon from '@suid/icons-material/DoneAll';
import ThumbUpIcon from '@suid/icons-material/ThumbUp';
import ThumbDownIcon from '@suid/icons-material/ThumbDown';
import OpenInNewIcon from '@suid/icons-material/OpenInNew';
import { getReviewQueue, getTakes, updateMedia, updateTake } from '../api/client.ts';
import TakePreview, { mediaUrlForPath } from './TakePreview.jsx';
import Tooltip from './Tooltip.jsx';
import {
    boundedVisibleSelection,
    MAX_BULK_REVIEW_TAKES,
    moveWithinBounds,
    shouldIgnoreReviewShortcut,
} from './review/reviewQueueModel.js';

const labels = {
    ready_for_review: { label: 'Ready to review', color: 'warning' },
    needs_generation: { label: 'Needs a new take', color: 'info' },
    not_generated: { label: 'Not generated', color: 'default' },
};

const statusLabels = {
    new: { label: 'Undecided', color: 'warning' },
    approved: { label: 'Approved', color: 'success' },
    rejected: { label: 'Rejected', color: 'error' },
};

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'size unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return 'duration unknown';
    return `${seconds.toFixed(1)}s`;
}

function mediaTypeLabel(mediaType) {
    if (mediaType === 'sfx') return 'SFX';
    return String(mediaType || 'unknown').replace(/^\w/, (value) => value.toUpperCase());
}

export default function ReviewQueue(props) {
    const [items, setItems] = createSignal([]);
    const [takes, setTakes] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [selectedCueIds, setSelectedCueIds] = createSignal(new Set());
    const [selectedTakeIds, setSelectedTakeIds] = createSignal(new Set());
    const [activeCueIndex, setActiveCueIndex] = createSignal(0);
    const [activeTakeIndex, setActiveTakeIndex] = createSignal(0);
    const [confirmFinishOpen, setConfirmFinishOpen] = createSignal(false);
    const [finishing, setFinishing] = createSignal(false);
    const [decisionBusy, setDecisionBusy] = createSignal(new Set());
    const [bulkDecision, setBulkDecision] = createSignal(null);
    const [audioLoadState, setAudioLoadState] = createSignal('loading');

    const activeEntry = createMemo(() => items()[activeCueIndex()] || null);
    const visibleTakes = createMemo(() => {
        const mediaId = activeEntry()?.media.id;
        return mediaId ? takes().filter((take) => take.media_id === mediaId) : [];
    });
    const activeTake = createMemo(() => visibleTakes()[activeTakeIndex()] || null);
    const selectedVisibleTakes = createMemo(() => boundedVisibleSelection(
        selectedTakeIds(),
        visibleTakes(),
    ));
    const selectedApprovableTakes = createMemo(() => (
        selectedVisibleTakes().filter((take) => take.technical_status !== 'invalid')
    ));
    const selectedItems = createMemo(() => items().filter((entry) => selectedCueIds().has(entry.media.id)));
    const finishableSelected = createMemo(() => selectedItems().filter((entry) => entry.lifecycle.approved_take_count > 0));

    const loadQueue = async () => {
        setLoading(true);
        try {
            const [data, takeData] = await Promise.all([getReviewQueue(), getTakes()]);
            setItems(data.items || []);
            setTakes(takeData.takes || []);
            setSelectedCueIds((current) => new Set([...current].filter((id) => data.items?.some((entry) => entry.media.id === id))));
            setSelectedTakeIds((current) => new Set([...current].filter((id) => takeData.takes?.some((take) => take.id === id))));
            setActiveCueIndex((current) => Math.max(0, Math.min(current, Math.max(0, (data.items?.length || 1) - 1))));
            setError(null);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    createEffect(() => {
        props.refreshToken;
        void loadQueue();
    });

    createEffect(() => {
        activeEntry()?.media.id;
        setActiveTakeIndex(0);
        setSelectedTakeIds(new Set());
    });

    createEffect(() => {
        activeTake()?.id;
        setAudioLoadState('loading');
    });

    const toggleCueSelected = (mediaId) => {
        setSelectedCueIds((current) => {
            const next = new Set(current);
            if (next.has(mediaId)) next.delete(mediaId);
            else next.add(mediaId);
            return next;
        });
    };

    const toggleTakeSelected = (takeId) => {
        setSelectedTakeIds((current) => {
            const next = new Set(current);
            if (next.has(takeId)) {
                next.delete(takeId);
            } else if (boundedVisibleSelection(next, visibleTakes()).length < MAX_BULK_REVIEW_TAKES) {
                next.add(takeId);
            }
            return next;
        });
    };

    const finishSelected = async () => {
        const finishable = finishableSelected();
        if (finishable.length === 0) return;
        setFinishing(true);
        try {
            const results = await Promise.allSettled(finishable.map((entry) => updateMedia(entry.media.id, { completion_override: true })));
            const failures = results.filter((result) => result.status === 'rejected');
            if (failures.length > 0) setError(`Finished ${finishable.length - failures.length} cues; ${failures.length} could not be updated.`);
            else setError(null);
            setConfirmFinishOpen(false);
            setSelectedCueIds(new Set());
            await loadQueue();
            if (props.onRefresh) props.onRefresh();
        } finally {
            setFinishing(false);
        }
    };

    const decideTake = async (take, nextStatus, refresh = true) => {
        if (!take || decisionBusy().has(take.id)) return false;
        setDecisionBusy((current) => new Set(current).add(take.id));
        try {
            const result = await updateTake(take.id, { status: nextStatus });
            setTakes((current) => current.map((candidate) => candidate.id === take.id ? result.take : candidate));
            setError(null);
            if (refresh) {
                await loadQueue();
                if (props.onRefresh) props.onRefresh();
            }
            return true;
        } catch (err) {
            setError(`Could not ${nextStatus === 'approved' ? 'approve' : 'reject'} ${take.filename || 'take'}: ${err.message || String(err)}`);
            return false;
        } finally {
            setDecisionBusy((current) => {
                const next = new Set(current);
                next.delete(take.id);
                return next;
            });
        }
    };

    const decideSelected = async (nextStatus) => {
        const selected = nextStatus === 'approved'
            ? selectedApprovableTakes()
            : selectedVisibleTakes();
        if (selected.length === 0 || bulkDecision()) return;
        setBulkDecision(nextStatus);
        try {
            const results = await Promise.allSettled(selected.map((take) => decideTake(take, nextStatus, false)));
            const succeeded = results.filter((result) => result.status === 'fulfilled' && result.value).length;
            const failed = selected.length - succeeded;
            setSelectedTakeIds(new Set());
            await loadQueue();
            if (props.onRefresh) props.onRefresh();
            setError(failed > 0
                ? `${nextStatus === 'approved' ? 'Approved' : 'Rejected'} ${succeeded} selected takes; ${failed} failed.`
                : null);
        } finally {
            setBulkDecision(null);
        }
    };

    const selectVisibleUndecided = () => {
        setSelectedTakeIds(new Set(
            visibleTakes()
                .filter((take) => take.status === 'new')
                .slice(0, MAX_BULK_REVIEW_TAKES)
                .map((take) => take.id),
        ));
    };

    const handleKeyDown = (event) => {
        if (shouldIgnoreReviewShortcut(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
        if (items().length === 0) return;
        const key = event.key.toLowerCase();
        if (event.key === 'ArrowDown' || key === 'j') {
            event.preventDefault();
            setActiveTakeIndex((index) => moveWithinBounds(index, visibleTakes().length, 1));
        } else if (event.key === 'ArrowUp' || key === 'k') {
            event.preventDefault();
            setActiveTakeIndex((index) => moveWithinBounds(index, visibleTakes().length, -1));
        } else if (event.key === 'ArrowRight' || key === 'n') {
            event.preventDefault();
            setActiveCueIndex((index) => moveWithinBounds(index, items().length, 1));
        } else if (event.key === 'ArrowLeft' || key === 'p') {
            event.preventDefault();
            setActiveCueIndex((index) => moveWithinBounds(index, items().length, -1));
        } else if (key === 'a') {
            event.preventDefault();
            if (activeTake()?.technical_status !== 'invalid') {
                void decideTake(activeTake(), 'approved');
            }
        } else if (key === 'r') {
            event.preventDefault();
            void decideTake(activeTake(), 'rejected');
        } else if (key === 'x' || event.key === ' ') {
            event.preventDefault();
            if (activeTake()) toggleTakeSelected(activeTake().id);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (activeEntry()) props.onOpenMedia(activeEntry().media.id);
        }
    };

    return (
        <Box
            sx={{ flexGrow: 1, overflow: 'auto', p: 2, outline: 'none' }}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-label="Multimedia review workspace"
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Multimedia Review
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={loadQueue} disabled={loading()}>
                    Refresh
                </Button>
                <Button size="small" color="success" startIcon={<DoneAllIcon />} onClick={() => setConfirmFinishOpen(true)} disabled={finishableSelected().length === 0 || finishing()}>
                    Finish selected ({finishableSelected().length})
                </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Review audio, image, and video takes in one workspace. J/K moves between takes,
                N/P changes cues, A approves, R rejects, X or Space selects, and Enter opens the full cue.
            </Typography>

            <Show when={error()}><Alert severity="error" sx={{ mb: 2 }}>{error()}</Alert></Show>
            <Show when={loading()}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
            </Show>
            <Show when={!loading() && items().length === 0}>
                <Alert severity="success">Nothing needs attention. Your authoring queue is clear.</Alert>
            </Show>
            <Show when={!loading() && items().length > 0}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', minWidth: 0 }}>
                    <Paper variant="outlined" sx={{ width: 'min(36%, 360px)', minWidth: '250px', overflow: 'hidden' }}>
                        <Typography variant="overline" sx={{ display: 'block', px: 1.5, py: 0.75, bgcolor: 'action.hover' }}>
                            Cues needing attention ({items().length})
                        </Typography>
                        <List disablePadding sx={{ maxHeight: '70vh', overflow: 'auto' }}>
                            <For each={items()}>{(entry, index) => {
                                const state = labels[entry.kind] || labels.not_generated;
                                const detail = entry.lifecycle.new_take_count > 0
                                    ? `${entry.lifecycle.new_take_count} new · ${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved`
                                    : entry.lifecycle.take_count > 0
                                        ? `${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved · needs another take`
                                        : 'Generate the first take';
                                return <ListItemButton
                                    selected={activeCueIndex() === index()}
                                    onClick={() => setActiveCueIndex(index())}
                                    divider
                                >
                                    <Checkbox
                                        size="small"
                                        checked={selectedCueIds().has(entry.media.id)}
                                        disabled={entry.lifecycle.approved_take_count === 0}
                                        title={entry.lifecycle.approved_take_count === 0 ? 'Approve a take before finishing early' : 'Select cue for Finish Early'}
                                        onClick={(event) => { event.stopPropagation(); toggleCueSelected(entry.media.id); }}
                                    />
                                    <ListItemText
                                        primary={entry.media.name}
                                        secondary={`${mediaTypeLabel(entry.media.media_type)} · ${entry.owner_name || 'Global'}${entry.bin_name ? ` · ${entry.bin_name}` : ''} · ${detail}`}
                                        primaryTypographyProps={{ fontWeight: 600 }}
                                    />
                                    <Chip label={state.label} color={state.color} size="small" variant="outlined" />
                                </ListItemButton>;
                            }}</For>
                        </List>
                    </Paper>

                    <Paper variant="outlined" sx={{ flex: 1, minWidth: 0, p: 2 }}>
                        <Show when={activeEntry()}>{(entry) => (
                            <>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                            <Typography variant="h6">{entry().media.name}</Typography>
                                            <Chip label={mediaTypeLabel(entry().media.media_type)} size="small" color="primary" />
                                            <Chip
                                                label={`${entry().lifecycle.approved_take_count}/${entry().lifecycle.approval_target} approved`}
                                                size="small"
                                                color={entry().lifecycle.approved_take_count > 0 ? 'success' : 'default'}
                                                variant="outlined"
                                            />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary">
                                            {entry().owner_name || 'Global'}{entry().bin_name ? ` · ${entry().bin_name}` : ''}
                                        </Typography>
                                    </Box>
                                    <Tooltip title="Open the complete cue editor">
                                        <IconButton size="small" onClick={() => props.onOpenMedia(entry().media.id)} aria-label="Open full cue">
                                            <OpenInNewIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>

                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
                                    <Button size="small" onClick={selectVisibleUndecided} disabled={visibleTakes().every((take) => take.status !== 'new')}>
                                        Select undecided
                                    </Button>
                                    <Button size="small" onClick={() => setSelectedTakeIds(new Set())} disabled={selectedVisibleTakes().length === 0}>
                                        Clear
                                    </Button>
                                    <Button
                                        size="small"
                                        color="success"
                                        variant="contained"
                                        startIcon={<ThumbUpIcon />}
                                        disabled={selectedApprovableTakes().length === 0 || Boolean(bulkDecision())}
                                        onClick={() => void decideSelected('approved')}
                                    >
                                        Approve valid selected ({selectedApprovableTakes().length})
                                    </Button>
                                    <Button
                                        size="small"
                                        color="error"
                                        variant="contained"
                                        startIcon={<ThumbDownIcon />}
                                        disabled={selectedVisibleTakes().length === 0 || Boolean(bulkDecision())}
                                        onClick={() => void decideSelected('rejected')}
                                    >
                                        Reject selected ({selectedVisibleTakes().length})
                                    </Button>
                                    <Typography variant="caption" color="text.secondary">
                                        Maximum {MAX_BULK_REVIEW_TAKES} visible takes per bulk decision.
                                    </Typography>
                                </Box>
                                <Divider sx={{ mb: 1 }} />

                                <Show when={visibleTakes().length > 0} fallback={
                                    <Alert severity="info">No takes exist for this cue yet. Open the cue to generate one.</Alert>
                                }>
                                    <Box sx={{ display: 'flex', gap: 1, mb: 1, overflowX: 'auto', pb: 0.5 }}>
                                        <For each={visibleTakes()}>{(take, index) => {
                                            const takeState = statusLabels[take.status] || statusLabels.new;
                                            return <Button
                                                size="small"
                                                variant={activeTakeIndex() === index() ? 'contained' : 'outlined'}
                                                color={take.status === 'approved' ? 'success' : take.status === 'rejected' ? 'error' : 'primary'}
                                                onClick={() => setActiveTakeIndex(index())}
                                                sx={{ flexShrink: 0 }}
                                            >
                                                Take {take.take_number} · {takeState.label}
                                            </Button>;
                                        }}</For>
                                    </Box>

                                    <Show when={activeTake()}>{(take) => {
                                        const takeState = () => statusLabels[take().status] || statusLabels.new;
                                        const isSelectedDeliverable = () => (entry().media.selected_take_ids || []).includes(take().id);
                                        const isVisual = () => entry().media.media_type === 'image' || entry().media.media_type === 'video';
                                        return (
                                            <Box
                                                sx={{
                                                    border: 1,
                                                    borderColor: selectedTakeIds().has(take().id) ? 'primary.main' : 'divider',
                                                    borderRadius: 1,
                                                    p: 1.5,
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                                                    <Checkbox
                                                        size="small"
                                                        checked={selectedTakeIds().has(take().id)}
                                                        onChange={() => toggleTakeSelected(take().id)}
                                                        inputProps={{ 'aria-label': `Select take ${take().take_number} for bulk review` }}
                                                    />
                                                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                                        {take().filename || `Take ${take().take_number}`}
                                                    </Typography>
                                                    <Chip label={takeState().label} color={takeState().color} size="small" />
                                                    <Show when={take().technical_status === 'invalid'}>
                                                        <Chip label="Technically invalid" color="error" size="small" />
                                                    </Show>
                                                    <Chip
                                                        label={isSelectedDeliverable() ? 'Selected deliverable' : 'Not selected for export'}
                                                        color={isSelectedDeliverable() ? 'warning' : 'default'}
                                                        variant="outlined"
                                                        size="small"
                                                    />
                                                </Box>

                                                <Show when={take().technical_status === 'invalid'}>
                                                    <Alert severity="error" sx={{ mb: 1 }}>
                                                        This candidate is preserved for diagnosis but cannot be approved,
                                                        selected, rendered, or published.
                                                        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                                                            <For each={take().technical_issues || []}>
                                                                {(issue) => <li>{issue.message}</li>}
                                                            </For>
                                                        </Box>
                                                    </Alert>
                                                </Show>

                                                <Show when={isVisual()} fallback={
                                                    <Box sx={{ mb: 1 }}>
                                                        <Show when={audioLoadState() === 'loading'}>
                                                            <Box aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                                                <CircularProgress size={16} />
                                                                <Typography variant="caption">Loading audio preview…</Typography>
                                                            </Box>
                                                        </Show>
                                                        <audio
                                                            controls
                                                            preload="metadata"
                                                            src={mediaUrlForPath(take().path)}
                                                            aria-label={`Audio take: ${take().filename || `take ${take().take_number}`}`}
                                                            onLoadedMetadata={() => setAudioLoadState('loaded')}
                                                            onCanPlay={() => setAudioLoadState('loaded')}
                                                            onError={() => setAudioLoadState('error')}
                                                            style={{ width: '100%' }}
                                                        />
                                                        <Show when={audioLoadState() === 'error'}>
                                                            <Alert severity="error" aria-live="assertive" sx={{ mt: 0.5 }}>
                                                                Could not load audio preview for {take().filename || `take ${take().take_number}`}.
                                                            </Alert>
                                                        </Show>
                                                    </Box>
                                                }>
                                                    <TakePreview take={take()} mediaType={entry().media.media_type} />
                                                </Show>

                                                <Box aria-label="Review take metadata" sx={{ display: 'flex', gap: '0.25rem 0.75rem', flexWrap: 'wrap', mb: 1 }}>
                                                    <Typography variant="caption">Type: {mediaTypeLabel(entry().media.media_type)}</Typography>
                                                    <Typography variant="caption">Format: {String(take().format || 'unknown').toUpperCase()}</Typography>
                                                    <Typography variant="caption">{formatBytes(take().size_bytes)}</Typography>
                                                    <Typography variant="caption">{formatDuration(take().duration_sec)}</Typography>
                                                    <Typography variant="caption">
                                                        Provider: {take().generation_params?.provider || take().generated_by || 'unknown'}
                                                    </Typography>
                                                    <Show when={!isVisual()}>
                                                        <Typography variant="caption">
                                                            {take().sample_rate ? `${take().sample_rate} Hz` : 'sample rate unknown'}
                                                        </Typography>
                                                        <Typography variant="caption">
                                                            {take().channels ? `${take().channels} channel${take().channels === 1 ? '' : 's'}` : 'channels unknown'}
                                                        </Typography>
                                                    </Show>
                                                </Box>

                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Button
                                                        color="success"
                                                        variant={take().status === 'approved' ? 'contained' : 'outlined'}
                                                        startIcon={<ThumbUpIcon />}
                                                        disabled={take().technical_status === 'invalid' || decisionBusy().has(take().id) || Boolean(bulkDecision())}
                                                        onClick={() => void decideTake(take(), take().status === 'approved' ? 'new' : 'approved')}
                                                    >
                                                        {take().status === 'approved' ? 'Undo approval' : 'Approve'}
                                                    </Button>
                                                    <Button
                                                        color="error"
                                                        variant={take().status === 'rejected' ? 'contained' : 'outlined'}
                                                        startIcon={<ThumbDownIcon />}
                                                        disabled={decisionBusy().has(take().id) || Boolean(bulkDecision())}
                                                        onClick={() => void decideTake(take(), take().status === 'rejected' ? 'new' : 'rejected')}
                                                    >
                                                        {take().status === 'rejected' ? 'Undo rejection' : 'Reject'}
                                                    </Button>
                                                    <Show when={decisionBusy().has(take().id)}>
                                                        <CircularProgress size={20} aria-label="Saving review decision" />
                                                    </Show>
                                                </Box>
                                            </Box>
                                        );
                                    }}</Show>
                                </Show>
                            </>
                        )}</Show>
                    </Paper>
                </Box>
            </Show>
            <Dialog open={confirmFinishOpen()} onClose={() => !finishing() && setConfirmFinishOpen(false)}>
                <DialogTitle>Finish selected cues early?</DialogTitle>
                <DialogContent>
                    This marks {finishableSelected().length} selected cue{finishableSelected().length === 1 ? '' : 's'} complete using the approved take{finishableSelected().length === 1 ? '' : 's'} already reviewed. It will stop further automatic generation for them.
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmFinishOpen(false)} disabled={finishing()}>Cancel</Button>
                    <Button onClick={finishSelected} color="success" variant="contained" disabled={finishing()}>{finishing() ? 'Finishing…' : 'Finish early'}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
