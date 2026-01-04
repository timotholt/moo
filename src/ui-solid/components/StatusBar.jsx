import { Show } from 'solid-js';
import { Box, Typography } from '@suid/material';

export default function StatusBar(props) {
    return (
        <Box
            sx={{
                p: 0.5,
                px: 2,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: (theme) => theme.zIndex.drawer + 1,
                minHeight: 24,
                width: '100%',
                flexShrink: 0,
            }}
        >
            <Typography variant="caption" color="text.secondary">
                <Show when={props.statusText} fallback="Ready">
                    {props.statusText}
                </Show>
            </Typography>
            <Show when={props.providerCredits}>
                <Typography variant="caption" color="text.secondary">
                    {props.providerCredits}
                </Typography>
            </Show>
        </Box>
    );
}
