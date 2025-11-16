// Exercise 3 — fetch presets from REST API and load sounds for the selected preset
// Corrigé pour Live Server + API sur http://localhost:3000

import { loadAndDecodeSound, playSound } from './soundutils.js';
import TrimbarsDrawer from './trimbarsdrawer.js';
import { pixelToSeconds, formatTime, formatSampleNameFromUrl } from './utils.js';

/* ---------------------------------------------------------------------------
  Description générale :
  Ce fichier est le point d'entrée principal du sampler côté client.
  Il orchestre :
  - la récupération des presets via l'API REST,
  - le décodage des fichiers audio (via soundutils.js),
  - la génération dynamique de la grille 4x4 de pads,
  - la gestion du clavier (QWERTY / AZERTY),
  - l'affichage et l'interaction de la waveform et des trimbars
  - la lecture via WebAudio (AudioContext + BufferSource)

  Pour faciliter la compréhension, les blocs critiques
  (initialisation, chargement de preset, lecture, UI waveform)
  sont documentés juste avant leur déclaration.
  --------------------------------------------------------------------------- */

// ====== CONFIG ORIGINS ======
const API_BASE = 'http://localhost:3000';               // <- API + fichiers audio
const PRESETS_URL = `${API_BASE}/api/presets`;

// Web Audio
let ctx;

// UI elements (will be bound to a document or shadowRoot in startSampler)
let presetSelect, buttonsContainer, statusEl, errorEl;

// Etat
let presets = [];          // [{ name, files:[absoluteUrl,...] }, ...]
let decodedSounds = [];    // [{ buffer: AudioBuffer, url, name, playbackRate }, ...] du preset courant
let currentPresetIndex = 0; // index du preset actuellement chargé
// per-sound trim positions stored by url (seconds)
const trimPositions = new Map();

// waveform + overlay
let waveformCanvas, overlayCanvas, trimbarsDrawer;
let timeInfoEl = null;                    // affichage des temps sous la waveform
let sampleNameEl = null;                  // affichage du nom du sample
let mousePos = { x: 0, y: 0 };
let currentShownBuffer = null;
let currentShownUrl = null;
let currentShownPadIndex = null;          // index du pad actuellement joué
let currentShownSampleName = null;        // nom du sample actuellement joué
// Lecture en cours (pour Stop + curseur de lecture)
let currentSource = null;                // BufferSource en cours
let playStartCtxTime = 0;                // ctx.currentTime au démarrage
let playStartSec = 0;                    // position de départ (s)
let playEndSec = 0;                      // position de fin (s)

// Mapping clavier → pads (ordre bas→haut, gauche→droite)
// QWERTY: z,x,c,v / a,s,d,f / q,w,e,r / 1,2,3,4
// AZERTY: w,x,c,v / q,s,d,f / a,z,e,r / &,é,",' (1,2,3,4 en evt.key)
const PAD_KEYS_QWERTY = ['z','x','c','v','a','s','d','f','q','w','e','r','1','2','3','4'];
const PAD_KEYS_AZERTY = ['w','x','c','v','q','s','d','f','a','z','e','r','&','é','"',"'"];
// Labels à afficher (toujours 1,2,3,4 pour la ligne du haut)
const PAD_LABELS_QWERTY = ['z','x','c','v','a','s','d','f','q','w','e','r','1','2','3','4'];
const PAD_LABELS_AZERTY = ['w','x','c','v','q','s','d','f','a','z','e','r','1','2','3','4'];
let currentLayout = 'qwerty'; // 'qwerty' ou 'azerty'
let PAD_KEYS = [...PAD_KEYS_QWERTY];
let PAD_LABELS = [...PAD_LABELS_QWERTY];
let keyToPadIndex = new Map();
let padPlayFns = [];
let keyboardBound = false;
let audioContextResumed = false; // Track si le contexte a déjà été activé

