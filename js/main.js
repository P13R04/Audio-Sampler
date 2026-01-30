// ====== AUDIO SAMPLER - Point d'entrée principal ======
// Orchestrateur principal du sampler audio avec architecture modulaire
// Gère l'initialisation, le chargement des presets, et la coordination des modules

// IMPORTANT: Nettoyer les presets localStorage qui pourraient avoir des URLs localhost obsolètes
// Cela évite les erreurs de chargement sur les machines qui ont un localStorage de développement
try {
  const userPresetsKey = 'userPresets';
  const userPresetsStr = localStorage.getItem(userPresetsKey);
  if (userPresetsStr && userPresetsStr.includes('localhost')) {
    console.warn('[CLEANUP] Removing cached user presets with localhost URLs');
    localStorage.removeItem(userPresetsKey);
  }
} catch (e) {
  // localStorage peut être inaccessible dans certains environnements
}

import { loadAndDecodeSound, playSound } from './soundutils.js';
import TrimbarsDrawer from './trimbarsdrawer.js';
import { pixelToSeconds, formatTime, formatSampleNameFromUrl } from './utils.js';
import { fetchPresets, normalizePresets, fillPresetSelect, extractFileName, blobToDataURL, serializePresetForExport, exportPresetToFile as pmExportPresetToFile, savePresetToLocalStorage as pmSavePresetToLocalStorage, loadPresetObjectIntoRuntime as pmLoadPresetObjectIntoRuntime, loadUserPresetsFromLocalStorage as pmLoadUserPresetsFromLocalStorage, importPresetFromFile as pmImportPresetFromFile, updateOrCreatePresetInLocalStorage as pmUpdateOrCreatePresetInLocalStorage } from './presets-manager.js';
import { applyTheme, setupThemeSelect, teardownThemeSelect } from './theme-manager.js';
import { showStatus as showStatusHelper, showError as showErrorHelper, resetButtons as resetButtonsHelper, updateTimeInfo as updateTimeInfoHelper, updateSampleName as updateSampleNameHelper, stopCurrentPlayback as stopPlaybackHelper } from './ui-helpers.js';
import { KeyboardManager } from './keyboard-manager.js';
import MidiManager from './midi-manager.js';
import { createInstrumentFromBufferUrl, createInstrumentFromSavedSample, createPresetFromSavedSampleSegments, createPresetFromBufferSegments, createInstrumentFromAudioBuffer } from './instrument-creator.js';
import { createWaveformUI as createWaveformUIHelper, drawWaveform, createAnimateOverlay, setupOverlayMouseEvents, showWaveformForSound as showWaveformHelper } from './waveform-renderer.js';
import { bus } from './event-bus.js';
import { PresetLoader } from './preset-loader.js';
import { isObjectUrl, getUrlFromEntry, revokeObjectUrlSafe, revokePresetBlobUrlsNotInNew, revokeAllBlobUrlsForPreset, decodeBlobToAudioBuffer, createTrackedObjectUrl, dataURLToBlob } from './blob-utils.js';
import { revokeAllTrackedObjectUrls } from './blob-utils.js';
import { createUIMenus } from './ui-menus.js';
import { createPresetWrappers } from './preset-wrappers.js';
import { showUploadModal, showManagePresetsModal } from './preset-admin.js';
import {
  API_BASE,
  PRESETS_URL,
  DEFAULT_KEYBOARD_LAYOUT,
  MIDI_BASE_NOTE,
  MIDI_PAD_COUNT
} from './constants.js';

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
let midiManager;
let presetLoader;
// Référence exposée vers la méthode fournie par `PresetLoader`.
let loadPresetByIndex;
let ui = null;
// Wrapper pour persistance des presets (assigné dans startSampler)
let updateOrCreatePreset = null;

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
  // S'assurer que l'AudioContext est initialisé avant d'utiliser les fonctions de création
  if (!ctx) {
    console.warn('[getInstrumentCreatorParams] AudioContext not yet initialized - user interaction required');
  }
  return {
    ctx,
    audioSamplerComp: currentRoot.querySelector('audio-sampler'),
    trimPositions,
    presets,
    fillPresetSelect: (sel, p) => fillPresetSelect(sel, p),
    presetSelect,
    loadPresetByIndex,
    showStatus,
    showError,
    // wrapper fourni par main.js qui persiste les presets (création / update)
    updateOrCreatePreset
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
  // Si la page a supprimé le #presetSelect visible, créer un select caché
  // pour que les autres modules puissent accéder à .value en toute sécurité.
  if (!presetSelect) {
    try {
      const hiddenSel = (root instanceof Document) ? root.createElement('select') : document.createElement('select');
      hiddenSel.id = 'presetSelect';
      hiddenSel.hidden = true;
      // Ajouter à un conteneur sûr
      const appendTarget = (root instanceof Document && root.body) ? root.body : (root.host || document.body);
      if (appendTarget && appendTarget.appendChild) appendTarget.appendChild(hiddenSel);
      presetSelect = hiddenSel;
    } catch (e) {
      // Si la création échoue, garder presetSelect null et compter sur les guards ailleurs
      console.warn('Failed to create hidden presetSelect', e);
    }
  }
  buttonsContainer = $id('buttonsContainer');
  statusEl = $id('status');
  errorEl = $id('error');
  // Élément de sélection du thème (exposé dans index.html / component)
  themeSelectEl = $id('themeSelect');

  // Note : les helpers d'export/import de presets sont fournis par presets-manager.
  // Ils sont appelés directement selon les besoins ; des wrappers améliorés sont définis
  // plus tard après initialisation pour fournir un comportement d'auto-chargement/synchronisation.

  // Créer l'AudioContext immédiatement (il sera en état "suspended" jusqu'à interaction)
  // Chrome autorise la création, c'est juste l'autoplay qui nécessite une interaction utilisateur
  ctx = new AudioContext();
  console.log('[AudioContext] created, initial state:', ctx.state);
  
  // Reprendre l'AudioContext après la première interaction utilisateur
  if (ctx.state === 'suspended') {
    const resumeAudioContext = async () => {
      if (ctx && ctx.state === 'suspended') {
        try {
          await ctx.resume();
          console.log('[AudioContext] resumed after user interaction, state:', ctx.state);
          // Mettre à jour le status
          if (statusEl && presets && presets.length > 0) {
            showStatus(`Audio activé ✓ - ${presets[0].name || 'Preset'} (${presets[0].files?.length || 0} sounds)`);
          }
        } catch (e) {
          console.warn('[AudioContext] failed to resume:', e);
        }
      }
    };
    
    document.addEventListener('click', resumeAudioContext, { once: true });
    document.addEventListener('keydown', resumeAudioContext, { once: true });
    document.addEventListener('touchstart', resumeAudioContext, { once: true });
  }

  try {
    // 1) Récupère les presets depuis le backend
    console.log('[startSampler] step: fetch presets from backend');
    showStatus('Chargement des presets...');
    const raw = await fetchPresets(); // Utilise api-service maintenant
    if (!raw) {
      throw new Error('Impossible de récupérer les presets depuis le backend');
    }
    presets = normalizePresets(raw); // Plus besoin de passer API_BASE
    console.log('[startSampler] presets fetched from backend, count=', presets.length);
    showStatus(`Presets normalisés: ${presets.length} presets`);

    // Conserver une copie originale des fichiers du preset pour pouvoir reset
    presets.forEach(p => { p.originalFiles = Array.isArray(p.files) ? [...p.files] : []; });

    // Tous les presets viennent maintenant du backend uniquement
    console.log('[startSampler] all presets loaded from backend, no localStorage');

    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error('Aucun preset utilisable dans la réponse du serveur.');
    }

    // 2) Remplit le <select> avec les presets disponibles
    if (presetSelect) fillPresetSelect(presetSelect, presets);
    console.log('[startSampler] fillPresetSelect called');
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
    // Utiliser un getter pour ctx afin qu'il soit toujours à jour
    Object.defineProperty(waveformState, 'ctx', {
      get: () => ctx,
      enumerable: true,
      configurable: true
    });
    // Exposer drawWaveform pour que theme-manager puisse demander un nouveau rendu
    waveformState.drawWaveform = drawWaveform;
    // Fournit au loader un wrapper pour arrêter la lecture courante
    waveformState.stopCurrentPlayback = stopCurrentPlayback;
    
    // Démarrage de la boucle d'animation pour l'overlay waveform
    // createAnimateOverlay renvoie maintenant un objet { start, stop }
    const overlayAnimator = createAnimateOverlay(waveformState);
    const overlayMouseEvents = setupOverlayMouseEvents(overlayCanvas, trimbarsDrawer, mousePos, waveformState);
    // Exposer les handlers pour le stop depuis stopSampler
    waveformState.overlayAnimator = overlayAnimator;
    if (overlayMouseEvents && typeof overlayMouseEvents.stop === 'function') waveformState.overlayMouseStop = overlayMouseEvents.stop;
    overlayAnimator.start();
    
    console.log('[startSampler] waveform UI initialized');
    // 4) Initialisation du KeyboardManager AVANT de charger le preset
    // Par défaut en AZERTY désormais
    keyboardManager = new KeyboardManager(DEFAULT_KEYBOARD_LAYOUT);
    keyboardManager.audioContext = ctx;
    // Attacher l'écouteur clavier global pour les raccourcis pads
    try { keyboardManager.bindKeyboard(); } catch (e) { console.warn('bindKeyboard failed', e); }
    // Démarrer le gestionnaire MIDI pour les contrôleurs externes (pads physiques)
    try {
      midiManager = new MidiManager({ keyboardManager, baseNote: MIDI_BASE_NOTE, padCount: MIDI_PAD_COUNT });
      // start() est async mais on n'a pas besoin d'attendre pour l'init UI
      const _midiStartPromise = midiManager.start();
      if (_midiStartPromise && typeof _midiStartPromise.catch === 'function') _midiStartPromise.catch(() => {});
    } catch (e) {
      console.warn('Failed to initialize MidiManager', e);
    }
    // Propriété dynamique pour vérifier l'état du contexte audio
    Object.defineProperty(keyboardManager, 'audioContextResumed', {
      get: () => !!ctx && ctx.state === 'running',
      set: (val) => {} // ignore les sets
    });
    const layoutSelect = $id('keyboardLayout');
    if (layoutSelect) {
      keyboardManager.setupLayoutSelect(layoutSelect, buttonsContainer);
    }

    // Setup upload and manage presets buttons
    const uploadPresetBtn = $id('uploadPresetBtn');
    const managePresetsBtn = $id('managePresetsBtn');
    
    if (uploadPresetBtn) {
      uploadPresetBtn.addEventListener('click', () => {
        showUploadModal(presetSelect, presets);
      });
    }
    
    if (managePresetsBtn) {
      managePresetsBtn.addEventListener('click', () => {
        showManagePresetsModal(presetSelect, presets);
      });
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
    
    // Préparer PresetLoader (extrait) et exposer loadPresetByIndex
    // Fournit la méthode chargée de créer la grille des pads
    // Ajouter un helper showWaveform sur waveformState attendu par le loader
    waveformState.showWaveform = (buffer, url, padIndex, sampleName) => {
      try { showWaveformHelper(buffer, url, padIndex, sampleName, waveformState); } catch (e) { console.warn('showWaveform helper failed', e); }
    };

    // Les wrappers d'export/import/sauvegarde de presets ont été
    // extraits vers js/preset-wrappers.js et seront instanciés
    // juste après l'initialisation du PresetLoader.

    


    presetLoader = new PresetLoader({
      ctx: () => ctx, // Passer une fonction getter pour permettre l'initialisation lazy
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

    // Wrapper de la méthode du loader pour tenir à jour currentPresetIndex
    // et révoquer les blob: URLs de l'ancien preset qui ne sont pas présentes
    // dans le nouveau (évite les fuites quand on remplace des presets).
    loadPresetByIndex = async (idx) => {
      const prevIndex = currentPresetIndex;
      try {
        if (prevIndex !== idx && Array.isArray(presets) && presets[prevIndex]) {
          const newFiles = (presets[idx] && presets[idx].files) || [];
          try { console.debug('[loadPresetByIndex] revoking blob URLs not in new for prevIndex=', prevIndex, '-> new idx=', idx); } catch (e) {}
          try { revokePresetBlobUrlsNotInNew(presets, trimPositions, prevIndex, newFiles); } catch (e) {}
        }
      } catch (e) { /* noop */ }
      currentPresetIndex = idx;
      return presetLoader.loadPresetByIndex(idx);
    };

    // Créer des wrappers localisés pour les opérations sur les presets.
    // Ces wrappers utilisent le module presets-manager et centralisent
    // l'auto-chargement / la synchronisation du <select> lorsque nécessaire.
    const _pw = createPresetWrappers({
      presets,
      trimPositions,
      getCurrentRoot: () => currentRoot,
      loadPresetByIndex,
      fillPresetSelect,
      presetSelect
    });
    console.log('[startSampler] preset wrappers created');

    // Exposer les fonctions attendues par l'UI avec les mêmes noms
    const exportPresetToFile = _pw.exportPresetToFile;
    const savePresetToLocalStorage = _pw.savePresetToLocalStorage;
    const loadPresetObjectIntoRuntime = _pw.loadPresetObjectIntoRuntime;
    const importPresetFromFile = _pw.importPresetFromFile;
    updateOrCreatePreset = _pw.updateOrCreatePreset;
    const loadUserPresetsFromLocalStorage = _pw.loadUserPresetsFromLocalStorage;

    // Instancier le module UI (extrait) et lui passer les dépendances nécessaires
    try {
      console.log('[startSampler] creating UI module (createUIMenus)');
      ui = createUIMenus({
        getCurrentRoot: () => currentRoot,
        presets,
        trimPositions,
        loadPresetByIndex,
        getCurrentPresetIndex: () => currentPresetIndex,
        showStatus,
        showError,
        getInstrumentCreatorParams,
        createPresetFromBufferSegments,
        createInstrumentFromSavedSample,
        createPresetFromSavedSampleSegments,
        createInstrumentFromBufferUrl,
        exportPresetToFile,
        savePresetToLocalStorage,
        updateOrCreatePreset: updateOrCreatePreset,
        importPresetFromFile,
        fillPresetSelect,
        presetSelect,
        formatSampleNameFromUrl,
        extractFileName
      });
      // Construire les contrôles visibles (boutons Ajouter / Créer preset)
      try {
        if (ui && typeof ui.createSavedSamplesUI === 'function') {
          console.log('[startSampler] calling ui.createSavedSamplesUI()');
          ui.createSavedSamplesUI();
          console.log('[startSampler] ui.createSavedSamplesUI() done');
        }
      } catch (e) { console.warn('ui.createSavedSamplesUI failed', e); }
    } catch (e) {
      console.warn('createUIMenus failed', e);
    }

    // Configurer le select de thème si présent afin d'appliquer et écouter les changements
    try {
      setupThemeSelect && setupThemeSelect(themeSelectEl, currentRoot, options, waveformState);
    } catch (e) { console.warn('setupThemeSelect failed', e); }

    // 5) Charge le premier preset par défaut
    try {
      console.log('[startSampler] loading initial preset index 0');
      showStatus('Chargement du preset initial...');
      await loadPresetByIndex(0);
      console.log('[startSampler] initial preset loaded');
    } catch (e) {
      console.error('[startSampler] failed loading initial preset', e);
      showError && showError('Erreur chargement preset initial: ' + (e && e.message));
    }

    // 6) Intégration avec le Web Component d'enregistrement (POC)
    // Lorsqu'un sample est sauvegardé via le composant, l'ajouter au preset courant
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');

    // Si le web component fournit ses propres contrôles, les masquer car
    // l'interface principale fournit un jeu de contrôles centralisés.
    try {
      if (audioSamplerComp && typeof audioSamplerComp.hideControls === 'function') {
        audioSamplerComp.hideControls();
      }
    } catch (e) { console.warn('hideControls call failed', e); }
    
    // Si le webcomponent audio-sampler expose une instance recorder, injecter
    // le AudioContext principal pour éviter la création d'un second contexte
    // et la fermeture double.
    try {
      if (audioSamplerComp && audioSamplerComp.recorder && ctx) {
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
    // Remplacement sécurisé : ouvrir le panneau d'ajout de son via le module UI
    busSampleAddedHandler = async (ev) => {
      return ui ? ui.openAddSoundMenu() : null;
    };
    bus.addEventListener('sampleadded', busSampleAddedHandler);

    // Listener pour l'ajout d'un sample chargé au preset courant (émis par audio-sampler)
    const busAddLoadedHandler = async (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : {};
        const url = detail.url;
        const name = detail.name || null;
        if (!url) return;

        // Prefer currentPresetIndex (keeps the current selection stable),
        // but allow presetSelect to override if it contains a non-empty numeric value.
        let idx = (typeof currentPresetIndex === 'number') ? currentPresetIndex : 0;
        try {
          if (presetSelect && presetSelect.value != null && String(presetSelect.value).trim() !== '') {
            const v = Number(presetSelect.value);
            if (!Number.isNaN(v)) idx = v;
          }
        } catch (e) {}

        if (!presets[idx]) presets[idx] = { name: 'Custom', files: [] };
        const files = presets[idx].files || [];

        let entry = { url, name: name || (typeof url === 'string' ? url : 'Loaded') };

        // If this is an object URL (blob:) created in-session, persist it first
        // so serialized presets reference stable sample ids instead of session-only blob: URLs.
        try {
          const root = currentRoot;
          const audioSamplerComp = root && root.querySelector ? root.querySelector('audio-sampler') : null;
          if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
            if (typeof isObjectUrl === 'function' && isObjectUrl(url)) {
              try {
                console.log('[addLoadedToPreset] detected object URL, persisting sample before adding to preset', url);
                const resp = await fetch(url);
                const blob = await resp.blob();
                const sampleName = entry.name || extractFileName(url) || 'loaded';
                const savedId = await audioSamplerComp.recorder.saveSample(blob, { name: sampleName });
                if (savedId == null) throw new Error('saveSample returned null/undefined id');
                const newUrl = createTrackedObjectUrl(blob);
                entry = { url: newUrl, name: sampleName, _sampleId: savedId };
                try { if (trimPositions.has(url)) { const t = trimPositions.get(url); trimPositions.set(newUrl, t); trimPositions.delete(url); } } catch (e) {}
                console.log('[addLoadedToPreset] sample persisted id=', savedId);
              } catch (e) {
                // If we fail to persist the sample, neutralize the entry to avoid
                // writing a session-only blob: URL into the preset storage.
                console.warn('[addLoadedToPreset] Failed to persist loaded sample before adding to preset — neutralizing entry', e);
                entry = { url: null, name: entry.name || 'Loaded (failed to persist)' };
              }
            }
          }
        } catch (e) { console.warn('persist-on-add attempt failed', e); }

        if (files.length < 16) {
          files.push(entry);
        } else {
          const old = files[files.length - 1];
          const oldUrl = getUrlFromEntry(old);
          if (oldUrl && isObjectUrl(oldUrl)) revokeObjectUrlSafe(oldUrl);
          files[files.length - 1] = entry;
        }

        // revoke any old blob URLs not present in the new files array
        revokePresetBlobUrlsNotInNew(presets, trimPositions, idx, files);
        presets[idx].files = files;

        // Persist the updated preset: update if user preset, otherwise create a new user preset
        try {
          if (typeof updateOrCreatePreset === 'function') {
            // Capture the current preset name so we can re-locate it after persistence
            const presetNameBefore = (presets[idx] && presets[idx].name) ? presets[idx].name : null;
            try { console.log('[busAddLoadedHandler] before updateOrCreatePreset idx=', idx, 'presetName=', presetNameBefore); } catch (e) {}
            const res = await updateOrCreatePreset(idx, null);
            try { console.log('[busAddLoadedHandler] updateOrCreatePreset result=', res); } catch (e) {}

            // Determine the runtime index to use after persistence.
            let resolvedIndex = (res && typeof res.index === 'number') ? res.index : null;
            if (resolvedIndex == null) {
              // Try to find by name among runtime presets (prefer _fromUser)
              if (presetNameBefore) {
                const foundByName = presets.findIndex(p => p && p._fromUser && p.name === presetNameBefore);
                if (foundByName >= 0) resolvedIndex = foundByName;
              }
            }
            // Fallback to original idx if still not found
            if (resolvedIndex == null || !presets[resolvedIndex]) resolvedIndex = idx >= 0 && presets[idx] ? idx : 0;
            try { console.log('[busAddLoadedHandler] resolved runtime index after persist=', resolvedIndex); } catch (e) {}
            idx = resolvedIndex;
          }
        } catch (e) {
          console.warn('Auto-persisting preset after addLoadedToPreset failed', e);
        }

        // Synchronisation UI / runtime :
        // - Met à jour la liste des options du <select> si nécessaire
        // - Affecte la bonne valeur à `presetSelect.value` en se basant
        //   d'abord sur l'index runtime retourné par la persistence (si présent),
        //   sinon recherche le preset par nom (résilience)
        try {
          console.log('[busAddLoadedHandler] BEFORE fillPresetSelect - idx=', idx, 'presets.length=', presets.length);
          if (typeof fillPresetSelect === 'function' && presetSelect) fillPresetSelect(presetSelect, presets);
        } catch (e) {}
        try {
          // If idx is a valid runtime index, prefer it. Otherwise, try to find by name.
          let chosen = (typeof idx === 'number') ? idx : null;
          if (chosen == null || !presets[chosen]) {
            // fallback: attempt to locate by preset name if available
            const wantedName = (entry && entry.name) ? entry.name : (presets[chosen] && presets[chosen].name) || null;
            if (wantedName) {
              const found = presets.findIndex(p => p && p.name === wantedName && p._fromUser);
              if (found >= 0) chosen = found;
            }
          }
          if (chosen == null || !presets[chosen]) {
            chosen = 0;
          }
          try { if (presetSelect) presetSelect.value = String(chosen); } catch (e) {}
          try { currentPresetIndex = chosen; } catch (e) {}
          await loadPresetByIndex(chosen);
        } catch (e) {
          console.warn('Failed to sync UI selection after addLoadedToPreset', e);
        }
        showStatus('Sample ajouté au preset.');
      } catch (err) {
        showError && showError('Erreur ajout sample chargé au preset: ' + (err && (err.message || err)));
      }
    };
    bus.addEventListener('addLoadedToPreset', busAddLoadedHandler);

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
    try { bus.removeEventListener('addLoadedToPreset', busAddLoadedHandler); } catch (e) {}
  } catch (e) { console.warn('Failed to remove bus handler', e); }

  // 3) Débind le clavier si nécessaire
  try {
    if (keyboardManager && typeof keyboardManager.unbindKeyboard === 'function') {
      keyboardManager.unbindKeyboard();
    }
  } catch (e) { console.warn('Failed to unbind keyboard', e); }

  // 3b) Stoppe et détache le manager MIDI si présent
  try {
    if (midiManager && typeof midiManager.stop === 'function') midiManager.stop();
  } catch (e) { console.warn('Failed to stop midiManager', e); }

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
    // Nettoyer aussi toutes les URLs d'objets traquées créées via createTrackedObjectUrl
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

