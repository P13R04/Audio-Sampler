// ====== AUDIO SAMPLER - Point d'entrée principal ======
// Orchestrateur principal du sampler audio avec architecture modulaire
// Gère l'initialisation, le chargement des presets, et la coordination des modules

import { loadAndDecodeSound, playSound } from './soundutils.js';
import TrimbarsDrawer from './trimbarsdrawer.js';
import { pixelToSeconds, formatTime, formatSampleNameFromUrl } from './utils.js';
import { fetchPresets, normalizePresets, fillPresetSelect, extractFileName, blobToDataURL } from './presets-manager.js';
import { applyTheme, setupThemeSelect, teardownThemeSelect } from './theme-manager.js';
import { showStatus as showStatusHelper, showError as showErrorHelper, resetButtons as resetButtonsHelper, updateTimeInfo as updateTimeInfoHelper, updateSampleName as updateSampleNameHelper, stopCurrentPlayback as stopPlaybackHelper } from './ui-helpers.js';
import { KeyboardManager } from './keyboard-manager.js';
import { createInstrumentFromBufferUrl, createInstrumentFromSavedSample, createPresetFromSavedSampleSegments, createPresetFromBufferSegments, createInstrumentFromAudioBuffer } from './instrument-creator.js';
import { createWaveformUI as createWaveformUIHelper, drawWaveform, createAnimateOverlay, setupOverlayMouseEvents, showWaveformForSound as showWaveformHelper } from './waveform-renderer.js';
import { getStorageStats, checkStorageWarning, openCleanupDialog } from './storage-manager.js';
import { bus } from './event-bus.js';
import { PresetLoader } from './preset-loader.js';
import { isObjectUrl, getUrlFromEntry, revokeObjectUrlSafe, revokePresetBlobUrlsNotInNew, revokeAllBlobUrlsForPreset, decodeBlobToAudioBuffer } from './blob-utils.js';
import { revokeAllTrackedObjectUrls } from './blob-utils.js';
import { createUIMenus } from './ui-menus.js';

// ====== CONFIGURATION ET ORIGINES API ======
const API_BASE = 'http://localhost:3000';
const PRESETS_URL = `${API_BASE}/api/presets`;

// ====== CONTEXTE WEB AUDIO ======
let ctx;

// ====== ROOT DOM ACTIF ======
// Stocke le root actif (document ou shadowRoot) pour accéder au composant audio-sampler
let currentRoot = document;

// ====== ÉLÉMENTS UI ======
let presetSelect, buttonsContainer, statusEl, errorEl;

// ====== ÉTAT GLOBAL ======
// Liste des presets chargés depuis l'API
let presets = [];
// Sons décodés en mémoire
let decodedSounds = [];
// Index du preset actuellement sélectionné
let currentPresetIndex = 0;
// Map stockant les positions de trim pour chaque son (clé: URL, valeur: {start, end})
const trimPositions = new Map();

// URL/Blob helpers are centralized in `js/blob-utils.js` (imported above)

// ====== COMPOSANTS WAVEFORM ET OVERLAY ======
let waveformCanvas, overlayCanvas, trimbarsDrawer;
let leftTrimLabel, rightTrimLabel;
let timeInfoEl = null;
let sampleNameEl = null;
let mousePos = { x: 0, y: 0 };
// Note: les variables currentShownBuffer/Url/PadIndex/SampleName sont maintenant dans waveformState

// ====== ÉTAT DE LECTURE ======
// Source audio en cours de lecture
let currentSource = null;
// Temps de démarrage dans le contexte audio
let playStartCtxTime = 0;
// Position de départ en secondes dans le buffer
let playStartSec = 0;
// Position de fin en secondes dans le buffer
let playEndSec = 0;

// ====== GESTIONNAIRE DE CLAVIER ======
let keyboardManager;
let presetLoader;
// Référence exposée vers la méthode fournie par `PresetLoader`.
let loadPresetByIndex;
let ui = null;

// Handlers et flags pour le cycle de vie (start/stop)
let presetSelectChangeHandler = null;
let busSampleAddedHandler = null;
let samplerStarted = false;
// Element de select theme stocké pour teardown
let themeSelectEl = null;

// ====== ÉTAT PARTAGÉ POUR LE RENDU WAVEFORM ======
// Objet d'état passé aux fonctions du module waveform-renderer
let waveformState;

// ====== WRAPPERS D'INTERFACE ======
// Fonctions de convenance qui délèguent aux helpers UI avec le bon contexte

