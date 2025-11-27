import React, { useState, useEffect, useMemo } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import { GlobalStyles, ThemeProvider, createTheme } from '@mui/material';
import AppBarShell from './components/AppBarShell.jsx';
import ProjectShell from './components/ProjectShell.jsx';

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
        />
      </Box>
    </ThemeProvider>
  );
}