// ---------------------------------------------------------------------------
// Initialisation globale :
// - Création de l'AudioContext
// - Récupération des presets depuis l'API
// - Construction de l'UI (waveform cachée) et chargement du preset par défaut
// - Liaison des événements UI (select preset, layout clavier)
// Notes:
// - `audioContextResumed` sert à garder la trace si l'utilisateur a déjà
//   déclenché une interaction autorisant la lecture (politique autoplay)
// - L'UI de waveform est créée une fois (cached) et affichée quand un son est sélectionné
// ---------------------------------------------------------------------------
// Exported initializer: start the sampler inside a Document or ShadowRoot
export async function startSampler(root = document, options = {}) {
  // helper to get elements by id within the provided root
  const $id = (id) => (root instanceof Document ? root.getElementById(id) : root.querySelector('#' + id));

  // Bind UI elements to the chosen root (document or shadowRoot)
  presetSelect = $id('presetSelect');
  buttonsContainer = $id('buttonsContainer');
  statusEl = $id('status');
  errorEl = $id('error');

  ctx = new AudioContext();

  try {
    // 1) Récupère les presets du serveur
    const raw = await fetchPresets(PRESETS_URL);
    presets = normalizePresets(raw); // -> [{name, files:[absUrl,...]}]

    // Conserver une copie originale des fichiers du preset pour pouvoir reset
    presets.forEach(p => { p.originalFiles = Array.isArray(p.files) ? [...p.files] : []; });

    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error('Aucun preset utilisable dans la réponse du serveur.');
    }

    // 2) Remplit le <select>
    if (presetSelect) fillPresetSelect(presets);

    // 3) Charge le premier preset par défaut
    if (presetSelect) presetSelect.disabled = false;
    // crée l'UI waveform (cachée tant qu'aucun son n'est sélectionné)
    createWaveformUI();
    await loadPresetByIndex(0);

    // Intégration avec le Web Component d'enregistrement (POC)
    // Lorsqu'un sample est sauvegardé via le composant, on l'ajoute au preset courant
    const audioSamplerComp = document.querySelector('audio-sampler');
    if (audioSamplerComp) {
      audioSamplerComp.addEventListener('sampleadded', async (ev) => {
        const { id, name } = ev.detail || {};
        try {
          const saved = await audioSamplerComp.recorder.getSample(id);
          if (!saved || !saved.blob) {
            showError('Impossible de récupérer le sample sauvegardé.');
            return;
          }
          const blobUrl = URL.createObjectURL(saved.blob);
          if (!presets[currentPresetIndex]) presets[currentPresetIndex] = { name: 'Custom', files: [] };
          presets[currentPresetIndex].files.push(blobUrl);
          await loadPresetByIndex(currentPresetIndex);
          showStatus(`Sample "${name || id}" ajouté au preset courant.`);
        } catch (err) {
          console.error('Erreur lors de l\'import du sample :', err);
          showError('Erreur lors de l\'import du sample : ' + (err.message || err));
        }
      });
    }

    // Crée l'UI pour gérer les samples locaux et presets (import/export)
    createSavedSamplesUI();

    // 4) Changement de preset
    if (presetSelect) presetSelect.addEventListener('change', async () => {
      const idx = Number(presetSelect.value);
      await loadPresetByIndex(idx);
    });

    // 5) Changement de disposition clavier
    const layoutSelect = $id('keyboardLayout');
    if (layoutSelect) {
      layoutSelect.addEventListener('change', () => {
        currentLayout = layoutSelect.value;
        PAD_KEYS = currentLayout === 'azerty' ? [...PAD_KEYS_AZERTY] : [...PAD_KEYS_QWERTY];
        PAD_LABELS = currentLayout === 'azerty' ? [...PAD_LABELS_AZERTY] : [...PAD_LABELS_QWERTY];
        if (audioContextResumed && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('AudioContext re-resumed after layout change');
          }).catch(e => console.warn('Resume failed:', e));
        }
        updatePadKeyLabels();
        layoutSelect.blur();
      });
    }

    // Theme support: predefined themes and dynamic application via CSS variables
    const themes = {
      'purple-neon': {
        '--btn-border-start': 'rgba(167,139,250,0.45)',
        '--btn-border-hover': 'rgba(147,197,253,0.9)',
        '--btn-bg-top': '#111827',
        '--btn-bg-bottom': '#0f172a',
        '--btn-text': '#ffffff',
        '--btn-subtext': '#a78bfa',
        '--btn-key-bg': 'rgba(15,23,42,0.8)',
        '--wave-fill': '#0b1220',
        '--wave-stroke': 'rgba(167,139,250,0.98)',
        '--wave-grad-1': 'rgba(167, 139, 250, 0.98)',
        '--wave-grad-2': 'rgba(147, 197, 253, 0.98)',
        '--wave-grad-3': 'rgba(103, 232, 249, 0.98)',
        '--subtitle-color': '#c7b3ff',
        '--topbar-text': '#e5e7eb',
        '--topbar-bg': 'rgba(26, 21, 37, 0.4)',
        '--bg-grad-1': '#0a0a0f',
        '--bg-grad-2': '#1a1525'
      },
      'midnight-blue': {
        '--btn-border-start': 'rgba(99,102,241,0.45)',
        '--btn-border-hover': 'rgba(99,102,241,0.9)',
        '--btn-bg-top': '#071029',
        '--btn-bg-bottom': '#021428',
        '--btn-text': '#e6f0ff',
        '--btn-subtext': '#93c5fd',
        '--btn-key-bg': 'rgba(2,20,36,0.85)',
        '--wave-fill': '#021428',
        '--wave-stroke': 'rgba(99,102,241,0.95)',
        '--wave-grad-1': 'rgba(99,102,241,0.98)',
        '--wave-grad-2': 'rgba(66,153,225,0.9)',
        '--wave-grad-3': 'rgba(103,232,249,0.9)',
        '--subtitle-color': '#a7d8ff',
        '--topbar-text': '#e6f0ff',
        '--topbar-bg': 'rgba(2,10,24,0.45)',
        '--bg-grad-1': '#021428',
        '--bg-grad-2': '#071029'
      },
      'retro-sunset': {
        '--btn-border-start': 'rgba(249,115,22,0.6)',
        '--btn-border-hover': 'rgba(252,165,0,0.9)',
        '--btn-bg-top': '#3b0a21',
        '--btn-bg-bottom': '#2b021f',
        '--btn-text': '#fff6f3',
        '--btn-subtext': '#fb7185',
        '--btn-key-bg': 'rgba(30,10,10,0.8)',
        '--wave-fill': '#2b021f',
        '--wave-stroke': 'rgba(249,115,22,0.95)',
        '--wave-grad-1': 'rgba(249,115,22,0.95)',
        '--wave-grad-2': 'rgba(236,72,153,0.95)',
        '--wave-grad-3': 'rgba(99,102,241,0.95)',
        '--subtitle-color': '#ffd6c7',
        '--topbar-text': '#fff6f3',
        '--topbar-bg': 'rgba(43,6,20,0.45)',
        '--bg-grad-1': '#2b021f',
        '--bg-grad-2': '#3b0a21'
      },
      'forest-emerald': {
        '--btn-border-start': 'rgba(34,197,94,0.5)',
        '--btn-border-hover': 'rgba(34,197,94,0.95)',
        '--btn-bg-top': '#071f0a',
        '--btn-bg-bottom': '#04210a',
        '--btn-text': '#e9fff0',
        '--btn-subtext': '#a7f3d0',
        '--btn-key-bg': 'rgba(4,20,10,0.85)',
        '--wave-fill': '#04210a',
        '--wave-stroke': 'rgba(34,197,94,0.95)',
        '--wave-grad-1': 'rgba(34,197,94,0.98)',
        '--wave-grad-2': 'rgba(94,234,212,0.9)',
        '--wave-grad-3': 'rgba(167, 255, 199, 0.9)',
        '--subtitle-color': '#c6f6e5',
        '--topbar-text': '#e9fff0',
        '--topbar-bg': 'rgba(3,20,8,0.4)',
        '--bg-grad-1': '#04210a',
        '--bg-grad-2': '#071f0a'
      }
    };

    function applyTheme(name, targetRoot = document) {
      const theme = themes[name] || themes['purple-neon'];
      // Apply to documentElement (global) so body/background reflects theme
      const docRoot = document.documentElement;
      Object.entries(theme).forEach(([k, v]) => docRoot.style.setProperty(k, v));
      // If embedded (shadow root), also set variables on host to ensure inheritance
      if (targetRoot && typeof targetRoot === 'object' && targetRoot.host) {
        const host = targetRoot.host;
        Object.entries(theme).forEach(([k, v]) => host.style.setProperty(k, v));
      }
      // Dispatch a theme-changed event so components can react (redraw waveforms)
      try {
        window.dispatchEvent(new CustomEvent('sampler-theme-changed', { detail: { name } }));
      } catch (e) {
        // Ignore if dispatch fails in some environments
      }

      // If a waveform is currently shown, force redraw so gradient/background match immediately
      if (typeof currentShownBuffer !== 'undefined' && currentShownBuffer && typeof waveformCanvas !== 'undefined' && waveformCanvas) {
        try {
          drawWaveform(currentShownBuffer, waveformCanvas);
        } catch (e) {
          console.warn('Failed to redraw waveform after theme change', e);
        }
      }
      // Redraw overlay/trimbars if present
      if (typeof trimbarsDrawer !== 'undefined' && trimbarsDrawer && overlayCanvas) {
        try { trimbarsDrawer.draw(); } catch (e) { /* ignore */ }
      }
    }

    // Hook theme select if present
    const themeSelect = $id('themeSelect');
    if (themeSelect) {
      // set initial value from options or element
      const initial = options.theme || themeSelect.value || 'purple-neon';
      themeSelect.value = initial;
      applyTheme(initial, root);
      themeSelect.addEventListener('change', () => applyTheme(themeSelect.value, root));
    } else {
      // apply default theme
      applyTheme(options.theme || 'purple-neon', root);
    }

    // Binding clavier (une seule fois)
    if (!keyboardBound) {
      window.addEventListener('keydown', (evt) => {
        let k = (evt.key || '').toLowerCase();
        if (!k) return;
        if (currentLayout === 'azerty') {
          if (k === '1') k = '&';
          else if (k === '2') k = 'é';
          else if (k === '3') k = '"';
          else if (k === '4') k = "'";
        }
        const idx = keyToPadIndex.get(k);
        if (idx === undefined) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        const fn = padPlayFns[idx];
        if (typeof fn === 'function') {
          evt.preventDefault();
          fn();
        }
      });
      keyboardBound = true;
    }

  } catch (err) {
    console.error(err);
    showError(err.message || String(err));
  }
}

// Auto-start when used as a standalone page, unless embedded explicitly
if (!window.__AUDIO_SAMPLER_EMBEDDED__) {
  if (document.readyState === 'loading') window.addEventListener('load', () => startSampler(document));
  else startSampler(document);
}

// ---------- Fetch + normalisation ----------

async function fetchPresets(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  return res.json();
}

/**
 * Normalise la réponse du serveur vers:
 *    [{ name, files: [absoluteUrl, ...] }, ...]
 *
 * D'après ton "exemple REST" (script.js), le serveur renvoie un array de presets,
 * avec pour chaque preset:
 *   { name, type, samples: [{ name, url }, ...] }
 * et les fichiers audio sont servis sous /presets/<sample.url> sur le même host:port.
 * On doit donc construire: absoluteUrl = new URL(`presets/${sample.url}`, API_BASE).
 *
 * Références: ton script.js de démo (coté serveur HTML) construit "presets/" + sample.url,
 * et fetch('/api/presets') côté même origin. :contentReference[oaicite:2]{index=2}
 */
function normalizePresets(raw) {
  const makeAbsFromApi = (p) => new URL(p, API_BASE).toString();

  // CAS attendu (array)
  if (Array.isArray(raw)) {
    return raw.map((preset, i) => {
      // format serveur: samples = [{name, url}, ...]
      let files = [];
      if (Array.isArray(preset.samples)) {
        files = preset.samples
          .map(s => s && s.url ? `presets/${s.url}` : null)
          .filter(Boolean)
          .map(makeAbsFromApi); // -> absolu sur API_BASE
      } else if (Array.isArray(preset.files)) {
        // fallback: déjà des chemins (on les rend absolus par l'API)
        files = preset.files.map(makeAbsFromApi);
      } else if (Array.isArray(preset.urls)) {
        files = preset.urls.map(makeAbsFromApi);
      }

      return {
        name: preset.name || preset.title || `Preset ${i + 1}`,
        files
      };
    }).filter(p => p.files.length > 0);
  }

  // CAS { presets: [...] }
  if (raw && Array.isArray(raw.presets)) {
    return normalizePresets(raw.presets);
  }

  // Autres formats -> vide
  return [];
}

// ---------- UI helpers ----------

function fillPresetSelect(presets) {
  presetSelect.innerHTML = '';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name || `Preset ${i + 1}`;
    presetSelect.appendChild(opt);
  });
}

function showStatus(msg) { statusEl.textContent = msg || ''; }
function showError(msg)  { errorEl.textContent = msg || ''; showStatus(''); }
function resetButtons()  { buttonsContainer.innerHTML = ''; }

// ---------- Saved samples / presets UI (import/export) ----------
let savedSamplesContainer = null;

function createSavedSamplesUI() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  // Minimal toolbar: only the "Ajouter un son..." entry point.
  savedSamplesContainer = document.createElement('div');
  savedSamplesContainer.style.maxWidth = '900px';
  savedSamplesContainer.style.margin = '0.6rem auto';
  savedSamplesContainer.style.color = '#cbd5e1';

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '0.5rem';

  const addSoundBtn = document.createElement('button');
  addSoundBtn.textContent = 'Ajouter un son...';
  addSoundBtn.classList.add('control-btn');
  addSoundBtn.addEventListener('click', () => openAddSoundMenu());
  controls.appendChild(addSoundBtn);

  // New: button to create a new preset with options
  const createPresetBtn = document.createElement('button');
  createPresetBtn.textContent = 'Créer preset...';
  createPresetBtn.classList.add('control-btn');
  createPresetBtn.addEventListener('click', () => openCreatePresetMenu());
  controls.appendChild(createPresetBtn);

  // Hidden file input used by the add-sound modal when choosing to import
  const importSoundInput = document.createElement('input');
  importSoundInput.type = 'file';
  importSoundInput.accept = 'audio/*';
  importSoundInput.style.display = 'none';
  importSoundInput.addEventListener('change', onImportSoundFile);
  controls.appendChild(importSoundInput);

  savedSamplesContainer.appendChild(controls);
  topbar.parentNode.insertBefore(savedSamplesContainer, topbar.nextSibling);
}