function showStatus(msg) { showStatusHelper(statusEl, msg); }
function showError(msg) { showErrorHelper(errorEl, statusEl, msg); }
function resetButtons() { resetButtonsHelper(buttonsContainer); }
function updateTimeInfo() {
  updateTimeInfoHelper(timeInfoEl, waveformState.currentShownBuffer, waveformState.currentShownUrl, trimPositions, trimbarsDrawer, waveformCanvas);
}
function updateSampleName() {
  updateSampleNameHelper(sampleNameEl, waveformState.currentShownPadIndex, waveformState.currentShownSampleName);
}
function stopCurrentPlayback() { 
  currentSource = stopPlaybackHelper(currentSource);
  if (waveformState) waveformState.currentSource = null;
}

/**
 * Crée l'objet de paramètres pour les fonctions de création d'instruments
 * Centralise toutes les dépendances nécessaires à la création d'instruments
 * @returns {Object} Objet contenant le contexte, les presets, et les callbacks
 */
function getInstrumentCreatorParams() {
  return {
    ctx,
    audioSamplerComp: currentRoot.querySelector('audio-sampler'),
    trimPositions,
    presets,
    fillPresetSelect: (sel, p) => fillPresetSelect(sel, p),
    presetSelect,
    loadPresetByIndex,
    showStatus,
    showError
  };
}

// ====== INITIALISATION PRINCIPALE ======
/**
 * Initialise et démarre le sampler audio
 * Point d'entrée principal qui configure tous les modules et charge les données
 * @param {Document|ShadowRoot} root - Root DOM où chercher les éléments (document ou shadowRoot pour web component)
 * @param {Object} options - Options de configuration (thème, etc.)
 */
