import { createSignal, Show } from 'solid-js';
import { Box, Paper, Typography } from '@suid/material';

/**
 * A basic Tooltip implementation for SolidJS/SUID
 * Since SUID doesn't currently export a Tooltip component
 */
export default function Tooltip(props) {
    const [open, setOpen] = createSignal(false);

    return (
        <Box
            sx={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...props.sx
            }}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            {props.children}
            <Show when={open() && props.title}>
                <Paper
                    sx={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        bgcolor: 'rgba(50, 50, 50, 0.95)',
                        color: 'common.white',
                        px: 1,
                        py: 0.5,
                        mb: 1,
                        zIndex: 2000,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        transition: 'opacity 0.2s',
                        ...(props.tooltipSx || {})
                    }}
                    elevation={6}
                >
                    <Typography variant="caption" sx={{ fontWeight: 500, pointerEvents: 'none' }}>
                        {props.title}
                    </Typography>
                </Paper>
            </Show>
        </Box>
    );
}