// ------- Menu / dialogue pour ajouter un son (sélectionner un sample sauvegardé ou importer)
async function openAddSoundMenu() {
  // Création d'un simple panneau modal léger
  let panel = document.getElementById('addSoundPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    return;
  }

  panel = document.createElement('div');
  panel.id = 'addSoundPanel';
  panel.style.position = 'fixed';
  panel.style.left = '50%';
  panel.style.top = '10%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.background = 'rgba(8, 10, 20, 0.98)';
  panel.style.border = '1px solid rgba(148,163,184,0.08)';
  panel.style.padding = '1rem';
  panel.style.zIndex = '9999';
  panel.style.borderRadius = '8px';
  panel.style.minWidth = '480px';
  panel.style.maxWidth = '90%';
  panel.style.maxHeight = '70vh';
  panel.style.overflow = 'auto';

  const title = document.createElement('div');
  title.textContent = 'Ajouter un son';
  title.style.fontWeight = '700';
  title.style.marginBottom = '0.6rem';
  panel.appendChild(title);

  const audioSamplerComp = document.querySelector('audio-sampler');

  // container grid for cards
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
  grid.style.gap = '0.6rem';

  // 1) Import card
  const importCard = document.createElement('div');
  importCard.style.padding = '0.6rem';
  importCard.style.border = '1px solid rgba(148,163,184,0.06)';
  importCard.style.borderRadius = '6px';
  importCard.style.background = 'rgba(17,24,39,0.35)';
  importCard.style.display = 'flex';
  importCard.style.flexDirection = 'column';
  importCard.style.justifyContent = 'center';
  importCard.style.alignItems = 'center';
  importCard.style.minHeight = '80px';

  const importLabel = document.createElement('div');
  importLabel.textContent = 'Importer un fichier depuis l\'ordinateur';
  importLabel.style.marginBottom = '0.6rem';
  importCard.appendChild(importLabel);

  const importBtn = document.createElement('button');
  importBtn.textContent = 'Importer...';
  importBtn.classList.add('control-btn');
  importBtn.addEventListener('click', () => {
    const input = document.querySelector('input[type=file][accept="audio/*"]');
    if (input) input.click();
  });
  importCard.appendChild(importBtn);
  grid.appendChild(importCard);

  // 2) Saved samples from IndexedDB
  if (audioSamplerComp && audioSamplerComp.recorder) {
    try {
      const samples = await audioSamplerComp.recorder.getAllSamples();
      for (const s of samples) {
        const card = document.createElement('div');
        card.style.padding = '0.5rem';
        card.style.border = '1px solid rgba(148,163,184,0.06)';
        card.style.borderRadius = '6px';
        card.style.background = 'rgba(17,24,39,0.35)';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '0.4rem';

        const title = document.createElement('div');
        title.textContent = s.name || `Sample ${s.id}`;
        title.style.fontWeight = '600';
        card.appendChild(title);

        const meta = document.createElement('div');
        meta.textContent = new Date(s.createdAt).toLocaleString();
        meta.style.opacity = '0.8';
        meta.style.fontSize = '0.85rem';
        card.appendChild(meta);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';

        const addBtn = document.createElement('button');
        addBtn.textContent = 'Ajouter';
        addBtn.classList.add('control-btn');
        addBtn.addEventListener('click', async () => {
          await addSavedSampleToPreset(s.id);
          closeAddSoundMenu();
        });
        row.appendChild(addBtn);

        card.appendChild(row);
        grid.appendChild(card);
      }
    } catch (err) {
      console.warn('Erreur lecture samples sauvegardés:', err);
    }
  }

  // 3) Samples coming from presets (API / permanent presets) — unique URLs
  try {
    const seen = new Set();
    for (const p of presets || []) {
      if (!p || !Array.isArray(p.files)) continue;
      for (const f of p.files) {
        const url = (typeof f === 'string') ? f : f.url;
        if (!url || seen.has(url)) continue;
        seen.add(url);

        const card = document.createElement('div');
        card.style.padding = '0.5rem';
        card.style.border = '1px solid rgba(148,163,184,0.06)';
        card.style.borderRadius = '6px';
        card.style.background = 'rgba(17,24,39,0.28)';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.gap = '0.4rem';

        const name = (typeof f === 'string') ? formatSampleNameFromUrl(url) : (f.name || formatSampleNameFromUrl(url));
        const title = document.createElement('div');
        title.textContent = name;
        title.style.fontWeight = '600';
        card.appendChild(title);

        const src = document.createElement('div');
        src.textContent = extractFileName(url);
        src.style.opacity = '0.8';
        src.style.fontSize = '0.85rem';
        card.appendChild(src);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';

        const addBtn = document.createElement('button');
        addBtn.textContent = 'Ajouter';
        addBtn.classList.add('control-btn');
        addBtn.addEventListener('click', async () => {
          await addPresetSampleByUrl(url, name);
          closeAddSoundMenu();
        });
        row.appendChild(addBtn);

        card.appendChild(row);
        grid.appendChild(card);
      }
    }
  } catch (err) {
    console.warn('Erreur while enumerating presets samples:', err);
  }

  panel.appendChild(grid);

  // close button
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.marginTop = '0.6rem';
  const close = document.createElement('button');
  close.textContent = 'Fermer';
  close.classList.add('control-btn');
  close.addEventListener('click', closeAddSoundMenu);
  footer.appendChild(close);
  panel.appendChild(footer);

  document.body.appendChild(panel);
}

function closeAddSoundMenu() {
  const panel = document.getElementById('addSoundPanel');
  if (panel) panel.remove();
}

async function openCreatePresetMenu() {
  // Simple modal with 3 options: assemble existing, record-split, instrument
  let panel = document.getElementById('createPresetPanel');
  if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; return; }

  panel = document.createElement('div');
  panel.id = 'createPresetPanel';
  panel.style.position = 'fixed';
  panel.style.left = '50%';
  panel.style.top = '10%';
  panel.style.transform = 'translateX(-50%)';
  panel.style.background = 'rgba(8, 10, 20, 0.98)';
  panel.style.border = '1px solid rgba(148,163,184,0.08)';
  panel.style.padding = '1rem';
  panel.style.zIndex = '9999';
  panel.style.borderRadius = '8px';
  panel.style.minWidth = '420px';

  const title = document.createElement('div');
  title.textContent = 'Créer un nouveau preset';
  title.style.fontWeight = '700';
  title.style.marginBottom = '0.6rem';
  panel.appendChild(title);

  const info = document.createElement('div');
  info.textContent = 'Choisissez une des options : assembler des sons, scinder un enregistrement, ou créer un instrument.';
  info.style.marginBottom = '0.6rem';
  panel.appendChild(info);

  const btnAssemble = document.createElement('button');
  btnAssemble.textContent = 'Assembler des sons existants';
  btnAssemble.classList.add('control-btn');
  btnAssemble.addEventListener('click', async () => {
    try { await openAssemblePresetPanel(panel); } catch (e) { showError(e.message || e); }
  });
  panel.appendChild(btnAssemble);

  const btnSplit = document.createElement('button');
  btnSplit.textContent = 'Enregistrer & scinder par silence';
  btnSplit.classList.add('control-btn');
  btnSplit.style.marginLeft = '0.5rem';
  btnSplit.addEventListener('click', async () => {
    try {
      const audioSamplerComp = document.querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent. Enregistrez d\'abord.');
      await createPresetFromBufferSegments(audioSamplerComp.lastAudioBuffer, audioSamplerComp.shadowRoot ? (audioSamplerComp.shadowRoot.getElementById('status')?.textContent || 'Recording') : 'Recording');
      panel.remove();
    } catch (e) { showError('Erreur: ' + (e.message || e)); }
  });
  panel.appendChild(btnSplit);

  const btnInstr = document.createElement('button');
  btnInstr.textContent = 'Créer un instrument 16 notes (depuis dernier enregistrement)';
  btnInstr.classList.add('control-btn');
  btnInstr.style.display = 'block';
  btnInstr.style.marginTop = '0.6rem';
  btnInstr.addEventListener('click', async () => {
    try {
      const audioSamplerComp = document.querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent. Enregistrez d\'abord.');
      // create wav blob and URL from buffer
      const wav = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
      const url = URL.createObjectURL(wav);
      await createInstrumentFromBufferUrl(url, 'Instrument');
      panel.remove();
    } catch (e) { showError('Erreur création instrument: ' + (e.message||e)); }
  });
  panel.appendChild(btnInstr);

  const close = document.createElement('button');
  close.textContent = 'Fermer';
  close.classList.add('control-btn');
  close.style.display = 'block';
  close.style.marginTop = '0.6rem';
  close.addEventListener('click', () => panel.remove());
  panel.appendChild(close);

  document.body.appendChild(panel);
}

