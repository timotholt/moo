import { Box, Typography } from '@suid/material';

/**
 * A basic Slider implementation for SolidJS/SUID
 * using native HTML5 range input styled to match MUI.
 */
export default function Slider(props) {
    return (
        <Box sx={{ width: '100%', py: 1, ...props.sx }}>
            <input
                type="range"
                min={props.min ?? 0}
                max={props.max ?? 100}
                step={props.step ?? 1}
                value={props.value ?? 0}
                onInput={(e) => {
                    const val = parseFloat(e.target.value);
                    if (props.onChange) {
                        props.onChange(e, val);
                    }
                }}
                disabled={props.disabled}
                style={{
                    width: '100%',
                    cursor: props.disabled ? 'default' : 'pointer',
                    accentColor: '#1976d2', // Default MUI blue
                    margin: 0,
                }}
            />
        </Box>
    );
}
