import { TextField } from '@suid/material';

/**
 * TextInput - A reliable text input component that works around SUID/SolidJS quirks
 * 
 * Usage:
 *   <TextInput 
 *     value={mySignal()} 
 *     onValueChange={(newValue) => setMySignal(newValue)}
 *     placeholder="Enter text"
 *   />
 * 
 * This component uses uncontrolled input with onChange to avoid the common
 * SUID TextField issues with controlled inputs in SolidJS.
 */
export default function TextInput(props) {
    const handleChange = (e) => {
        if (props.onValueChange) {
            props.onValueChange(e.target.value);
        }
    };

    return (
        <TextField
            {...props}
            onChange={handleChange}
            // Remove our custom props so they don't get passed to TextField
            onValueChange={undefined}
        />
    );
}