async function openAssemblePresetPanel(parentPanel) {
  // Show a list of saved samples with checkboxes to select up to 16 and create a preset
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');

  // remove existing subpanel if any
  const existing = document.getElementById('assemblePresetPanel'); if (existing) existing.remove();

  const panel = document.createElement('div'); panel.id = 'assemblePresetPanel';
  panel.style.marginTop = '0.6rem';
  panel.style.maxHeight = '40vh'; panel.style.overflow = 'auto';

  const samples = await audioSamplerComp.recorder.getAllSamples();
  if (!samples || samples.length === 0) {
    const p = document.createElement('div'); p.textContent = 'Aucun sample sauvegardé.'; panel.appendChild(p);
  } else {
    // Option: last (unsaved) recording
    const audioSamplerComp = document.querySelector('audio-sampler');
    if (audioSamplerComp && audioSamplerComp.lastAudioBuffer) {
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems='center'; row.style.padding='0.3rem';
      const left = document.createElement('div'); left.textContent = audioSamplerComp.lastBlob ? (audioSamplerComp.lastBlob.name || 'Dernier enregistrement') : 'Dernier enregistrement (non sauvegardé)'; row.appendChild(left);
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.last = '1'; row.appendChild(cb);
      panel.appendChild(row);
    }
    for (const s of samples) {
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems='center'; row.style.padding='0.3rem';
      const left = document.createElement('div'); left.textContent = s.name || `Sample ${s.id}`; row.appendChild(left);
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.sampleId = s.id; row.appendChild(cb);
      panel.appendChild(row);
    }
  }

  const createBtn = document.createElement('button'); createBtn.textContent = 'Créer preset avec éléments sélectionnés';
  createBtn.style.display = 'block'; createBtn.style.marginTop = '0.6rem';
  createBtn.classList.add('control-btn');
    createBtn.addEventListener('click', async () => {
    const checks = Array.from(panel.querySelectorAll('input[type=checkbox]:checked')).slice(0,16);
    if (checks.length === 0) return showError('Sélectionnez au moins un sample.');
    const files = [];
    for (const c of checks) {
      if (c.dataset.last === '1') {
        // last unsaved recording
        const wav = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
        const blobUrl = URL.createObjectURL(wav);
        // decode to get duration and set trim
        try {
          const ab = await wav.arrayBuffer();
          const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(ab);
          trimPositions.set(blobUrl, { start: 0, end: decoded.duration });
        } catch (e) { /* ignore decode errors */ }
        files.push({ url: blobUrl, name: 'Dernier enregistrement' });
      } else {
        const id = Number(c.dataset.sampleId);
        const saved = await audioSamplerComp.recorder.getSample(id);
        const blobUrl = URL.createObjectURL(saved.blob);
        try {
          const ab = await saved.blob.arrayBuffer();
          const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(ab);
          trimPositions.set(blobUrl, { start: 0, end: decoded.duration });
        } catch (e) { /* ignore */ }
        files.push({ url: blobUrl, name: saved.name || `sample-${id}` });
      }
    }
    const name = prompt('Nom du preset :', 'Preset assemblé');
    const preset = { name: name || 'Preset assemblé', files, originalFiles: [] };
    presets.push(preset); fillPresetSelect(presets); presetSelect.value = String(presets.length - 1);
    await loadPresetByIndex(presets.length - 1);
    showStatus('Preset créé (' + files.length + ' sons)');
    const panelMain = document.getElementById('createPresetPanel'); if (panelMain) panelMain.remove();
  });
  panel.appendChild(createBtn);

  parentPanel.appendChild(panel);
}

async function renderSavedSamplesList() {
  if (!savedSamplesContainer) return;
  const list = document.getElementById('savedSamplesList');
  if (!list) return; // list was removed from the simplified UI
  list.innerHTML = '';

  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp || !audioSamplerComp.recorder) return;

  const samples = await audioSamplerComp.recorder.getAllSamples();
  if (!samples || samples.length === 0) {
    const p = document.createElement('div');
    p.textContent = 'Aucun sample enregistré pour l\'instant.';
    p.style.opacity = '0.8';
    list.appendChild(p);
    return;
  }

  for (const s of samples) {
    const card = document.createElement('div');
    card.style.padding = '0.5rem';
    card.style.border = '1px solid rgba(148,163,184,0.08)';
    card.style.borderRadius = '6px';
    card.style.background = 'rgba(17,24,39,0.35)';

    const title = document.createElement('div');
    title.textContent = s.name || `Sample ${s.id}`;
    title.style.fontWeight = '600';
    title.style.fontSize = '0.9rem';
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.style.fontSize = '0.8rem';
    meta.style.opacity = '0.8';
    meta.textContent = new Date(s.createdAt).toLocaleString();
    card.appendChild(meta);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '0.3rem';
    btnRow.style.marginTop = '0.5rem';

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Ajouter au preset';
    addBtn.classList.add('control-btn');
    addBtn.addEventListener('click', () => addSavedSampleToPreset(s.id));
    btnRow.appendChild(addBtn);

    // Button: create instrument (16 pitch-mapped notes)
    const instrBtn = document.createElement('button');
    instrBtn.textContent = 'Créer instrument (16 notes)';
    instrBtn.classList.add('control-btn');
    instrBtn.addEventListener('click', async () => {
      try {
        await createInstrumentFromSavedSample(s.id);
        closeAddSoundMenu();
      } catch (e) { showError('Erreur création instrument: ' + (e.message||e)); }
    });
    btnRow.appendChild(instrBtn);

    // Button: split recording into multiple samples and create preset
    const splitBtn = document.createElement('button');
    splitBtn.textContent = 'Créer preset depuis enregistrement';
    splitBtn.classList.add('control-btn');
    splitBtn.addEventListener('click', async () => {
      try {
        await createPresetFromSavedSampleSegments(s.id);
        closeAddSoundMenu();
      } catch (e) { showError('Erreur création preset: ' + (e.message||e)); }
    });
    btnRow.appendChild(splitBtn);



    const delBtn = document.createElement('button');
    delBtn.textContent = 'Supprimer';
    delBtn.classList.add('control-btn');
    delBtn.addEventListener('click', async () => {
      if (!confirm('Supprimer ce sample définitivement ?')) return;
      await audioSamplerComp.recorder.deleteSample(s.id);
      renderSavedSamplesList();
    });
    btnRow.appendChild(delBtn);

    card.appendChild(btnRow);
    list.appendChild(card);
  }
}

async function addSavedSampleToPreset(id) {
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp) return;
  try {
    const saved = await audioSamplerComp.recorder.getSample(id);
    if (!saved || !saved.blob) throw new Error('Sample introuvable');
    const blobUrl = URL.createObjectURL(saved.blob);
    if (!presets[currentPresetIndex]) presets[currentPresetIndex] = { name: 'Custom', files: [] };
    // Trouve la première case vide si possible
    const files = presets[currentPresetIndex].files || [];
    const entry = { url: blobUrl, name: saved.name || (`sample-${id}`) };
    if (files.length < 16) {
      files.push(entry);
    } else {
      // remplace le dernier par défaut
      files[files.length - 1] = entry;
    }
    presets[currentPresetIndex].files = files;
    await loadPresetByIndex(currentPresetIndex);
    showStatus('Sample ajouté au preset.');
  } catch (err) {
    showError('Erreur ajout sample: ' + (err.message || err));
  }
}

  // Ajoute un sample externe (URL) au preset courant
  async function addPresetSampleByUrl(url, name) {
    try {
      if (!presets[currentPresetIndex]) presets[currentPresetIndex] = { name: 'Custom', files: [] };
      const files = presets[currentPresetIndex].files || [];
      const entry = { url, name: name || formatSampleNameFromUrl(url) };
      if (files.length < 16) {
        files.push(entry);
      } else {
        files[files.length - 1] = entry;
      }
      presets[currentPresetIndex].files = files;
      await loadPresetByIndex(currentPresetIndex);
      showStatus('Sample ajouté au preset.');
    } catch (err) {
      showError('Erreur ajout sample: ' + (err.message || err));
    }
  }

