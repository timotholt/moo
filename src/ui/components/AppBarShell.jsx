import React, { useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import SettingsIcon from '@mui/icons-material/Settings';
import SettingsDialog from './SettingsDialog.jsx';

export default function AppBarShell({ 
  themeMode, 
  onThemeModeChange, 
  fontSize, 
  onFontSizeChange,
  blankSpaceConversion,
  onBlankSpaceConversionChange,
  capitalizationConversion,
  onCapitalizationConversionChange
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <AppBar position="fixed" color="default" elevation={1} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            VO Foundry
          </Typography>
          <IconButton
            size="small"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        themeMode={themeMode}
        onThemeModeChange={onThemeModeChange}
        fontSize={fontSize}
        onFontSizeChange={onFontSizeChange}
        blankSpaceConversion={blankSpaceConversion}
        onBlankSpaceConversionChange={onBlankSpaceConversionChange}
        capitalizationConversion={capitalizationConversion}
        onCapitalizationConversionChange={onCapitalizationConversionChange}
      />
    </>
  );
}
