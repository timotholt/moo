// Unified Design System for AudioManager UI
// Use these constants throughout the application for consistency

export const DESIGN_SYSTEM = {
  // Typography Scale
  typography: {
    // Main content headers
    pageTitle: { fontSize: '1.1rem', fontWeight: 600 },
    
    // Section headers
    sectionTitle: { fontSize: '0.9rem', fontWeight: 500 },
    
    // Body text
    body: { fontSize: '0.8rem', fontWeight: 400 },
    
    // Secondary/helper text
    caption: { fontSize: '0.75rem', fontWeight: 400 },
    
    // Small buttons and labels
    small: { fontSize: '0.7rem', fontWeight: 400 },
  },
  
  // Spacing Scale (rem units)
  spacing: {
    // Container padding
    containerPadding: '1rem',
    
    // Section spacing
    sectionGap: '1.5rem',
    
    // Element spacing
    elementGap: '0.75rem',
    
    // Component spacing
    componentGap: '0.5rem',
    
    // Tight spacing
    tightGap: '0.25rem',
  },
  
  // Component Sizes
  components: {
    // Form controls
    inputHeight: '2rem',
    buttonHeight: '1.75rem',
    
    // Containers
    borderRadius: '0.25rem',
    borderWidth: '1px',
    
    // Compact form control styles
    formControl: {
      '& .MuiInputBase-root': {
        minHeight: '2rem',
        fontSize: '0.8rem',
      },
      '& .MuiInputLabel-root': {
        fontSize: '0.8rem',
        '&.MuiInputLabel-shrunk': {
          fontSize: '0.75rem',
        },
      },
      '& .MuiSelect-select': {
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '8px',
        paddingRight: '8px',
        fontSize: '0.8rem',
      },
      '& .MuiOutlinedInput-input': {
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '8px',
        paddingRight: '8px',
        fontSize: '0.8rem',
      },
      '& .MuiOutlinedInput-input.MuiInputBase-inputMultiline': {
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '8px',
        paddingRight: '8px',
        fontSize: '0.8rem',
      },
      '& .MuiInputBase-multiline': {
        padding: '0',
      },
      '& textarea.MuiOutlinedInput-input': {
        paddingTop: '4px',
        paddingBottom: '4px',
        paddingLeft: '8px',
        paddingRight: '8px',
        fontSize: '0.8rem',
      },
      '& .MuiFormHelperText-root': {
        fontSize: '0.7rem',
        marginTop: '2px',
      },
    },
  },
  
  // Colors (semantic)
  colors: {
    text: {
      primary: 'text.primary',
      secondary: 'text.secondary',
      disabled: 'text.disabled',
    },
    border: 'divider',
    background: {
      paper: 'background.paper',
      default: 'background.default',
    },
  },
  
  // Tree item styles with status color classes
  treeItem: {
    display: 'flex',
    alignItems: 'flex-end',
    minHeight: '1.25rem',
    py: 0,
    '& .MuiListItemText-root': { margin: 0 },
    '& .MuiListItemIcon-root': {
      minWidth: 'auto',
      display: 'flex',
      alignItems: 'flex-end',
      marginBottom: '2px', // Alignment tweak for icons to sit on baseline
    },
    // Green status colors
    '&.status-green': {
      '& .MuiListItemText-primary': { color: 'success.main' },
      '& .MuiListItemIcon-root svg': { color: 'success.main' },
    },
    '&.status-green:hover, &.status-green.Mui-selected': {
      '& .MuiListItemText-primary': { color: 'success.light' },
      '& .MuiListItemIcon-root svg': { color: 'success.light' },
    },
    // Red status colors
    '&.status-red': {
      '& .MuiListItemText-primary': { color: 'error.main' },
      '& .MuiListItemIcon-root svg': { color: 'error.main' },
    },
    '&.status-red:hover, &.status-red.Mui-selected': {
      '& .MuiListItemText-primary': { color: 'error.light' },
      '& .MuiListItemIcon-root svg': { color: 'error.light' },
    },
    // Yellow status colors
    '&.status-yellow': {
      '& .MuiListItemText-primary': { color: 'warning.main' },
      '& .MuiListItemIcon-root svg': { color: 'warning.main' },
    },
    '&.status-yellow:hover, &.status-yellow.Mui-selected': {
      '& .MuiListItemText-primary': { color: 'warning.light' },
      '& .MuiListItemIcon-root svg': { color: 'warning.light' },
    },
    // Gray status colors
    '&.status-gray': {
      '& .MuiListItemText-primary': { color: 'text.disabled' },
      '& .MuiListItemIcon-root svg': { color: 'text.disabled' },
    },
    '&.status-gray:hover, &.status-gray.Mui-selected': {
      '& .MuiListItemText-primary': { color: 'common.white' },
      '& .MuiListItemIcon-root svg': { color: 'common.white' },
    },
    // White status colors
    '&.status-white': {
      '& .MuiListItemText-primary': { color: 'text.secondary' },
      '& .MuiListItemIcon-root svg': { color: 'text.secondary' },
    },
    '&.status-white:hover, &.status-white.Mui-selected': {
      '& .MuiListItemText-primary': { color: 'common.white' },
      '& .MuiListItemIcon-root svg': { color: 'common.white' },
    },
    // Selected item styling
    '&.Mui-selected': {
      backgroundColor: 'action.selected',
      '& .MuiListItemText-primary': {
        fontWeight: 500,
      },
    },
    '&.Mui-selected:hover': {
      backgroundColor: 'action.selected',
    },
  },
};

// Helper function to get consistent sx props
export const getTypographySx = (variant) => DESIGN_SYSTEM.typography[variant] || DESIGN_SYSTEM.typography.body;

export const getSpacingSx = (variant) => DESIGN_SYSTEM.spacing[variant] || DESIGN_SYSTEM.spacing.componentGap;
