# TextInput Component

## Purpose
A reliable text input wrapper for SUID's TextField that eliminates common SolidJS input issues.

## The Problem
SUID's TextField has issues with controlled inputs in SolidJS:
- Using `value` + `onInput` causes input lockouts
- Using `on:input` (DOM events) breaks reactivity
- Inconsistent behavior across different scenarios

## The Solution
`TextInput` uses an **uncontrolled approach** with `onChange`, which works reliably every time.

## Usage

### Basic Example
```jsx
import TextInput from './components/TextInput.jsx';

function MyComponent() {
    const [name, setName] = createSignal('');

    return (
        <TextInput
            value={name()}
            onValueChange={setName}
            placeholder="Enter your name"
        />
    );
}
```

### With Additional Props
```jsx
<TextInput
    fullWidth
    size="small"
    placeholder="Project name"
    value={projectName()}
    onValueChange={setProjectName}
    disabled={loading()}
    autoFocus
    onKeyDown={(e) => {
        if (e.key === 'Enter') handleSubmit();
    }}
    sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
/>
```

## API

### Props
- **`value`**: Current value (from signal)
- **`onValueChange`**: Callback function that receives the new value
- **All SUID TextField props**: Passed through automatically

### Pattern
```jsx
// ✅ CORRECT - Always works
<TextInput 
    value={mySignal()} 
    onValueChange={setMySignal}
/>

// ❌ WRONG - Don't use TextField directly
<TextField 
    value={mySignal()} 
    onInput={(e) => setMySignal(e.target.value)}
/>
```

## Why This Works
1. **Uncontrolled input**: TextField manages its own state internally
2. **onChange event**: Fires reliably when value changes
3. **Simple callback**: `onValueChange` receives the new value directly
4. **No reactivity conflicts**: Avoids SolidJS/SUID interaction issues

## Migration Guide
Replace all TextField instances:

**Before:**
```jsx
<TextField
    value={name()}
    onInput={(e) => setName(e.target.value)}
/>
```

**After:**
```jsx
<TextInput
    value={name()}
    onValueChange={setName}
/>
```

## Future-Proof
Use `TextInput` for **all** text inputs in the app to avoid lockout issues.