async function downloadSavedSample(id, name) {
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp) return;
  try {
    const saved = await audioSamplerComp.recorder.getSample(id);
    if (!saved || !saved.blob) throw new Error('Sample introuvable');
    // Tenter de convertir en WAV via AudioBuffer si possible pour compatibilité
    let outBlob = saved.blob;
    try {
      const arrayBuffer = await saved.blob.arrayBuffer();
      const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(arrayBuffer);
      outBlob = audioSamplerComp.recorder.audioBufferToWavBlob(decoded);
    } catch (convErr) {
      // Si conversion échoue, on tombe back au blob original
      console.warn('Conversion WAV échouée, téléchargement du blob natif', convErr);
      outBlob = saved.blob;
    }
    const a = document.createElement('a');
    const url = URL.createObjectURL(outBlob);
    a.href = url;
    a.download = (saved.name || name || `sample-${id}`).replace(/[^a-zA-Z0-9._-]/g, '_') + (outBlob.type && outBlob.type.includes('wav') ? '.wav' : '.bin');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Erreur téléchargement: ' + (err.message || err));
  }
}

async function onImportSoundFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp) return;
  try {
    const id = await audioSamplerComp.recorder.saveSample(f, { name: f.name });
    await renderSavedSamplesList();
    showStatus('Sample importé et sauvegardé (id ' + id + ')');
    // Ajoute automatiquement le sample importé au preset courant (pour workflow simple)
    await addSavedSampleToPreset(id);
  } catch (err) {
    showError('Erreur import fichier: ' + (err.message || err));
  } finally {
    ev.target.value = '';
  }
}

async function exportCurrentPresetToFile() {
  const preset = presets[currentPresetIndex];
  if (!preset) return showError('Aucun preset actif');
  showStatus('Préparation export...');
  try {
    const filesData = [];
    for (const fileEntry of preset.files || []) {
      const url = (typeof fileEntry === 'string') ? fileEntry : fileEntry.url;
      // fetch le contenu (fonctionne pour blob: et http:)
      const resp = await fetch(url);
      const blob = await resp.blob();
      const base64 = await blobToDataURL(blob);
      filesData.push({ name: (fileEntry && fileEntry.name) ? fileEntry.name : extractFileName(url), dataUrl: base64 });
    }
    const out = { name: preset.name || 'preset', files: filesData };
    const blobOut = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blobOut);
    a.href = url;
    a.download = (preset.name || 'preset') + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showStatus('Export terminé');
  } catch (err) {
    showError('Erreur export preset: ' + (err.message || err));
  }
}

function extractFileName(url) {
  try { return decodeURIComponent((url || '').split('/').pop()) || 'file'; } catch { return 'file'; }
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function onImportPresetFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const txt = await f.text();
  try {
    const data = JSON.parse(txt);
    const audioSamplerComp = document.querySelector('audio-sampler');
    if (!audioSamplerComp) return;
    const newPreset = { name: data.name || f.name.replace(/\.json$/, ''), files: [], originalFiles: [] };
    for (const fileObj of data.files || []) {
      // fileObj.dataUrl -> convertir en blob
      const resp = await fetch(fileObj.dataUrl);
      const blob = await resp.blob();
      const id = await audioSamplerComp.recorder.saveSample(blob, { name: fileObj.name || 'imported' });
      const saved = await audioSamplerComp.recorder.getSample(id);
      const blobUrl = URL.createObjectURL(saved.blob);
      newPreset.files.push({ url: blobUrl, name: saved.name || fileObj.name || `sample-${id}` });
    }
    presets.push(newPreset);
    fillPresetSelect(presets);
    presetSelect.value = String(presets.length - 1);
    await loadPresetByIndex(presets.length - 1);
    renderSavedSamplesList();
    showStatus('Preset importé');
  } catch (err) {
    showError('Erreur import preset: ' + (err.message || err));
  } finally {
    ev.target.value = '';
  }
}

async function createNewEmptyPreset() {
  const name = prompt('Nom du nouveau preset :', 'Nouveau preset');
  if (!name) return;
  const p = { name, files: [], originalFiles: [] };
  presets.push(p);
  fillPresetSelect(presets);
  presetSelect.value = String(presets.length - 1);
  await loadPresetByIndex(presets.length - 1);
}

async function resetCurrentPreset() {
  const p = presets[currentPresetIndex];
  if (!p) return;
  p.files = Array.isArray(p.originalFiles) ? [...p.originalFiles] : [];
  await loadPresetByIndex(currentPresetIndex);
  showStatus('Preset réinitialisé');
}


// Met à jour les labels de touches sur les pads existants
function updatePadKeyLabels() {
  // Reconstruit le mapping clavier avec les nouvelles touches
  keyToPadIndex.clear();
  
  // Parcourt TOUS les enfants (boutons + empty) pour avoir le bon padIndex
  const children = Array.from(buttonsContainer.children);
  children.forEach((child, padIndex) => {
    if (child.tagName === 'BUTTON') {
      const keyLabel = child.querySelector('.pad-key');
      if (keyLabel && padIndex < PAD_LABELS.length) {
        keyLabel.textContent = PAD_LABELS[padIndex].toUpperCase();
      }
      // Met à jour le mapping clavier avec le BON padIndex
      const key = PAD_KEYS[padIndex];
      if (key && padIndex < padPlayFns.length && padPlayFns[padIndex]) {
        keyToPadIndex.set(key, padIndex);
      }
    }
  });
  
  console.log('Updated key mapping:', Object.fromEntries(keyToPadIndex));
}

// ---------- Chargement d'un preset ----------
// Fonction critique qui :
// 1) décode tous les fichiers du preset en parallèle (AudioBuffer)
// 2) initialise la grille 4x4 de pads (remplit les cases vides si nécessaire)
// 3) associe à chaque pad : le DOM button, la fonction de lecture, et la touche clavier
// 4) restaure les positions de trim si elles ont été sauvegardées pour un fichier
// 5) met à jour le statut affiché (nom du preset, nombre de sons)
// Important : cette fonction peut être lourde (décodage audio). Elle affiche
// un message de chargement et tente de `ctx.resume()` si nécessaire.

async function loadPresetByIndex(idx) {
  // mémorise l'index du preset courant pour intégration avec l'enregistreur
  currentPresetIndex = idx;
  const preset = presets[idx];
  if (!preset) return;

  resetButtons();
  showError('');
  showStatus(`Loading ${preset.files.length} file(s)…`);

  try {
    // 1) charge + décode en parallèle
    // On construit d'abord des entrées normalisées { url, name }
    const fileEntries = (preset.files || []).map(f => {
      if (typeof f === 'string') return { url: f, name: formatSampleNameFromUrl(f), playbackRate: 1 };
      return { url: f.url, name: f.name || formatSampleNameFromUrl(f.url), playbackRate: (typeof f.playbackRate === 'number' ? f.playbackRate : 1) };
    });
    const buffers = await Promise.all(fileEntries.map(e => loadAndDecodeSound(e.url, ctx)));

    // Normalise decodedSounds pour contenir le buffer + métadonnées (et playbackRate par défaut)
    decodedSounds = buffers.map((buf, i) => ({ buffer: buf, url: fileEntries[i].url, name: fileEntries[i].name, playbackRate: fileEntries[i].playbackRate || 1 }));

    // Tente de reprendre l'AudioContext (non bloquant)
    // Note: peut échouer si aucune interaction utilisateur n'a eu lieu
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        audioContextResumed = true;
        console.log('AudioContext resumed on preset load');
      }).catch(e => console.log('AudioContext resume:', e.message));
    } else {
      audioContextResumed = true;
    }

  // 2) génère une grille de 4x4 pads (bas → haut, gauche → droite)
  // (réinitialise le mapping clavier pour ce preset)
  keyToPadIndex = new Map();
  padPlayFns = [];
  const rows = 4, cols = 4, total = rows * cols;
    for (let padIndex = 0; padIndex < total; padIndex++) {
      // Position dans la grille: ligne depuis le bas
      const rowFromBottom = Math.floor(padIndex / cols); // 0..3
      const col = (padIndex % cols) + 1;                 // 1..4
      const row = (rows - rowFromBottom);                // 4..1 → gridRowStart

      if (padIndex < decodedSounds.length) {
        const entryObj = decodedSounds[padIndex];
        const decodedSound = entryObj.buffer;
        const url = entryObj.url;
        const playbackRate = entryObj.playbackRate || 1;
        let displayName = entryObj.name || (url ? formatSampleNameFromUrl(url) : `Sample ${padIndex + 1}`);
        // Évite d'afficher des identifiants hex longs (ex: blob ids)
        const compact = String(displayName).replace(/\s+/g, '');
        if (/^[0-9a-fA-F\-]{6,}$/.test(compact)) {
          displayName = entry && entry.name ? entry.name : 'Sample';
        }
        const fileName = (() => { try { return decodeURIComponent((url && url.split('/').pop()) || ''); } catch { return (url && url.split('/').pop()) || ''; } })();

        const btn = document.createElement('button');
        // Structure en 2 lignes: Play N°x (titre) + nom du son (sous-titre) + touche clavier
        btn.innerHTML = `
          <span class="pad-title">Play n°${padIndex + 1}</span>
          <span class="pad-subtitle">${displayName}</span>
          <span class="pad-key">${(PAD_LABELS[padIndex] || '').toUpperCase()}</span>
        `;
        btn.title = fileName || displayName; // tooltip: nom de fichier d'origine
        btn.style.gridRowStart = String(row);
        btn.style.gridColumnStart = String(col);

          const playFn = () => {
          // Effet visuel: ajoute la classe "playing" temporairement
          btn.classList.add('playing');
          setTimeout(() => btn.classList.remove('playing'), 600);
          
          // Affiche la waveform + barres de trim avec infos du pad
          try {
            showWaveformForSound(decodedSound, url, padIndex, displayName);
          } catch (err) {
            console.warn('Unable to show waveform', err);
          }

          // Reprend l'AudioContext (politique autoplay) - marque comme activé
          if (ctx.state === 'suspended') {
            ctx.resume().then(() => {
              audioContextResumed = true;
              console.log('AudioContext resumed');
            });
          } else {
            audioContextResumed = true;
          }

          // Calcule start/end depuis les trims
          let start = 0;
          let end = decodedSound.duration;
          const stored = trimPositions.get(url);
          if (stored) {
            start = stored.start;
            end = stored.end;
          } else if (trimbarsDrawer) {
            // Sinon: utilise les positions des barres (pixels → secondes)
            const l = trimbarsDrawer.leftTrimBar.x;
            const r = trimbarsDrawer.rightTrimBar.x;
            start = pixelToSeconds(l, decodedSound.duration, waveformCanvas.width);
            end = pixelToSeconds(r, decodedSound.duration, waveformCanvas.width);
          }

          // Bornage
          start = Math.max(0, Math.min(start, decodedSound.duration));
          end = Math.max(start + 0.01, Math.min(end, decodedSound.duration));

          // Mémorise les trims choisis
          trimPositions.set(url, { start, end });

          // Stop lecture précédente, puis joue et mémorise pour le curseur
          stopCurrentPlayback();
          const src = playSound(ctx, decodedSound, start, end, playbackRate);
          if (src) {
            currentSource = src;
            playStartCtxTime = ctx.currentTime;
            playStartSec = start;
            playEndSec = end;
            src.onended = () => { currentSource = null; };
          }
        };
        padPlayFns[padIndex] = playFn;
        btn.addEventListener('click', playFn);
        buttonsContainer.appendChild(btn);

        // mapping clavier pour ce pad
        const key = PAD_KEYS[padIndex];
        if (key) keyToPadIndex.set(key, padIndex);
      } else {
        // Case vide pour compléter la matrice 4x4
        const empty = document.createElement('div');
        empty.className = 'pad-empty';
        empty.style.gridRowStart = String(row);
        empty.style.gridColumnStart = String(col);
        buttonsContainer.appendChild(empty);
      }
    }

    // Affiche le status sur deux lignes, centré
    statusEl.innerHTML = `
      <span class="status-label">Loaded preset</span>
      <span class="status-value">${preset.name} (${decodedSounds.length} sounds)</span>
    `;
  } catch (err) {
    console.error(err);
    showError(`Erreur lors du chargement du preset "${preset.name}": ${err.message || err}`);
  }
}

