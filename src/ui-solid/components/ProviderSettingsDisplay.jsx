import { createSignal, Show, For } from 'solid-js';
import { Box, Typography } from '@suid/material';
import { ExpandLess, ExpandMore } from '@suid/icons-material';
import Collapse from './Collapse.jsx';

export default function ProviderSettingsDisplay(props) {
    const [expanded, setExpanded] = createSignal(false);

    return (
        <Box sx={{ mt: 3, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Box
                sx={{
                    p: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    '&:hover': { bgcolor: 'action.hover' }
                }}
                onClick={() => setExpanded(!expanded())}
            >
                <Typography variant="body2" sx={{ fontSize: '1rem', fontWeight: 400 }}>
                    Provider Settings
                </Typography>
                {expanded() ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
            </Box>

            <Collapse in={expanded()} timeout="auto" unmountOnExit>
                <Box sx={{ p: 2, pt: 0 }}>
                    {/* Dialogue Provider */}
                    <Box sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
                            Dialogue
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Provider: {props.actor.provider_settings?.dialogue?.provider || 'manual'}
                            <Show when={props.actor.provider_settings?.dialogue?.voice_id}>
                                <> • Voice ID: {props.actor.provider_settings.dialogue.voice_id}</>
                            </Show>
                        </Typography>
                        <Show when={props.actor.provider_settings?.dialogue?.provider === 'elevenlabs'}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                Approved: {props.actor.provider_settings.dialogue.approval_count_default || 1} •
                                Candidates: {props.actor.provider_settings.dialogue.min_candidates || 1} •
                                Stability: {props.actor.provider_settings.dialogue.stability || 0.5} •
                                Similarity: {props.actor.provider_settings.dialogue.similarity_boost || 0.75}
                            </Typography>
                        </Show>
                    </Box>

                    {/* Music Provider */}
                    <Box sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
                            Music
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Provider: {props.actor.provider_settings?.music?.provider || 'manual'}
                            <Show when={props.actor.provider_settings?.music?.provider === 'elevenlabs'}>
                                <> • Approved: {props.actor.provider_settings.music.approval_count_default || 1} •
                                    Candidates: {props.actor.provider_settings.music.min_candidates || 1}</>
                            </Show>
                        </Typography>
                    </Box>

                    {/* SFX Provider */}
                    <Box sx={{ mb: 1, p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 500 }}>
                            SFX
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Provider: {props.actor.provider_settings?.sfx?.provider || 'manual'}
                            <Show when={props.actor.provider_settings?.sfx?.provider === 'elevenlabs'}>
                                <> • Approved: {props.actor.provider_settings.sfx.approval_count_default || 1} •
                                    Candidates: {props.actor.provider_settings.sfx.min_candidates || 1}</>
                            </Show>
                        </Typography>
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
}