export async function startSampler(root = document, options = {}) {
  
  // Stocker le root pour y accéder depuis les fonctions internes
  currentRoot = root;
  
  // Helper pour récupérer les éléments par ID dans le root fourni
  const $id = (id) => (root instanceof Document ? root.getElementById(id) : root.querySelector('#' + id));

  // Liaison des éléments UI au root choisi (document ou shadowRoot)
  presetSelect = $id('presetSelect');
  buttonsContainer = $id('buttonsContainer');
  statusEl = $id('status');
  errorEl = $id('error');
  // Element de sélection du thème (exposed in index.html / component)
  themeSelectEl = $id('themeSelect');

  // startSampler invoked
  ctx = new AudioContext();

  try {
    // 1) Récupère les presets du serveur
    showStatus('Chargement des presets...');
    const raw = await fetchPresets(PRESETS_URL);
    if (!raw) {
      throw new Error('Impossible de récupérer les presets depuis l\'API');
    }
    presets = normalizePresets(raw, API_BASE); // -> [{name, files:[absUrl,...]}]
    showStatus(`Presets normalisés: ${presets.length} presets`);

    // Conserver une copie originale des fichiers du preset pour pouvoir reset
    presets.forEach(p => { p.originalFiles = Array.isArray(p.files) ? [...p.files] : []; });

    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error('Aucun preset utilisable dans la réponse du serveur.');
    }

    // 2) Remplit le <select> avec les presets disponibles
    if (presetSelect) fillPresetSelect(presetSelect, presets);
    showStatus('Select presets rempli');

    // 3) Création de l'interface waveform (cachée jusqu'à la sélection d'un son)
    if (presetSelect) presetSelect.disabled = false;
    waveformState = createWaveformUIHelper(buttonsContainer, stopCurrentPlayback);
    // Assignation des variables globales pour rétro-compatibilité
    waveformCanvas = waveformState.waveformCanvas;
    overlayCanvas = waveformState.overlayCanvas;
    trimbarsDrawer = waveformState.trimbarsDrawer;
    leftTrimLabel = waveformState.leftTrimLabel;
    rightTrimLabel = waveformState.rightTrimLabel;
    timeInfoEl = waveformState.timeInfoEl;
    sampleNameEl = waveformState.sampleNameEl;
    
    // Ajout des propriétés d'état supplémentaires pour waveform-renderer
    waveformState.trimPositions = trimPositions;
    waveformState.currentShownBuffer = null;
    waveformState.currentShownUrl = null;
    waveformState.currentShownPadIndex = null;
    waveformState.currentShownSampleName = null;
    waveformState.updateTimeInfo = updateTimeInfo;
    waveformState.updateSampleName = updateSampleName;
    waveformState.mousePos = mousePos;
    // État de lecture pour l'animation
    waveformState.currentSource = null;
    waveformState.playStartCtxTime = 0;
    waveformState.playStartSec = 0;
    waveformState.playEndSec = 0;
    waveformState.ctx = ctx;
    // expose drawWaveform so theme-manager can request a redraw
    waveformState.drawWaveform = drawWaveform;
    // Fournit au loader un wrapper pour arrêter la lecture courante
    waveformState.stopCurrentPlayback = stopCurrentPlayback;
    
    // Démarrage de la boucle d'animation pour l'overlay waveform
    // createAnimateOverlay renvoie maintenant un objet { start, stop }
    const overlayAnimator = createAnimateOverlay(waveformState);
    const overlayMouseEvents = setupOverlayMouseEvents(overlayCanvas, trimbarsDrawer, mousePos, waveformState);
    // expose les handlers pour le stop depuis stopSampler
    waveformState.overlayAnimator = overlayAnimator;
    if (overlayMouseEvents && typeof overlayMouseEvents.stop === 'function') waveformState.overlayMouseStop = overlayMouseEvents.stop;
    overlayAnimator.start();
    
    // 4) Initialisation du KeyboardManager AVANT de charger le preset
    // Par défaut en AZERTY désormais
    keyboardManager = new KeyboardManager('azerty');
    keyboardManager.audioContext = ctx;
    // Attacher l'écouteur clavier global pour les raccourcis pads
    try { keyboardManager.bindKeyboard(); } catch (e) { console.warn('bindKeyboard failed', e); }
    // Propriété dynamique pour vérifier l'état du contexte audio
    Object.defineProperty(keyboardManager, 'audioContextResumed', {
      get: () => !!ctx && ctx.state === 'running',
      set: (val) => {} // ignore les sets
    });
    const layoutSelect = $id('keyboardLayout');
    if (layoutSelect) {
      keyboardManager.setupLayoutSelect(layoutSelect, buttonsContainer);
    }

    // Écouteur du select de presets : change de preset à la sélection
    if (presetSelect) {
      // Handler nommé pour pouvoir le retirer proprement lors du stop
      presetSelectChangeHandler = async (ev) => {
        const idx = Number(presetSelect.value);
        if (Number.isNaN(idx)) return;
        try {
          showStatus && showStatus('Chargement preset ' + (idx + 1) + '...');
          await loadPresetByIndex(idx);
        } catch (err) {
          showError && showError('Erreur chargement preset: ' + (err.message || err));
        }
      };
      presetSelect.addEventListener('change', presetSelectChangeHandler);
    }
    
    // Prepare PresetLoader (extrait) et expose `loadPresetByIndex`
    // Fournit la méthode chargée de créer la grille des pads
    // Ajoute un helper showWaveform sur waveformState attendu par le loader
    waveformState.showWaveform = (buffer, url, padIndex, sampleName) => {
      try { showWaveformHelper(buffer, url, padIndex, sampleName, waveformState); } catch (e) { console.warn('showWaveform helper failed', e); }
    };

    presetLoader = new PresetLoader({
      ctx,
      presets,
      trimPositions,
      keyboardManager,
      buttonsContainer,
      waveformState,
      waveformCanvas,
      trimbarsDrawer,
      statusEl,
      showStatus,
      showError,
      resetButtons,
      loadAndDecodeSound,
      playSound
      ,
      concurrency: (options && options.presetConcurrency) ? options.presetConcurrency : undefined
    });

    // Wrappe la méthode du loader pour tenir à jour `currentPresetIndex`
    // et révoquer les blob: URLs de l'ancien preset qui ne sont pas présentes
    // dans le nouveau (évite les fuites quand on remplace des presets).
    loadPresetByIndex = async (idx) => {
      const prevIndex = currentPresetIndex;
      try {
        if (prevIndex !== idx && Array.isArray(presets) && presets[prevIndex]) {
          const newFiles = (presets[idx] && presets[idx].files) || [];
          try { revokePresetBlobUrlsNotInNew(presets, trimPositions, prevIndex, newFiles); } catch (e) {}
        }
      } catch (e) { /* noop */ }
      currentPresetIndex = idx;
      return presetLoader.loadPresetByIndex(idx);
    };

    // Instancie le module UI (extrait) et lui passe les dépendances nécessaires
    try {
      ui = createUIMenus({
        getCurrentRoot: () => currentRoot,
        presets,
        trimPositions,
        loadPresetByIndex,
        showStatus,
        showError,
        getInstrumentCreatorParams,
        createPresetFromBufferSegments,
        createInstrumentFromSavedSample,
        createPresetFromSavedSampleSegments,
        createInstrumentFromBufferUrl,
        openCleanupDialog,
        fillPresetSelect,
        presetSelect,
        formatSampleNameFromUrl,
        extractFileName
      });
      // Construire les contrôles visibles (boutons Ajouter / Créer preset)
      try { if (ui && typeof ui.createSavedSamplesUI === 'function') ui.createSavedSamplesUI(); } catch (e) { console.warn('ui.createSavedSamplesUI failed', e); }
    } catch (e) {
      console.warn('createUIMenus failed', e);
    }

    // Configure le select de thème si présent afin d'appliquer et écouter les changements
    try {
      setupThemeSelect && setupThemeSelect(themeSelectEl, currentRoot, options, waveformState);
    } catch (e) { console.warn('setupThemeSelect failed', e); }

    // 5) Charge le premier preset par défaut
    showStatus('Chargement du preset initial...');
    await loadPresetByIndex(0);

    // 6) Intégration avec le Web Component d'enregistrement (POC)
    // Lorsqu'un sample est sauvegardé via le composant, on l'ajoute au preset courant
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');

    // Si le web component fournit ses propres contrôles, les masquer car
    // l'interface principale fournit un jeu de contrôles centralisés.
    try {
      if (audioSamplerComp && typeof audioSamplerComp.hideControls === 'function') {
        audioSamplerComp.hideControls();
      }
    } catch (e) { console.warn('hideControls call failed', e); }
    
    // Si le webcomponent audio-sampler expose une instance `recorder`, on
    // injecte le `AudioContext` principal pour éviter la création d'un
    // second contexte et la fermeture double.
    try {
      if (audioSamplerComp && audioSamplerComp.recorder) {
        try {
          // Réutiliser le `ctx` principal plutôt que d'en créer un autre
          audioSamplerComp.recorder.audioContext = ctx;
          // Mark recorder as not owning the context to avoid double-closing
          audioSamplerComp.recorder._ownsAudioContext = false;
        } catch (e) {
          console.warn('Failed to inject audioContext into recorder', e);
        }
      }
    } catch (e) { /* noop */ }

    // Le bus global permet désormais de réagir aux events émis par le composant
    // Remplacement sécurisé : ouvre le panneau d'ajout de son via le module UI
    busSampleAddedHandler = async (ev) => {
      return ui ? ui.openAddSoundMenu() : null;
    };
    bus.addEventListener('sampleadded', busSampleAddedHandler);

    // Marque le sampler comme démarré
    samplerStarted = true;

  } catch (err) {
    try { showError && showError('Erreur initialisation: ' + (err && (err.message || err))); } catch (e) { console.error('Erreur initialisation (fallback):', err); }
  }

}

