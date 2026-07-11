import { createEffect, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, Chip, CircularProgress, List, ListItemButton, ListItemText, Typography } from '@suid/material';
import RefreshIcon from '@suid/icons-material/Refresh';
import { getReviewQueue } from '../api/client.ts';

const labels = {
    ready_for_review: { label: 'Ready to review', color: 'warning' },
    needs_generation: { label: 'Needs a new take', color: 'info' },
    not_generated: { label: 'Not generated', color: 'default' },
};

export default function ReviewQueue(props) {
    const [items, setItems] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);

    const loadQueue = async () => {
        setLoading(true);
        try {
            const data = await getReviewQueue();
            setItems(data.items || []);
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

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Review Queue
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={loadQueue} disabled={loading()}>
                    Refresh
                </Button>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Unfinished cues only. Finish Early removes a cue as soon as you have a take you like.
            </Typography>

            <Show when={error()}><Alert severity="error" sx={{ mb: 2 }}>{error()}</Alert></Show>
            <Show when={loading()}>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
            </Show>
            <Show when={!loading() && items().length === 0}>
                <Alert severity="success">Nothing needs attention. Your authoring queue is clear.</Alert>
            </Show>
            <Show when={!loading() && items().length > 0}>
                <List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    <For each={items()}>{(entry) => {
                        const state = labels[entry.kind] || labels.not_generated;
                        const detail = entry.lifecycle.new_take_count > 0
                            ? `${entry.lifecycle.new_take_count} new · ${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved`
                            : entry.lifecycle.take_count > 0
                                ? `${entry.lifecycle.approved_take_count}/${entry.lifecycle.approval_target} approved · generate another take`
                                : 'Generate the first take';
                        return <ListItemButton onClick={() => props.onOpenMedia(entry.media.id)} divider>
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
        </Box>
    );
}
