import { createSignal } from 'solid-js';
import { AppBar, Toolbar, Typography, Box, Button, IconButton } from '@suid/material';
import SettingsIcon from '@suid/icons-material/Settings';
import AutoFixHighIcon from '@suid/icons-material/AutoFixHigh';
import SettingsDialog from './SettingsDialog.jsx';
import ProjectSelector from './ProjectSelector.jsx';

export default function AppBarShell(props) {
    const [settingsOpen, setSettingsOpen] = createSignal(false);

    return (
        <>
            <AppBar position="static" color="default" elevation={1} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar variant="dense" disableGutters sx={{ minHeight: 40, py: 0.25, px: '0.5rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                        <Typography
                            variant="body1"
                            sx={{ fontWeight: 600, fontSize: '1rem', mr: 0.5, color: 'primary.main', display: 'flex', alignItems: 'center' }}
                            noWrap
                        >
                            <span style={{ "margin-right": "8px", "font-size": "1.2rem" }}>🐮</span>
                            MOO
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ fontWeight: 400, fontSize: '0.7rem', color: 'text.disabled', mt: 0.5 }}
                            noWrap
                        >
                            Media Organizer of Organizers
                        </Typography>
                    </Box>
                    <ProjectSelector
                        currentProject={props.currentProject}
                        onProjectChange={props.onProjectChange}
                    />
                    <Box sx={{ flexGrow: 1 }} />
                    {props.currentProject && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AutoFixHighIcon />}
                            onClick={props.onBackfillAll}
                            disabled={props.backfillRunning}
                            sx={{ mr: 1, fontSize: '0.75rem', py: 0.25 }}
                            title="Generate takes for all incomplete cues"
                        >
                            {props.backfillRunning ? 'Backfilling...' : 'Backfill All'}
                        </Button>
                    )}
                    <IconButton
                        size="small"
                        onClick={() => setSettingsOpen(true)}
                        aria-label="Settings"
                        sx={{ p: 0.5 }}
                    >
                        <SettingsIcon fontSize="small" />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <SettingsDialog
                open={settingsOpen()}
                onClose={() => setSettingsOpen(false)}
                themeMode={props.themeMode}
                onThemeModeChange={props.onThemeModeChange}
                fontSize={props.fontSize}
                onFontSizeChange={props.onFontSizeChange}
                blankSpaceConversion={props.blankSpaceConversion}
                onBlankSpaceConversionChange={props.onBlankSpaceConversionChange}
                capitalizationConversion={props.capitalizationConversion}
                onCapitalizationConversionChange={props.onCapitalizationConversionChange}
            />
        </>
    );
}
