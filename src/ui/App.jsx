import React, { useState, useEffect, useMemo, useCallback } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import { GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import AppBarShell from './components/AppBarShell.jsx';
import ProjectShell from './components/ProjectShell.jsx';
import StatusBar from './components/StatusBar.jsx';
import AudioPlayerBar from './components/AudioPlayerBar.jsx';
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

  // Load credits on startup
  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  // Create theme based on settings
  const theme = useMemo(() => {
    const scale = FONT_SIZE_SCALES[fontSize] || 1;
    return createTheme({
      palette: {
        mode: themeMode,
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
        />
        <ProjectShell 
          blankSpaceConversion={blankSpaceConversion} 
          capitalizationConversion={capitalizationConversion}
          onStatusChange={setStatusText}
          onCreditsRefresh={refreshCredits}
          onPlayTake={handlePlayTake}
          onStopPlayback={handleStopPlayback}
          currentPlayingTakeId={isPlaying ? currentTake?.id : null}
        />
        <AudioPlayerBar
          currentTake={currentTake}
          audioUrl={audioUrl}
          isPlaying={isPlaying}
          onPlayingChange={setIsPlaying}
          onPlaybackEnd={handlePlaybackEnd}
        />
        <StatusBar 
          statusText={statusText}
          providerCredits={providerCredits}
        />
      </Box>
    </ThemeProvider>
  );
}