/**
 * Arrête proprement le sampler et libère les ressources allouées.
 * - Retire les listeners globaux ajoutés par `startSampler`
 * - Arrête la lecture en cours
 * - Débind le gestionnaire de clavier
 * - Révoque les `blob:` URLs attachées aux presets
 * - Ferme l'AudioContext
 *
 * Idempotent : peut être appelé plusieurs fois sans effet indésirable.
 */
export async function stopSampler() {
  if (!samplerStarted) return;
  samplerStarted = false;

  // 1) Enlever le listener du <select> de presets
  try {
    if (presetSelect && presetSelectChangeHandler) {
      presetSelect.removeEventListener('change', presetSelectChangeHandler);
      presetSelectChangeHandler = null;
    }
  } catch (e) { console.warn('Failed to remove presetSelect handler', e); }

  // 2) Retirer le listener sur le bus d'évènements
  try {
    if (busSampleAddedHandler) {
      bus.removeEventListener('sampleadded', busSampleAddedHandler);
      busSampleAddedHandler = null;
    }
  } catch (e) { console.warn('Failed to remove bus handler', e); }

  // 3) Débind le clavier si nécessaire
  try {
    if (keyboardManager && typeof keyboardManager.unbindKeyboard === 'function') {
      keyboardManager.unbindKeyboard();
    }
  } catch (e) { console.warn('Failed to unbind keyboard', e); }

  // 4) Arrêter la lecture en cours et nettoyer l'état waveform
  try {
    stopCurrentPlayback();
    if (waveformState) {
      // Stop overlay animation and mouse handlers if présents
      try {
        if (waveformState.overlayAnimator && typeof waveformState.overlayAnimator.stop === 'function') {
          waveformState.overlayAnimator.stop();
        }
      } catch (e) { console.warn('Failed to stop overlay animator', e); }
      try {
        if (typeof waveformState.overlayMouseStop === 'function') waveformState.overlayMouseStop();
      } catch (e) { /* noop */ }

      waveformState.currentShownBuffer = null;
      waveformState.currentShownUrl = null;
      waveformState.currentShownPadIndex = null;
      waveformState.currentShownSampleName = null;
      // detach heavy refs
      waveformState.stopCurrentPlayback = null;
      waveformState.drawWaveform = null;
      waveformState.overlayAnimator = null;
      waveformState.overlayMouseStop = null;
    }
  } catch (e) { console.warn('Failed to stop playback / clear waveformState', e); }

  // 5) Révoquer les blob: URLs pour tous les presets chargés
  try {
    if (Array.isArray(presets) && presets.length) {
      for (let i = 0; i < presets.length; i++) {
        try { revokeAllBlobUrlsForPreset(presets, trimPositions, i); } catch (err) {}
      }
    }
    // Also revoke any tracked object URLs created via createTrackedObjectUrl
    try { revokeAllTrackedObjectUrls(); } catch (e) {}
  } catch (e) { console.warn('Failed to revoke blob urls', e); }

  // 6) Fermer l'AudioContext
  try {
    if (ctx && typeof ctx.close === 'function') {
      await ctx.close().catch(e => console.warn('AudioContext close failed', e));
    }
  } catch (e) { console.warn('Failed to close AudioContext', e); }
  ctx = null;

  // 7) Tenter de nettoyer le UI si disponible
  try {
    if (ui && typeof ui.destroy === 'function') {
      ui.destroy();
    }
  } catch (e) { /* noop */ }

  // 8) Teardown du select de thème si présent
  try {
    if (typeof teardownThemeSelect === 'function' && themeSelectEl) {
      teardownThemeSelect(themeSelectEl);
      themeSelectEl = null;
    }
  } catch (e) { /* noop */ }

  // 8) Nettoyage léger des containers DOM pour aider au GC (optionnel)
  try {
    if (buttonsContainer && buttonsContainer.parentElement) {
      // remove the waveform wrapper that was inserted after buttonsContainer
      const wrapper = buttonsContainer.parentElement.querySelector('.waveform-wrapper');
      if (wrapper && wrapper.remove) wrapper.remove();
    }
  } catch (e) { /* noop */ }

}

