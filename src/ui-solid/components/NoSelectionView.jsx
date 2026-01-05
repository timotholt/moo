import { Box, Typography } from '@suid/material';

export default function NoSelectionView(props) {
    // props: error
    return (
        <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3, minWidth: 0 }}>
            <Typography variant="h6" sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                MOO - Media Output Organizer
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select an item from the tree on the left to get started:
            </Typography>

            <Box sx={{ ml: 2, mb: 2 }}>
                <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    • Defaults - Configure global provider settings
                </Typography>
                <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    • Actors - View and manage individual actors
                </Typography>
                <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    • Scenes - View and manage individual scenes
                </Typography>
            </Box>

            <Typography variant="body2" color="text.secondary">
                To create new actors, bins, or media, navigate to the relevant project items in the tree view.
            </Typography>

            {props.error && (
                <Typography color="error" variant="body2" sx={{ mt: 2 }}>
                    {props.error}
                </Typography>
            )}
        </Box>
    );
}
