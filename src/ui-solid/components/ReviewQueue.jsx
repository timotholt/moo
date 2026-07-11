import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItemButton, ListItemText, Typography } from '@suid/material';
import RefreshIcon from '@suid/icons-material/Refresh';
import DoneAllIcon from '@suid/icons-material/DoneAll';
import { getReviewQueue, updateMedia } from '../api/client.ts';

const labels = {
    ready_for_review: { label: 'Ready to review', color: 'warning' },
    needs_generation: { label: 'Needs a new take', color: 'info' },
    not_generated: { label: 'Not generated', color: 'default' },
};

export default function ReviewQueue(props) {
    const [items, setItems] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [selectedIds, setSelectedIds] = createSignal(new Set());
    const [activeIndex, setActiveIndex] = createSignal(0);
    const [confirmFinishOpen, setConfirmFinishOpen] = createSignal(false);
    const [finishing, setFinishing] = createSignal(false);

    const selectedItems = createMemo(() => items().filter((entry) => selectedIds().has(entry.media.id)));
    const finishableSelected = createMemo(() => selectedItems().filter((entry) => entry.lifecycle.approved_take_count > 0));

    const loadQueue = async () => {
        setLoading(true);
        try {
            const data = await getReviewQueue();
            setItems(data.items || []);
            setSelectedIds((current) => new Set([...current].filter((id) => data.items?.some((entry) => entry.media.id === id))));
            setActiveIndex((current) => Math.max(0, Math.min(current, Math.max(0, (data.items?.length || 1) - 1))));
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

    const toggleSelected = (mediaId) => {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(mediaId)) next.delete(mediaId);
            else next.add(mediaId);
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
            setSelectedIds(new Set());
            await loadQueue();
            if (props.onRefresh) props.onRefresh();
        } finally {
            setFinishing(false);
        }
    };

    const handleKeyDown = (event) => {
        if (items().length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'j') {
            event.preventDefault();
            setActiveIndex((index) => Math.min(items().length - 1, index + 1));
        } else if (event.key === 'ArrowUp' || event.key === 'k') {
            event.preventDefault();
            setActiveIndex((index) => Math.max(0, index - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const entry = items()[activeIndex()];
            if (entry) props.onOpenMedia(entry.media.id);
        } else if (event.key === ' ') {
            event.preventDefault();
            const entry = items()[activeIndex()];
            if (entry) toggleSelected(entry.media.id);
        }
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Review Queue
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={loadQueue} disabled={loading()}>
                    Refresh
                </Button>
                <Button size="small" color="success" startIcon={<DoneAllIcon />} onClick={() => setConfirmFinishOpen(true)} disabled={finishableSelected().length === 0 || finishing()}>
                    Finish selected ({finishableSelected().length})
                </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Unfinished cues only. Finish Early removes a cue as soon as you have a take you like.
                Use ↑/↓ or j/k to move, Enter to open, and Space to select.
            </Typography>

            <Show when={error()}><Alert severity="error" sx={{ mb: 2 }}>{error()}</Alert></Show>
            <Show when={loading()}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
            </Show>
            <Show when={!loading() && items().length === 0}>
                <Alert severity="success">Nothing needs attention. Your authoring queue is clear.</Alert>
            </Show>
            <Show when={!loading() && items().length > 0}>
                <List disablePadding tabIndex={0} onKeyDown={handleKeyDown} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, outline: 'none' }}>
                    <For each={items()}>{(entry, index) => {
                        const state = labels[entry.kind] || labels.not_generated;
                        const detail = entry.lifecycle.new_take_count > 0
                            ? `${entry.lifecycle.new_take_count} new · ${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved`
                            : entry.lifecycle.take_count > 0
                                ? `${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved · generate another take`
                                : 'Generate the first take';
                        return <ListItemButton selected={activeIndex() === index()} onMouseEnter={() => setActiveIndex(index())} onClick={() => props.onOpenMedia(entry.media.id)} divider>
                            <Checkbox
                                size="small"
                                checked={selectedIds().has(entry.media.id)}
                                disabled={entry.lifecycle.approved_take_count === 0}
                                title={entry.lifecycle.approved_take_count === 0 ? 'Approve a take before finishing early' : 'Select for Finish Early'}
                                onClick={(event) => { event.stopPropagation(); toggleSelected(entry.media.id); }}
                            />
                            <ListItemText
                                primary={entry.media.name}
                                secondary={`${entry.owner_name || 'Global'}${entry.bin_name ? ` · ${entry.bin_name}` : ''} · ${detail}`}
                                primaryTypographyProps={{ fontWeight: 600 }}
                            />
                            <Chip label={state.label} color={state.color} size="small" variant="outlined" />
                        </ListItemButton>;
                    }}</For>
                </List>
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