// ---------- Waveform + trimbars UI helpers ----------
// Ces fonctions créent et gèrent l'UI de la waveform :
// - canvas principal pour le tracé de la waveform
// - canvas overlay pour les trimbars et la tête de lecture (playhead)
// - objet `TrimbarsDrawer` qui encapsule la logique d'interaction (drag/drop)
// - bouton "Stop" adjacent : appelle `stopCurrentPlayback()` sans casser le layout
// Le dessin de la waveform est découpé en deux responsabilités :
//   drawWaveform(buffer, canvas) => rendu statique de la forme d'onde
//   animateOverlay() => RAF loop pour dessiner trimbars et playhead en temps réel
function createWaveformUI() {
  // Wrapper pour waveform + bouton Stop
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.gap = '12px';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.margin = '4px auto';
  wrapper.style.maxWidth = '900px';
  wrapper.style.width = '100%';

  const container = document.createElement('div');
  container.id = 'waveformContainer';
  container.style.position = 'relative';
  container.style.flex = '1';
  container.style.maxWidth = '800px';
  container.style.boxSizing = 'border-box';

  waveformCanvas = document.createElement('canvas');
  waveformCanvas.width = 800;
  waveformCanvas.height = 100;
  waveformCanvas.style.width = '100%';
  waveformCanvas.style.display = 'block';
  // bordure adaptée au thème sombre (gris ardoise)
  waveformCanvas.style.border = '1px solid #334155';
  waveformCanvas.style.zIndex = '1';
  container.appendChild(waveformCanvas);

  overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = 800;
  overlayCanvas.height = 100;
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.left = '0';
  overlayCanvas.style.top = '0';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.pointerEvents = 'auto';
  overlayCanvas.style.zIndex = '2';
  overlayCanvas.style.background = 'transparent';
  container.appendChild(overlayCanvas);

  // Bouton Stop avec style cohérent
  const stopBtn = document.createElement('button');
  stopBtn.id = 'stopButton';
  stopBtn.textContent = 'Stop';
  stopBtn.classList.add('control-btn');
  // keep sizing inline to match canvas height
  stopBtn.style.height = '100px'; // même hauteur que le canvas
  stopBtn.style.minWidth = '60px';
  
  stopBtn.onmouseover = () => {
    stopBtn.style.borderColor = 'var(--btn-border-hover)';
    stopBtn.style.background = 'rgba(17, 24, 39, 0.95)';
  };
  
  stopBtn.onmouseout = () => {
    stopBtn.style.borderColor = 'var(--btn-border-start)';
    stopBtn.style.background = 'rgba(17, 24, 39, 0.8)';
  };
  
  stopBtn.onclick = () => {
    stopCurrentPlayback();
  };

  wrapper.appendChild(container);
  wrapper.appendChild(stopBtn);

  // Pas de timeline (graduations) demandée — on simplifie l'UI

  buttonsContainer.insertAdjacentElement('afterend', wrapper);

  trimbarsDrawer = new TrimbarsDrawer(overlayCanvas, 100, 200);

  // convert client coordinates to canvas pixel coordinates (account for DPR)
  overlayCanvas.onmousemove = (evt) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    mousePos.x = (evt.clientX - rect.left) * scaleX;
    mousePos.y = (evt.clientY - rect.top) * scaleY;
    trimbarsDrawer.moveTrimBars(mousePos);
  };

  overlayCanvas.onmousedown = () => trimbarsDrawer.startDrag();

  function stopDragAndSave() {
    trimbarsDrawer.stopDrag();
    // save current trim positions for the current sound (if any)
    if (currentShownBuffer && currentShownUrl) {
      const leftPx = trimbarsDrawer.leftTrimBar.x;
      const rightPx = trimbarsDrawer.rightTrimBar.x;
      const leftSec = pixelToSeconds(leftPx, currentShownBuffer.duration, waveformCanvas.width);
      const rightSec = pixelToSeconds(rightPx, currentShownBuffer.duration, waveformCanvas.width);
      trimPositions.set(currentShownUrl, { start: leftSec, end: rightSec });
    }
  }

  overlayCanvas.onmouseup = stopDragAndSave;
  // ensure we also catch mouseup outside the canvas
  window.addEventListener('mouseup', (evt) => {
    // if a drag was in progress, stop it and save
    if ((trimbarsDrawer.leftTrimBar && trimbarsDrawer.leftTrimBar.dragged) ||
        (trimbarsDrawer.rightTrimBar && trimbarsDrawer.rightTrimBar.dragged)) {
      stopDragAndSave();
    }
  });

  requestAnimationFrame(animateOverlay);
  wrapper.style.display = 'none'; // cache le wrapper au départ

  // Zone d'information temps sous la waveform
  timeInfoEl = document.createElement('div');
  timeInfoEl.id = 'timeInfo';
  timeInfoEl.style.textAlign = 'center';
  timeInfoEl.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  timeInfoEl.style.fontSize = '0.85rem';
  timeInfoEl.style.marginTop = '2px';
  timeInfoEl.textContent = '';
  wrapper.insertAdjacentElement('afterend', timeInfoEl);
  
  // Zone d'affichage du nom du sample joué
  sampleNameEl = document.createElement('div');
  sampleNameEl.id = 'sampleName';
  sampleNameEl.textContent = '';
  sampleNameEl.className = 'sample-name';
  timeInfoEl.insertAdjacentElement('afterend', sampleNameEl);
}

function showWaveformForSound(buffer, url, padIndex = null, sampleName = null) {
  if (!waveformCanvas) return;
  const container = waveformCanvas.parentElement;
  const wrapper = container.parentElement; // le wrapper contient container + stopBtn
  wrapper.style.display = 'flex';
  currentShownBuffer = buffer;
  currentShownUrl = url;
  currentShownPadIndex = padIndex;
  currentShownSampleName = sampleName;

  // draw waveform
  drawWaveform(buffer, waveformCanvas);

  // restore trims (seconds -> pixels)
  const stored = trimPositions.get(url) || { start: 0, end: buffer.duration };
  const leftPx = (stored.start / buffer.duration) * waveformCanvas.width;
  const rightPx = (stored.end / buffer.duration) * waveformCanvas.width;
  trimbarsDrawer.leftTrimBar.x = leftPx;
  trimbarsDrawer.rightTrimBar.x = rightPx;
  // ensure a normalized entry
  trimPositions.set(url, { start: stored.start, end: stored.end });

  // met à jour l'affichage des temps et du nom du sample
  updateTimeInfo();
  updateSampleName();
}

