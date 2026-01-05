import { createSignal } from 'solid-js';
import { Box, Typography, TextField, Button, Stack, Divider } from '@suid/material';

export default function RootView(props) {
    // props: actorOps, sceneOps, error
    const [actorName, setActorName] = createSignal('');
    const [sceneName, setSceneName] = createSignal('');

    const handleAddActor = async () => {
        if (!actorName().trim()) return;
        await props.actorOps.createActor({ display_name: actorName() });
        setActorName('');
    };

    const handleAddScene = async () => {
        if (!sceneName().trim()) return;
        await props.sceneOps.createScene({ name: sceneName() });
        setSceneName('');
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Project Overview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Manage actors and scenes.
            </Typography>

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Actor
                </Typography>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Actor name (e.g. Hero, Narrator, Merchant)"                    on:input={(e) => setActorName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddActor()}
                    sx={{ mb: 2 }}
                />

                <Button
                    variant="contained"
                    size="small"
                    disabled={!actorName().trim() || props.actorOps.creating()}
                    onClick={handleAddActor}
                    sx={{ mb: 4 }}
                >
                    {props.actorOps.creating() ? 'Creating…' : 'Add Actor'}
                </Button>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Scene
                </Typography>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Scene name (e.g. Intro, Battle_01, End_Credits)"                    on:input={(e) => setSceneName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddScene()}
                    sx={{ mb: 2 }}
                />

                <Button
                    variant="contained"
                    size="small"
                    disabled={!sceneName().trim() || props.sceneOps.creating()}
                    onClick={handleAddScene}
                >
                    {props.sceneOps.creating() ? 'Creating…' : 'Add Scene'}
                </Button>
            </Box>

            {(props.error || props.actorOps.error() || props.sceneOps.error()) && (
                <Typography color="error" variant="body2" sx={{ mt: 2 }}>
                    {props.error || props.actorOps.error() || props.sceneOps.error()}
                </Typography>
            )}
        </Box>
    );
}
