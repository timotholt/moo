# TextField Migration Tracking

## ✅ Completed
- [x] WelcomeScreen.jsx (2 instances) - Simple text inputs

## 🔄 In Progress - Batch Replacement

### Simple Text Inputs (Safe to Replace)
- [ ] SceneView.jsx - Line 107, 129
- [ ] RootView.jsx - Line 35, 61
- [ ] ActorView.jsx - Line 130
- [ ] ViewConfigView.jsx - Line 169, 221, 381
- [ ] SettingsDialog.jsx - Line 233, 334, 412, 431
- [ ] SectionView.jsx - Line 99, 157, 164
- [ ] SectionManagement.jsx - Line 35
- [ ] ProviderSettingsEditor.jsx - Line 288, 296, 341, 366, 377
- [ ] DetailHeader.jsx - Line 27

### ⚠️ Special Cases (Need Verification)

#### Multiline TextFields
1. **ContentView.jsx - Line 397-405**
   - `multiline` prop
   - `rows={3}`
   - Used for prompt editing
   - **Status**: NEEDS TESTING

#### TextFields with on:input (Old Pattern)
1. **ContentView.jsx - Line 372-377**
   - Uses `on:input` (DOM event)
   - Name editing field
   - **Status**: NEEDS REPLACEMENT + TESTING

2. **ContentView.jsx - Line 397-405**
   - Uses `on:input` (DOM event)
   - Multiline prompt field
   - **Status**: NEEDS REPLACEMENT + TESTING

## 📋 Verification Checklist

After replacement, test:
- [ ] Can type in all fields
- [ ] Multiline fields work correctly
- [ ] Value updates propagate to signals
- [ ] onBlur/onChange events fire correctly
- [ ] Disabled states work
- [ ] AutoFocus works
- [ ] Placeholder text displays

## 🎯 Migration Strategy

1. Replace all simple text inputs first
2. Test each file after replacement
3. Handle multiline separately with extra testing
4. Document any issues found