// overlay draw loop
// Boucle d'animation pour l'overlay (FR)
// - Exécutée via requestAnimationFrame
// - Efface et redessine les trimbars (via TrimbarsDrawer)
// - Si une lecture est active, calcule la position temporelle et dessine
//   la tête de lecture (playhead)
// - Met à jour également les étiquettes temporelles proches des poignées
function animateOverlay() {
  if (trimbarsDrawer && overlayCanvas) {
    trimbarsDrawer.clear();
    trimbarsDrawer.draw();

    // Dessine la tête de lecture si une lecture est en cours
    if (currentSource && currentShownBuffer) {
      const now = ctx.currentTime;
      const elapsed = Math.max(0, now - playStartCtxTime);
      const posSec = playStartSec + elapsed;

      // Si on a atteint la fin, on nettoie et on ne trace pas
      if (posSec >= playEndSec) {
        currentSource = null;
      } else {
        const x = (posSec / currentShownBuffer.duration) * overlayCanvas.width;
        const g = overlayCanvas.getContext('2d');
        g.save();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3; // élargie pour meilleure visibilité
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, overlayCanvas.height);
        g.stroke();
        g.restore();
      }
    }

    // Dessine des étiquettes de temps au niveau des poignées de trim
    if (currentShownBuffer && trimbarsDrawer) {
      const dur = currentShownBuffer.duration;
      const g = overlayCanvas.getContext('2d');
      const leftSec = pixelToSeconds(trimbarsDrawer.leftTrimBar.x, dur, overlayCanvas.width);
      const rightSec = pixelToSeconds(trimbarsDrawer.rightTrimBar.x, dur, overlayCanvas.width);

      g.save();
      g.font = `${11 * (window.devicePixelRatio || 1)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      g.textBaseline = 'top';

      const padX = 8, padY = 4;
      function drawLabel(x, y, text, color) {
        const metrics = g.measureText(text);
        const w = metrics.width + padX * 2;
        const h = 18;
        const rx = 6;
        
        // Fond semi-transparent avec la couleur de la barre
        g.fillStyle = `rgba(${color === 'left' ? '167, 139, 250' : '103, 232, 249'}, 0.25)`;
        g.beginPath();
        g.moveTo(x - w / 2 + rx, y);
        g.lineTo(x + w / 2 - rx, y);
        g.arcTo(x + w / 2, y, x + w / 2, y + rx, rx);
        g.lineTo(x + w / 2, y + h - rx);
        g.arcTo(x + w / 2, y + h, x + w / 2 - rx, y + h, rx);
        g.lineTo(x - w / 2 + rx, y + h);
        g.arcTo(x - w / 2, y + h, x - w / 2, y + h - rx, rx);
        g.lineTo(x - w / 2, y + rx);
        g.arcTo(x - w / 2, y, x - w / 2 + rx, y, rx);
        g.fill();
        
        // Bordure colorée
        g.strokeStyle = color === 'left' ? '#a78bfa' : '#67e8f9';
        g.lineWidth = 1.5;
        g.stroke();
        
        // Texte blanc
        g.fillStyle = '#ffffff';
        g.fillText(text, x - metrics.width / 2, y + padY);
      }

      drawLabel(trimbarsDrawer.leftTrimBar.x, 30, formatTime(leftSec), 'left');
      drawLabel(trimbarsDrawer.rightTrimBar.x, 30, formatTime(rightSec), 'right');
      g.restore();
    }
  }
  // Met à jour l'affichage Début/Fin/Durée en continu (drag/lecture)
  updateTimeInfo();
  requestAnimationFrame(animateOverlay);
}

// Arrête la lecture en cours (si présente) et nettoie l’état
// Cette fonction est utilisée par le bouton Stop et avant de lancer
// une nouvelle lecture pour s'assurer qu'il n'y ait pas de sources en conflit.
function stopCurrentPlayback() {
  if (currentSource) {
    try { currentSource.stop(0); } catch (_) {}
    try { currentSource.disconnect(); } catch (_) {}
    currentSource = null;
  }
}

// Dessine la waveform statique sur le canvas principal
// - Convertit les échantillons audio en représentation visuelle (min/max par pixel)
// - Utilise un dégradé violet→cyan constant pour la cohérence visuelle
// - Met à jour la taille du overlay pour correspondre à la résolution réelle (DPR)
function drawWaveform(buffer, canvas) {
  const cw = canvas.width = Math.floor(canvas.clientWidth * (window.devicePixelRatio || 1));
  const ch = canvas.height = Math.floor(100 * (window.devicePixelRatio || 1));
  // keep overlay canvas in sync (pixel size)
  if (overlayCanvas) {
    overlayCanvas.width = cw;
    overlayCanvas.height = ch;
  }
  const ctx2 = canvas.getContext('2d');
  ctx2.clearRect(0, 0, cw, ch);

  // Use first channel (or mix if needed)
  const channelData = buffer.numberOfChannels > 0 ? buffer.getChannelData(0) : new Float32Array(0);
  const step = Math.max(1, Math.floor(channelData.length / cw));
  // fond sombre — utilise la variable CSS si disponible
  const cs = getComputedStyle(canvas);
  const waveFill = (cs && cs.getPropertyValue('--wave-fill')) ? cs.getPropertyValue('--wave-fill').trim() : '#0b1220';
  ctx2.fillStyle = waveFill;
  ctx2.fillRect(0, 0, cw, ch);
  // Épaisseur légèrement accrue pour mieux voir les couleurs
  ctx2.lineWidth = 2;
  // Dégradé de la waveform — construit depuis les variables CSS (si présentes)
  const grad = makeWaveformGradient(ctx2, cw);
  ctx2.strokeStyle = grad;
  ctx2.beginPath();

  for (let i = 0; i < cw; i++) {
    const start = i * step;
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step && (start + j) < channelData.length; j++) {
      const v = channelData[start + j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const y1 = ((1 + max) / 2) * ch;
    const y2 = ((1 + min) / 2) * ch;
    ctx2.moveTo(i + 0.5, y1);
    ctx2.lineTo(i + 0.5, y2);
  }
  ctx2.stroke();
}

// Dégradé horizontal pour la waveform — lit les couleurs depuis les variables CSS
function makeWaveformGradient(ctx, width) {
  const style = getComputedStyle(ctx.canvas || document.documentElement);
  const c1 = (style.getPropertyValue('--wave-grad-1') || 'rgba(167, 139, 250, 0.98)').trim();
  const c2 = (style.getPropertyValue('--wave-grad-2') || 'rgba(147, 197, 253, 0.98)').trim();
  const c3 = (style.getPropertyValue('--wave-grad-3') || 'rgba(103, 232, 249, 0.98)').trim();

  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0.00, c1);
  g.addColorStop(0.50, c2);
  g.addColorStop(1.00, c3);
  return g;
}

// Met à jour l'affichage textuel des temps (début/fin/durée/position)
// Met à jour l'affichage textuel des temps (Start/End/Duration)
// Cette fonction lit les trims courants (stockés ou via trimbars) et formate
// les valeurs pour affichage sous la waveform.
function updateTimeInfo() {
  if (!timeInfoEl || !currentShownBuffer) return;
  const dur = currentShownBuffer.duration;
  let startSec = 0, endSec = dur;
  const stored = currentShownUrl && trimPositions.get(currentShownUrl);
  if (stored) { startSec = stored.start; endSec = stored.end; }
  else if (trimbarsDrawer) {
    const l = trimbarsDrawer.leftTrimBar.x;
    const r = trimbarsDrawer.rightTrimBar.x;
    startSec = pixelToSeconds(l, dur, waveformCanvas.width);
    endSec = pixelToSeconds(r, dur, waveformCanvas.width);
  }
  const selDur = Math.max(0, endSec - startSec);

  // Affiche uniquement Start / End / Duration (pas de position demandée)
  timeInfoEl.textContent = `Start: ${formatTime(startSec)}  —  End: ${formatTime(endSec)}  —  Duration: ${formatTime(selDur)}`;
}

// Met à jour l'affichage du nom du sample
// Met à jour l'affichage du nom du sample actuellement montré
// Affiche "Play n°X — SampleName" si un pad est sélectionné, sinon vide.
function updateSampleName() {
  if (!sampleNameEl) return;
  if (currentShownPadIndex !== null && currentShownSampleName) {
    sampleNameEl.textContent = `Play n°${currentShownPadIndex + 1} — ${currentShownSampleName}`;
  } else {
    sampleNameEl.textContent = '';
  }
}

// Crée un instrument (16 notes pitchées) à partir d'un sample sauvegardé (IndexedDB)
async function createInstrumentFromSavedSample(id) {
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp || !audioSamplerComp.recorder) throw new Error('Composant recorder introuvable');
  const saved = await audioSamplerComp.recorder.getSample(id);
  if (!saved || !saved.blob) throw new Error('Sample introuvable');
  const blobUrl = URL.createObjectURL(saved.blob);
  const name = saved.name || `sample-${id}`;
  await createInstrumentFromBufferUrl(blobUrl, name);
}

// Crée un instrument (preset) à partir d'un URL/Blob URL qui contient un sample unique
// Le preset contiendra 16 entrées utilisant la même source mais avec playbackRate différents
async function createInstrumentFromBufferUrl(url, baseName = 'Instrument') {
  // Decode the URL and trim leading silence so the instrument won't have a blank
  // before the first note even if the source contains a leading gap.
  try {
    const resp = await fetch(url);
    const ab = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    const trimmed = trimLeadingSilence(decoded, 0.01);

    // If we can access the recorder util, convert trimmed buffer to WAV blob
    const audioSamplerComp = document.querySelector('audio-sampler');
    let useUrl = url;
    if (audioSamplerComp && audioSamplerComp.recorder) {
      const wav = audioSamplerComp.recorder.audioBufferToWavBlob(trimmed);
      useUrl = URL.createObjectURL(wav);
    } else {
      // If no recorder available, fall back to using the original url but set trimPositions
      useUrl = url;
    }

    // Ensure trimPositions so playback starts at trimmed buffer start
    trimPositions.set(useUrl, { start: 0, end: trimmed.duration });

    // Construire 16 offsets en demi-tons (par défaut: -12 .. +3)
    const offsets = Array.from({ length: 16 }, (_, i) => i - 12);
    const entries = offsets.map(o => ({ url: useUrl, name: baseName, playbackRate: Math.pow(2, o / 12) }));
    const preset = { name: `${baseName} (instrument)`, files: entries, originalFiles: [] };
    presets.push(preset);
    fillPresetSelect(presets);
    presetSelect.value = String(presets.length - 1);
    await loadPresetByIndex(presets.length - 1);
    showStatus(`Instrument créé à partir de ${baseName}`);
  } catch (err) {
    showError('Erreur création instrument: ' + (err.message || err));
  }
}

// Scinde un AudioBuffer en segments en détectant les silences.
// Retourne un tableau d'AudioBuffer (segments non vides)
function splitBufferOnSilence(buffer, threshold = 0.008, minSegmentDuration = 0.04) {
  // Improved silence-splitting using short-window RMS (smoother envelope).
  // - threshold: RMS amplitude under which we consider "silence" (default low to be permissive)
  // - minSegmentDuration: minimal duration in seconds for a valid segment
  const sr = buffer.sampleRate;
  const minSegSamples = Math.floor(minSegmentDuration * sr);
  const chCount = buffer.numberOfChannels;
  const len = buffer.length;

  // Window size for RMS in samples (10ms typical)
  const winMs = 0.010; // 10 ms
  const winSize = Math.max(1, Math.floor(winMs * sr));

  // Build mono RMS envelope (moving RMS across channels)
  const env = new Float32Array(len);
  // Precompute per-channel data references
  const channels = [];
  for (let ch = 0; ch < chCount; ch++) channels.push(buffer.getChannelData(ch));

  // Compute RMS per sample by summing squares across channels then taking sqrt
  // We'll compute a running sum of squares over the window to be efficient
  const sqSums = new Float32Array(len);
  for (let ch = 0; ch < chCount; ch++) {
    const src = channels[ch];
    for (let i = 0; i < len; i++) {
      const v = src[i];
      sqSums[i] += v * v;
    }
  }

  // now compute moving average of sqSums over window and take sqrt
  let windowSum = 0;
  for (let i = 0; i < len; i++) {
    windowSum += sqSums[i];
    if (i - winSize >= 0) windowSum -= sqSums[i - winSize];
    const denom = Math.min(winSize, i + 1);
    const meanSq = windowSum / denom / chCount; // average per-channel
    env[i] = Math.sqrt(meanSq);
  }

  const segments = [];
  let i = 0;
  while (i < len) {
    // skip silence
    while (i < len && env[i] <= threshold) i++;
    if (i >= len) break;
    const start = i;
    // find end of segment
    while (i < len && env[i] > threshold) i++;
    const end = i;
    if (end - start >= minSegSamples) {
      const segLen = end - start;
      const newBuf = ctx.createBuffer(chCount, segLen, sr);
      for (let ch = 0; ch < chCount; ch++) {
        const src = channels[ch];
        const dst = newBuf.getChannelData(ch);
        for (let k = 0; k < segLen; k++) dst[k] = src[start + k];
      }
      segments.push(newBuf);
    }
  }
  return segments;
}

// Crée un preset en scindant un sample sauvegardé en plusieurs segments (silences)
async function createPresetFromSavedSampleSegments(id) {
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp || !audioSamplerComp.recorder) throw new Error('Composant recorder introuvable');
  const saved = await audioSamplerComp.recorder.getSample(id);
  if (!saved || !saved.blob) throw new Error('Sample introuvable');
  const arrayBuffer = await saved.blob.arrayBuffer();
  const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(arrayBuffer);
  const segments = splitBufferOnSilence(decoded, 0.02, 0.04);
  if (!segments || segments.length === 0) throw new Error('Aucun segment détecté');

  const files = [];
  for (let i = 0; i < segments.length && files.length < 16; i++) {
    const seg = segments[i];
    // Convertir en WAV blob via le recorder utilitaire
    const blob = audioSamplerComp.recorder.audioBufferToWavBlob(seg);
    const blobUrl = URL.createObjectURL(blob);
    // Ensure the trim for this new blob starts at 0
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    files.push({ url: blobUrl, name: (saved.name || `sample-${id}`) + `-part${i + 1}` });
  }
  const preset = { name: `${saved.name || 'Sample'} (split)`, files, originalFiles: [] };
  presets.push(preset);
  fillPresetSelect(presets);
  presetSelect.value = String(presets.length - 1);
  await loadPresetByIndex(presets.length - 1);
  showStatus(`Preset créé (${files.length} sons) à partir de ${saved.name || id}`);
}

// Create a preset by splitting an AudioBuffer (not necessarily saved) into segments
async function createPresetFromBufferSegments(buffer, baseName = 'Recording') {
  if (!buffer) throw new Error('AudioBuffer manquant');
  showStatus('Détection des segments (split) en cours…');
  const segments = splitBufferOnSilence(buffer, 0.008, 0.04);
  if (!segments || segments.length === 0) {
    showError('Aucun segment détecté — essayez d\'enregistrer à nouveau ou ajustez le seuil.');
    return;
  }
  const files = [];
  const audioSamplerComp = document.querySelector('audio-sampler');
  for (let i = 0; i < segments.length && files.length < 16; i++) {
    const seg = segments[i];
    const blob = audioSamplerComp ? audioSamplerComp.recorder.audioBufferToWavBlob(seg) : null;
    if (!blob) continue;
    const blobUrl = URL.createObjectURL(blob);
    // ensure trim starts at 0 for generated blobs
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    files.push({ url: blobUrl, name: `${baseName}-part${i+1}` });
  }
  if (files.length === 0) throw new Error('Aucun segment valide');
  const preset = { name: `${baseName} (split)`, files, originalFiles: [] };
  presets.push(preset);
  fillPresetSelect(presets);
  presetSelect.value = String(presets.length - 1);
  await loadPresetByIndex(presets.length - 1);
  showStatus(`Preset créé (${files.length} sons) à partir de ${baseName}`);
}

// Create an instrument from an AudioBuffer (convert buffer to blob URL first)
async function createInstrumentFromAudioBuffer(buffer, baseName = 'Instrument') {
  if (!buffer) throw new Error('AudioBuffer manquant');
  const audioSamplerComp = document.querySelector('audio-sampler');
  if (!audioSamplerComp) throw new Error('Composant enregistrement introuvable');
  const wav = audioSamplerComp.recorder.audioBufferToWavBlob(buffer);
  const url = URL.createObjectURL(wav);
  await createInstrumentFromBufferUrl(url, baseName);
}

// Trim leading silence from an AudioBuffer (simple threshold on channel 0)
// Returns a new AudioBuffer starting at the first sample above threshold
function trimLeadingSilence(buffer, threshold = 0.01) {
  if (!buffer || buffer.length === 0) return buffer;
  const ch0 = buffer.getChannelData(0);
  let startSample = 0;
  while (startSample < ch0.length && Math.abs(ch0[startSample]) <= threshold) startSample++;
  if (startSample === 0) return buffer;
  const remaining = ch0.length - startSample;
  const newBuf = ctx.createBuffer(buffer.numberOfChannels, remaining, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = newBuf.getChannelData(ch);
    for (let i = 0; i < remaining; i++) dst[i] = src[i + startSample];
  }
  return newBuf;
}