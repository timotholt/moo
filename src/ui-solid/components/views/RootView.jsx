import { createSignal } from 'solid-js';
import { Box, Typography, TextField, Button, Stack } from '@suid/material';

export default function RootView(props) {
    // props: actorOps, error
    const [actorName, setActorName] = createSignal('');

    const handleAddActor = async () => {
        if (!actorName().trim()) return;
        await props.actorOps.createActor({ display_name: actorName() });
        setActorName('');
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                actors
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Manage voice actors and their content.
            </Typography>

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Actor
                </Typography>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Actor name (e.g. Hero, Narrator, Merchant)"
                    value={actorName()}
                    onChange={(e) => setActorName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddActor()}
                    sx={{ mb: 2 }}
                />

                <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!actorName().trim() || props.actorOps.creating()}
                        onClick={handleAddActor}
                    >
                        {props.actorOps.creating() ? 'Creating…' : 'Add Actor'}
                    </Button>
                </Stack>
            </Box>

            {(props.error || props.actorOps.error()) && (
                <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                    {props.error || props.actorOps.error()}
                </Typography>
            )}
        </Box>
    );
}
