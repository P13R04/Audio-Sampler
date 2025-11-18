// ====== MAIN.JS REFACTORED - Audio Sampler ======
// Point d'entrée principal du sampler (orchestration)
// Ce fichier est une version refactorisée de `main.js` et conserve la
// logique d'initialisation, de chargement des presets et d'orchestration
// des différents modules (waveform, keyboard, presets, UI).

import { loadAndDecodeSound, playSound } from './soundutils.js';
import { pixelToSeconds, formatTime, formatSampleNameFromUrl } from './utils.js';
import { 
  fetchPresets, 
  normalizePresets, 
  fillPresetSelect,
  extractFileName,
  blobToDataURL 
} from './presets-manager.js';
import { applyTheme, setupThemeSelect } from './theme-manager.js';
import { 
  showStatus as showStatusHelper, 
  showError as showErrorHelper, 
  resetButtons,
  updateTimeInfo as updateTimeInfoHelper,
  updateSampleName as updateSampleNameHelper,
  stopCurrentPlayback as stopPlaybackHelper
} from './ui-helpers.js';
import { KeyboardManager } from './keyboard-manager.js';
import { createSavedSamplesUI, addSavedSampleToPreset as addSampleHelper } from './samples-manager.js';
import {
  createInstrumentFromBufferUrl,
  createInstrumentFromSavedSample,
  createPresetFromSavedSampleSegments,
  createPresetFromBufferSegments,
  createInstrumentFromAudioBuffer
} from './instrument-creator.js';
import {
  createWaveformUI,
  drawWaveform,
  createAnimateOverlay,
  setupOverlayMouseEvents,
  showWaveformForSound
} from './waveform-renderer.js';

// ====== CONFIG ======
const API_BASE = 'http://localhost:3000';
const PRESETS_URL = `${API_BASE}/api/presets`;

// ====== GLOBAL STATE ======
let ctx;
let presetSelect, buttonsContainer, statusEl, errorEl;
let presets = [];
let decodedSounds = [];
let currentPresetIndex = 0;
const trimPositions = new Map();

// Waveform UI elements
let waveformCanvas, overlayCanvas, trimbarsDrawer;
let leftTrimLabel, rightTrimLabel;
let timeInfoEl = null;
let sampleNameEl = null;
let mousePos = { x: 0, y: 0 };
let currentShownBuffer = null;
let currentShownUrl = null;
let currentShownPadIndex = null;
let currentShownSampleName = null;

// Playback state
let currentSource = null;
let playStartCtxTime = 0;
let playStartSec = 0;
let playEndSec = 0;

// Keyboard manager
let keyboardManager;

// ====== UI HELPERS (wrapped) ======
function showStatus(msg) { showStatusHelper(statusEl, msg); }
function showError(msg) { showErrorHelper(errorEl, statusEl, msg); }
function stopCurrentPlayback() { 
  currentSource = stopPlaybackHelper(currentSource); 
}

function updateTimeInfo() {
  updateTimeInfoHelper(
    timeInfoEl,
    currentShownBuffer,
    currentShownUrl,
    trimPositions,
    trimbarsDrawer,
    waveformCanvas
  );
}

function updateSampleName() {
  updateSampleNameHelper(sampleNameEl, currentShownPadIndex, currentShownSampleName);
}

// ====== MAIN FUNCTION ======
