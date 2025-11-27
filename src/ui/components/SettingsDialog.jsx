import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { DESIGN_SYSTEM } from '../theme/designSystem.js';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

export default function SettingsDialog({ 
  open, 
  onClose,
  themeMode,
  onThemeModeChange,
  fontSize,
  onFontSizeChange,
  blankSpaceConversion,
  onBlankSpaceConversionChange,
  capitalizationConversion,
  onCapitalizationConversionChange
}) {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="settings tabs">
            <Tab label="Theme" id="settings-tab-0" aria-controls="settings-tabpanel-0" />
            <Tab label="Filename" id="settings-tab-1" aria-controls="settings-tabpanel-1" />
          </Tabs>
        </Box>
        
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Theme Mode</InputLabel>
              <Select
                value={themeMode}
                label="Theme Mode"
                onChange={(e) => onThemeModeChange(e.target.value)}
              >
                <MenuItem value="light">Light</MenuItem>
                <MenuItem value="dark">Dark</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Font Size</InputLabel>
              <Select
                value={fontSize}
                label="Font Size"
                onChange={(e) => onFontSizeChange(e.target.value)}
              >
                <MenuItem value="small">Small</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="large">Large</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Blank Space Conversion</InputLabel>
              <Select
                value={blankSpaceConversion || 'underscore'}
                label="Blank Space Conversion"
                onChange={(e) => onBlankSpaceConversionChange(e.target.value)}
              >
                <MenuItem value="underscore">Convert blank spaces to underscores (recommended)</MenuItem>
                <MenuItem value="delete">Delete blank spaces from filenames</MenuItem>
                <MenuItem value="keep">Leave blank spaces</MenuItem>
              </Select>
            </FormControl>
            
            <FormControl size="small" fullWidth sx={DESIGN_SYSTEM.components.formControl}>
              <InputLabel>Capitalization Conversion</InputLabel>
              <Select
                value={capitalizationConversion || 'lowercase'}
                label="Capitalization Conversion"
                onChange={(e) => onCapitalizationConversionChange(e.target.value)}
              >
                <MenuItem value="lowercase">Convert to lower case (recommended)</MenuItem>
                <MenuItem value="keep">Leave capitals as is</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </TabPanel>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