// UI wrapper functions: delegate to the extracted `ui` module when available.
function closeAddSoundMenu() {
  return ui && typeof ui.closeAddSoundMenu === 'function' ? ui.closeAddSoundMenu() : null;
}

async function openCreatePresetMenu() {
  return ui ? ui.openCreatePresetMenu() : null;
}

async function openAssemblePresetPanel(parentPanel) {
  return ui && typeof ui.openAssemblePresetPanel === 'function' ? ui.openAssemblePresetPanel(parentPanel) : null;
}

async function renderSavedSamplesList() {
  return ui && typeof ui.renderSavedSamplesList === 'function' ? ui.renderSavedSamplesList() : null;
}

async function addSavedSampleToPreset(id) {
  return ui && typeof ui.addSavedSampleToPreset === 'function' ? ui.addSavedSampleToPreset(id) : null;
}

async function addPresetSampleByUrl(url, name) {
  return ui && typeof ui.addPresetSampleByUrl === 'function' ? ui.addPresetSampleByUrl(url, name) : null;
}

async function onImportSoundFile(ev) {
  return ui && typeof ui.onImportSoundFile === 'function' ? ui.onImportSoundFile(ev) : null;
}

function createSavedSamplesUI() {
  return ui && typeof ui.createSavedSamplesUI === 'function' ? ui.createSavedSamplesUI() : null;
}

// NOTE : le code DOM historique dupliqué a été retiré ; les wrappers ci-dessus
// délèguent désormais vers `ui-menus.js`.

// NOTE: la fonction `loadPresetByIndex` a été extraite vers `js/preset-loader.js`.
// La référence `loadPresetByIndex` est déclarée en haut du fichier et assignée
// à l'instance `PresetLoader` durant l'initialisation (`startSampler`).

// Auto-démarrage en mode standalone (index.html)
if (!window.__AUDIO_SAMPLER_EMBEDDED__) {
  if (!window.__AUDIO_SAMPLER_STARTED__) {
    window.__AUDIO_SAMPLER_STARTED__ = true;
    const run = () => {
      try {
        startSampler(document).catch(e => console.error('startSampler failed (auto):', e));
      } catch (e) {
        console.error('startSampler invocation error:', e);
      }
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run);
  }
}

