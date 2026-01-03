import { Box, Typography } from '@suid/material';

export default function DefaultsView() {
    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Provider Defaults
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Configure default settings for all content types. Individual actors can inherit these settings or override with custom values.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                Select a specific content type (Dialogue, Music, or SFX) from the tree to configure its default settings.
            </Typography>
        </Box>
    );
}
