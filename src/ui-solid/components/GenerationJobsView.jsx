import { createEffect, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, Chip, CircularProgress, List, ListItem, ListItemText, Typography } from '@suid/material';
import RefreshIcon from '@suid/icons-material/Refresh';
import ReplayIcon from '@suid/icons-material/Replay';
import CancelIcon from '@suid/icons-material/Cancel';
import { cancelGenerationJob, getGenerationJobs, retryGenerationJob } from '../api/client.ts';

function formatDate(iso) {
    return iso ? new Date(iso).toLocaleString() : 'in progress';
}

export default function GenerationJobsView(props) {
    const [jobs, setJobs] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const [retryingId, setRetryingId] = createSignal(null);
    const [cancellingId, setCancellingId] = createSignal(null);

    const loadJobs = async () => {
        setLoading(true);
        try {
            const data = await getGenerationJobs();
            setJobs((data.jobs || []).slice().sort((a, b) => b.started_at.localeCompare(a.started_at)));
            setError(null);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    const cancel = async (job) => {
        setCancellingId(job.id);
        try {
            await cancelGenerationJob(job.id);
            await loadJobs();
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setCancellingId(null);
        }
    };

    const retry = async (job) => {
        setRetryingId(job.id);
        try {
            await retryGenerationJob(job.id);
            await loadJobs();
            if (props.onRefresh) props.onRefresh();
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setRetryingId(null);
        }
    };

    createEffect(() => {
        props.refreshToken;
        void loadJobs();
    });

    return <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Generation Jobs</Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadJobs} disabled={loading()}>Refresh</Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Persisted generation history. Failed jobs can be retried with their original scope.</Typography>
        <Show when={error()}><Alert severity="error" sx={{ mb: 2 }}>{error()}</Alert></Show>
        <Show when={loading()}><Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box></Show>
        <Show when={!loading() && jobs().length === 0}><Alert severity="info">No generation jobs yet.</Alert></Show>
        <Show when={!loading() && jobs().length > 0}><List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <For each={jobs()}>{(job) => <ListItem divider secondaryAction={
                job.status === 'running' ? <Button size="small" color="warning" startIcon={<CancelIcon />} onClick={() => cancel(job)} disabled={cancellingId() === job.id || Boolean(job.cancel_requested_at)}>
                    {job.cancel_requested_at ? 'Stopping after current…' : cancellingId() === job.id ? 'Stopping…' : 'Stop after current'}
                </Button> : job.status === 'failed' ? <Button size="small" startIcon={<ReplayIcon />} onClick={() => retry(job)} disabled={retryingId() === job.id}>
                    {retryingId() === job.id ? 'Retrying…' : 'Retry'}
                </Button> : undefined
            }>
                <ListItemText
                    primary={`Generated ${job.total_takes_created} take${job.total_takes_created === 1 ? '' : 's'} across ${job.total_media} cue${job.total_media === 1 ? '' : 's'}`}
                    secondary={`${formatDate(job.started_at)} · ${job.request?.media_type || 'all media'}${job.request?.dry_run ? ' · preview' : ''}${job.items?.filter(item => item.error).length ? ` · ${job.items.filter(item => item.error).length} error(s)` : ''}`}
                />
                <Chip label={job.status} color={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : 'warning'} size="small" variant="outlined" sx={{ mr: job.status === 'failed' || job.status === 'running' ? 16 : 0 }} />
            </ListItem>}</For>
        </List></Show>
    </Box>;
}
