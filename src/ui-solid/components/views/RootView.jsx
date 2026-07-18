import { createSignal } from 'solid-js';
import { Box, Typography, Button, Stack, Divider } from '@suid/material';
import TextInput from '../TextInput.jsx';
import { createCard } from '../../api/client.js';

export default function RootView(props) {
    // props: actorOps, sceneOps, error
    const [actorName, setActorName] = createSignal('');
    const [sceneName, setSceneName] = createSignal('');
    const [cardName, setCardName] = createSignal('');
    const [cardCreating, setCardCreating] = createSignal(false);
    const [cardError, setCardError] = createSignal(null);

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

    const handleAddCard = async () => {
        const name = cardName().trim();
        if (!name || cardCreating()) return;
        setCardCreating(true);
        setCardError(null);
        try {
            const result = await createCard({ name });
            setCardName('');
            await props.onRefresh?.();
            props.onSelect?.({ type: 'card', id: result.card.id });
        } catch (err) {
            setCardError(err.message || String(err));
        } finally {
            setCardCreating(false);
        }
    };

    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Project Overview
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Manage actors, scenes, and cards.
            </Typography>

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Actor
                </Typography>
                <Stack direction="row" spacing={1}>
                    <TextInput
                        fullWidth
                        size="small"
                        placeholder="Actor name (e.g. Hero, Narrator)"
                        value={actorName()}
                        onValueChange={setActorName}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddActor()}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!actorName().trim() || props.actorOps.creating()}
                        onClick={handleAddActor}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {props.actorOps.creating() ? 'Creating…' : 'Add Actor'}
                    </Button>
                </Stack>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Card
                </Typography>
                <Stack direction="row" spacing={1}>
                    <TextInput
                        fullWidth
                        size="small"
                        placeholder="Card name (e.g. Signal Flare)"
                        value={cardName()}
                        onValueChange={setCardName}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCard()}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!cardName().trim() || cardCreating()}
                        onClick={handleAddCard}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {cardCreating() ? 'Creating…' : 'Add Card'}
                    </Button>
                </Stack>
            </Box>

            <Divider sx={{ my: 4 }} />

            <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Add New Scene
                </Typography>
                <Stack direction="row" spacing={1}>
                    <TextInput
                        fullWidth
                        size="small"
                        placeholder="Scene name (e.g. Intro, Battle_01)"
                        value={sceneName()}
                        onValueChange={setSceneName}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddScene()}
                    />
                    <Button
                        variant="contained"
                        size="small"
                        disabled={!sceneName().trim() || props.sceneOps.creating()}
                        onClick={handleAddScene}
                        sx={{ whiteSpace: 'nowrap' }}
                    >
                        {props.sceneOps.creating() ? 'Creating…' : 'Add Scene'}
                    </Button>
                </Stack>
            </Box>

            {(props.error || props.actorOps.error() || props.sceneOps.error() || cardError()) && (
                <Typography color="error" variant="body2" sx={{ mt: 2 }}>
                    {props.error || props.actorOps.error() || props.sceneOps.error() || cardError()}
                </Typography>
            )}
        </Box>
    );
}
