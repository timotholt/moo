import React, { useState, useEffect, useMemo, useCallback } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import { GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import AppBarShell from './components/AppBarShell.jsx';
import ProjectShell from './components/ProjectShell.jsx';
import StatusBar from './components/StatusBar.jsx';
import AudioPlayerBar from './components/AudioPlayerBar.jsx';
import WelcomeScreen from './components/WelcomeScreen.jsx';
import { getProviderCredits } from './api/client.js';

// Font size multipliers
const FONT_SIZE_SCALES = {
  small: 0.875,
  medium: 1,
  large: 1.125,
};

export default function App() {
  // Load settings from localStorage
  const [themeMode, setThemeMode] = useState(() => {
    return localStorage.getItem('audiomanager-theme-mode') || 'dark';
  });
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('audiomanager-font-size') || 'medium';
  });
  const [blankSpaceConversion, setBlankSpaceConversion] = useState(() => {
    return localStorage.getItem('audiomanager-blank-space-conversion') || 'underscore';
  });
  const [capitalizationConversion, setCapitalizationConversion] = useState(() => {
    return localStorage.getItem('audiomanager-capitalization-conversion') || 'lowercase';
  });
  const [statusText, setStatusText] = useState('');
  const [providerCredits, setProviderCredits] = useState('');
  const [currentProject, setCurrentProject] = useState(null);

  // Global audio player state
  const [currentTake, setCurrentTake] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayTake = useCallback((take) => {
    const audioPath = (take.path || '').replace(/\\/g, '/');
    // If same take, just ensure it plays (handles replay)
    if (currentTake?.id === take.id) {
      setIsPlaying(true); // Signal to replay
    } else {
      setCurrentTake(take);
      setAudioUrl(`/media/${audioPath}`);
    }
    setIsPlaying(true);
  }, [currentTake?.id]);

  // Called when playback ends - keep audio loaded but clear "playing" indicator
  const handlePlaybackEnd = useCallback(() => {
    // Don't clear currentTake or audioUrl - keep player loaded
    // Just clear the playing state so tree shows correct status
    setIsPlaying(false);
  }, []);

  // Called when user clicks stop in detail pane
  const handleStopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Only called when user explicitly wants to clear the player
  const handleClosePlayer = useCallback(() => {
    setCurrentTake(null);
    setAudioUrl(null);
  }, []);

  // Clear audio player when project changes or becomes null
  useEffect(() => {
    setCurrentTake(null);
    setAudioUrl(null);
    setIsPlaying(false);
  }, [currentProject]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('audiomanager-theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem('audiomanager-font-size', fontSize);
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('audiomanager-blank-space-conversion', blankSpaceConversion);
  }, [blankSpaceConversion]);

  useEffect(() => {
    localStorage.setItem('audiomanager-capitalization-conversion', capitalizationConversion);
  }, [capitalizationConversion]);

  // Fetch provider credits (currently ElevenLabs)
  const refreshCredits = useCallback(async () => {
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
  }, []);

  // Load credits on startup and refresh every 15 seconds (only when project selected)
  useEffect(() => {
    if (!currentProject) return;
    refreshCredits();
    const interval = setInterval(refreshCredits, 15000);
    return () => clearInterval(interval);
  }, [refreshCredits, currentProject]);

  // Create theme based on settings
  const theme = useMemo(() => {
    const scale = FONT_SIZE_SCALES[fontSize] || 1;
    return createTheme({
      palette: {
        mode: themeMode,
        ...(themeMode === 'dark' && {
          text: {
            primary: 'hsla(0, 0%, 100%, 0.7)', // Soft white as default
            secondary: 'hsla(0, 0%, 100%, 0.7)', // Soft white
            disabled: 'hsla(0, 0%, 100%, 0.38)', // Gray for disabled/no takes
          },
          success: {
            main: 'hsla(123, 38%, 57%, 0.8)', // Softer green
            light: 'hsla(123, 38%, 72%, 1)', // Bright green for hover/selected
          },
          error: {
            main: 'hsla(4, 60%, 58%, 0.7)', // Softer red with moderate saturation
            light: 'hsla(4, 60%, 72%, 1)', // Bright red for hover/selected
          },
          warning: {
            main: 'hsl(32, 100%, 45%)', // Darker yellow, full saturation
            light: 'hsl(32, 100%, 60%)', // Bright yellow for hover/selected
          },
          common: {
            white: 'hsla(0, 0%, 100%, 1)', // Bright white for hover/selected
          },
        }),
      },
      typography: {
        fontSize: 14 * scale,
      },
    });
  }, [themeMode, fontSize]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles
        styles={{
          body: {
            lineHeight: 'normal', // Override Material-UI's default 1.5 line-height
          },
          // Custom scrollbar styling - subtle and semi-transparent
          '*::-webkit-scrollbar': {
            width: '8px',
            height: '8px',
          },
          '*::-webkit-scrollbar-track': {
            background: 'transparent',
          },
          '*::-webkit-scrollbar-thumb': {
            background: themeMode === 'dark' 
              ? 'rgba(255, 255, 255, 0.2)' 
              : 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
            '&:hover': {
              background: themeMode === 'dark' 
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
            scrollbarColor: themeMode === 'dark'
              ? 'rgba(255, 255, 255, 0.2) transparent'
              : 'rgba(0, 0, 0, 0.2) transparent',
          },
        }}
      />
      <Box sx={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <AppBarShell 
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          blankSpaceConversion={blankSpaceConversion}
          onBlankSpaceConversionChange={setBlankSpaceConversion}
          capitalizationConversion={capitalizationConversion}
          onCapitalizationConversionChange={setCapitalizationConversion}
          currentProject={currentProject}
          onProjectChange={setCurrentProject}
        />
        {currentProject ? (
          <ProjectShell 
            key={currentProject?.name || 'no-project'}
            currentProject={currentProject}
            blankSpaceConversion={blankSpaceConversion} 
            capitalizationConversion={capitalizationConversion}
            onStatusChange={setStatusText}
            onCreditsRefresh={refreshCredits}
            onPlayTake={handlePlayTake}
            onStopPlayback={handleStopPlayback}
            currentPlayingTakeId={isPlaying ? currentTake?.id : null}
          />
        ) : (
          <WelcomeScreen onProjectChange={setCurrentProject} />
        )}
        <AudioPlayerBar
          currentTake={currentTake}
          audioUrl={audioUrl}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
        />
        <StatusBar 
          statusText={statusText}
          providerCredits={providerCredits}
        />
      </Box>
    </ThemeProvider>
  );
}
