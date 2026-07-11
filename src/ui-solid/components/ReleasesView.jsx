import { createEffect, createSignal, For, Show } from 'solid-js';
import { Alert, Box, Button, CircularProgress, List, ListItem, ListItemText, Typography } from '@suid/material';
import RefreshIcon from '@suid/icons-material/Refresh';
import { getReleases } from '../api/client.ts';

export default function ReleasesView(props) {
    const [releases, setReleases] = createSignal([]);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal(null);
    const loadReleases = async () => {
        setLoading(true);
        try {
            const data = await getReleases();
            setReleases(data.releases || []);
            setError(null);
        } catch (err) {
            setError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };
    createEffect(() => { props.refreshToken; void loadReleases(); });
    return <Box sx={{ flexGrow: 1, overflow: 'auto', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="h6" sx={{ flexGrow: 1, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Published Releases</Typography>
            <Button size="small" startIcon={<RefreshIcon />} onClick={loadReleases} disabled={loading()}>Refresh</Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Immutable export packages created from explicitly selected approved takes.</Typography>
        <Show when={error()}><Alert severity="error" sx={{ mb: 2 }}>{error()}</Alert></Show>
        <Show when={loading()}><Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box></Show>
        <Show when={!loading() && releases().length === 0}><Alert severity="info">No releases published yet.</Alert></Show>
        <Show when={!loading() && releases().length > 0}><List disablePadding sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <For each={releases()}>{(release) => <ListItem divider><ListItemText primary={release.release_id} secondary={`${release.exported_count} asset${release.exported_count === 1 ? '' : 's'} · ${new Date(release.created_at).toLocaleString()} · ${release.manifest_path}`} /></ListItem>}</For>
        </List></Show>
    </Box>;
}
