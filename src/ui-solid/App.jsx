import { createSignal, createEffect, createMemo, onCleanup } from 'solid-js';
import { Box, CssBaseline, ThemeProvider, createTheme, GlobalStyles } from '@suid/material';
import AppBarShell from './components/AppBarShell.jsx';
import ProjectShell from './components/ProjectShell.jsx';
import StatusBar from './components/StatusBar.jsx';
import AudioPlayerBar from './components/AudioPlayerBar.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import { getProviderCredits, backfillTakes } from './api/client.js';

// Font size multipliers
const FONT_SIZE_SCALES = {
    small: 0.875,
    medium: 1,
    large: 1.125,
};

export default function App() {
    // Load settings - SUID/Solid signals handle initialization once
    const [themeMode, setThemeMode] = createSignal(
        localStorage.getItem('audiomanager-theme-mode') || 'dark'
    );
    const [fontSize, setFontSize] = createSignal(
        localStorage.getItem('audiomanager-font-size') || 'medium'
    );
    const [blankSpaceConversion, setBlankSpaceConversion] = createSignal(
        localStorage.getItem('audiomanager-blank-space-conversion') || 'underscore'
    );
    const [capitalizationConversion, setCapitalizationConversion] = createSignal(
        localStorage.getItem('audiomanager-capitalization-conversion') || 'lowercase'
    );

    const [statusText, setStatusText] = createSignal('');
    const [providerCredits, setProviderCredits] = createSignal('');
    const [currentProject, setCurrentProject] = createSignal(null);
    const [backfillRunning, setBackfillRunning] = createSignal(false);

    // Solid: Refs are variables or assigned via ref prop
    let projectShellRef;

    // Global audio player state
    const [currentTake, setCurrentTake] = createSignal(null);
    const [audioUrl, setAudioUrl] = createSignal(null);
    const [isPlaying, setIsPlaying] = createSignal(false);

    const handlePlayTake = (take) => {
        const audioPath = (take.path || '').replace(/\\/g, '/');
        // If same take, just ensure it plays (handles replay)
        if (currentTake()?.id === take.id) {
            setIsPlaying(true);
        } else {
            setCurrentTake(take);
            setAudioUrl(`/media/${audioPath}`);
        }
        setIsPlaying(true);
    };

    const handleStopPlayback = () => {
        setIsPlaying(false);
    };

    // Clear audio player when project changes
    createEffect(() => {
        // Dependency on currentProject()
        currentProject();
        // Effect logic
        setCurrentTake(null);
        setAudioUrl(null);
        setIsPlaying(false);
    });

    const handleBackfillAll = async () => {
        if (backfillRunning()) return;
        setBackfillRunning(true);
        setStatusText('Backfilling all incomplete cues...');
        try {
            const result = await backfillTakes();
            console.log('[Backfill] Result:', result);
            if (result.total_generated > 0) {
                setStatusText(`Backfill complete: generated ${result.total_generated} take(s)`);
                // Reload project data
                if (projectShellRef?.reloadData) {
                    await projectShellRef.reloadData();
                }
            } else {
                setStatusText('Backfill complete: no takes needed');
            }
            setTimeout(() => setStatusText(''), 3000);
        } catch (err) {
            console.error('[Backfill] Error:', err);
            setStatusText(`Backfill failed: ${err.message}`);
            setTimeout(() => setStatusText(''), 5000);
        } finally {
            setBackfillRunning(false);
        }
    };

    // Persist settings
    createEffect(() => localStorage.setItem('audiomanager-theme-mode', themeMode()));
    createEffect(() => localStorage.setItem('audiomanager-font-size', fontSize()));
    createEffect(() => localStorage.setItem('audiomanager-blank-space-conversion', blankSpaceConversion()));
    createEffect(() => localStorage.setItem('audiomanager-capitalization-conversion', capitalizationConversion()));

    // fetch credits
    const refreshCredits = async () => {
        try {
            const data = await getProviderCredits();
            if (data && typeof data.remaining_credits === 'number') {
                const formatted = data.remaining_credits.toLocaleString();
                setProviderCredits(`ElevenLabs: ${formatted} characters remaining`);
            } else if (data && data.raw && typeof data.raw.character_limit === 'number') {
                const remaining = Math.max(0, data.raw.character_limit - (data.raw.character_count || 0));
                const formatted = remaining.toLocaleString();
                setProviderCredits(`ElevenLabs: ${formatted} characters remaining`);
            } else {
                setProviderCredits('ElevenLabs: credits unavailable');
            }
        } catch (err) {
            setProviderCredits('ElevenLabs: credits unavailable');
        }
    };

    createEffect(() => {
        if (!currentProject()) return;
        refreshCredits();
        const interval = setInterval(refreshCredits, 15000);
        onCleanup(() => clearInterval(interval));
    });

    const theme = createMemo(() => {
        const scale = FONT_SIZE_SCALES[fontSize()] || 1;
        const mode = themeMode();

        return createTheme({
            palette: {
                mode: mode,
                ...(mode === 'dark' && {
                    text: {
                        primary: 'hsla(0, 0%, 100%, 0.7)',
                        secondary: 'hsla(0, 0%, 100%, 0.7)',
                        disabled: 'hsla(0, 0%, 100%, 0.38)',
                    },
                    success: {
                        main: 'hsla(123, 38%, 57%, 0.8)',
                        light: 'hsla(123, 38%, 72%, 1)',
                    },
                    error: {
                        main: 'hsla(4, 60%, 58%, 0.7)',
                        light: 'hsla(4, 60%, 72%, 1)',
                    },
                    warning: {
                        main: 'hsl(32, 100%, 45%)',
                        light: 'hsl(32, 100%, 60%)',
                    },
                    common: {
                        white: 'hsla(0, 0%, 100%, 1)',
                    },
                }),
            },
            typography: {
                fontSize: 14 * scale,
            },
        });
    });

    return (
        <ThemeProvider theme={theme()}>
            <CssBaseline />
            <GlobalStyles
                styles={{
                    body: {
                        lineHeight: 'normal',
                    },
                    // FIX: Force SUID icons to standard size if internal style injection fails
                    '.MuiSvgIcon-root': {
                        width: '1em !important',
                        height: '1em !important',
                        display: 'inline-block',
                        fontSize: 'inherit',
                        flexShrink: 0,
                        userSelect: 'none',
                    },
                    '.MuiListItemIcon-root': {
                        minWidth: 'auto !important',
                    },
                    // Custom scrollbar styling
                    '*::-webkit-scrollbar': {
                        width: '8px',
                        height: '8px',
                    },
                    '*::-webkit-scrollbar-track': {
                        background: 'transparent',
                    },
                    '*::-webkit-scrollbar-thumb': {
                        background: themeMode() === 'dark'
                            ? 'rgba(255, 255, 255, 0.2)'
                            : 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '4px',
                        '&:hover': {
                            background: themeMode() === 'dark'
                                ? 'rgba(255, 255, 255, 0.3)'
                                : 'rgba(0, 0, 0, 0.3)',
                        },
                    },
                    '*::-webkit-scrollbar-corner': {
                        background: 'transparent',
                    },
                    // Firefox scrollbar styling
                    '*': {
                        scrollbarWidth: 'thin',
                        scrollbarColor: themeMode() === 'dark'
                            ? 'rgba(255, 255, 255, 0.2) transparent'
                            : 'rgba(0, 0, 0, 0.2) transparent',
                    },
                }}
            />
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
                <AppBarShell
                    themeMode={themeMode()}
                    onThemeModeChange={setThemeMode}
                    fontSize={fontSize()}
                    onFontSizeChange={setFontSize}
                    blankSpaceConversion={blankSpaceConversion()}
                    onBlankSpaceConversionChange={setBlankSpaceConversion}
                    capitalizationConversion={capitalizationConversion()}
                    onCapitalizationConversionChange={setCapitalizationConversion}
                    currentProject={currentProject()}
                    onProjectChange={setCurrentProject}
                    onBackfillAll={handleBackfillAll}
                    backfillRunning={backfillRunning()}
                />
                <Box sx={{ flexGrow: 1, mt: 5, mb: 11, overflow: 'auto' }}>
                    {currentProject() ? (
                        <ProjectShell
                            ref={projectShellRef}
                            currentProject={currentProject()}
                            blankSpaceConversion={blankSpaceConversion()}
                            capitalizationConversion={capitalizationConversion()}
                            onStatusChange={setStatusText}
                            onCreditsRefresh={refreshCredits}
                            onPlayTake={handlePlayTake}
                            onStopPlayback={handleStopPlayback}
                            currentPlayingTakeId={isPlaying() ? currentTake()?.id : null}
                        />
                    ) : (
                        <WelcomeScreen onProjectChange={setCurrentProject} />
                    )}
                </Box>
                <AudioPlayerBar
                    currentTake={currentTake()}
                    audioUrl={audioUrl()}
                    isPlaying={isPlaying()}
                    onPlayingChange={setIsPlaying}
                />
                <StatusBar
                    statusText={statusText()}
                    providerCredits={providerCredits()}
                />
            </Box>
        </ThemeProvider>
    );
}
