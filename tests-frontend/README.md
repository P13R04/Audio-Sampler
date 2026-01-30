# Frontend Test Suite

This directory contains tests for the Audio Sampler frontend without requiring a GUI.

## Running Tests

### Quick Test
```bash
bash test-sampler.sh
```

### Verbose Output
```bash
bash test-sampler.sh --verbose
```

## What Gets Tested

1. **Backend Connectivity** - API health check
2. **Preset Fetching** - Can retrieve presets from backend
3. **JavaScript Syntax** - All JS files are valid
4. **HTML Structure** - Required elements present
5. **CSS** - Styles file exists and is valid
6. **API Configuration** - Correct backend URL configured
7. **Web Components** - Audio sampler component properly defined
8. **Dependencies** - Required libraries documented
9. **Project Structure** - All required directories exist
10. **Documentation** - README and project documentation present

## Headless Testing

The sampler's audio engine (`js/soundutils.js`) can be tested without the GUI by importing the functions directly:

```javascript
import { loadAndDecodeSound, playSound } from './soundutils.js';

// Test headless audio
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const buffer = await loadAndDecodeSound('https://audio-sampler-x9kz.onrender.com/presets/808/Kick 808X.wav', ctx);
playSound(ctx, buffer, 0, buffer.duration, 1);
```

## Manual Testing Checklist

- [ ] Load sampler at https://audio-sampler-pads.vercel.app
- [ ] Select a preset (e.g., "808")
- [ ] Click on different pads - each plays a sound
- [ ] Use keyboard (AZERTY or QWERTY) to play pads
- [ ] Check waveform displays when sound loads
- [ ] Test trim functionality
- [ ] Record audio with microphone
- [ ] Upload a new preset
- [ ] Test on mobile device
- [ ] Test with MIDI controller (if available)
- [ ] Switch themes
- [ ] Test on different browsers

## CI/CD Integration

These tests can be integrated into GitHub Actions or other CI/CD pipelines:

```yaml
- name: Run Frontend Tests
  run: bash tests-frontend/test-sampler.sh
```

## Notes

- Tests require `node` and `curl` to be installed
- Backend must be accessible (or tests will warn)
- HTML and CSS validation is basic - use browser DevTools for full validation
- JavaScript syntax checking uses Node's built-in validator
