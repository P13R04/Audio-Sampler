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

// UI
const presetSelect = document.getElementById('presetSelect');
const buttonsContainer = document.getElementById('buttonsContainer');
const statusEl = document.getElementById('status');
const errorEl = document.getElementById('error');

// Etat
let presets = [];          // [{ name, files:[absoluteUrl,...] }, ...]
let decodedSounds = [];    // AudioBuffer[] du preset courant
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
window.onload = async function init() {
  ctx = new AudioContext();

  try {
    // 1) Récupère les presets du serveur
    const raw = await fetchPresets(PRESETS_URL);
    presets = normalizePresets(raw); // -> [{name, files:[absUrl,...]}]

    if (!Array.isArray(presets) || presets.length === 0) {
      throw new Error('Aucun preset utilisable dans la réponse du serveur.');
    }

    // 2) Remplit le <select>
    fillPresetSelect(presets);

    // 3) Charge le premier preset par défaut
    presetSelect.disabled = false;
  // crée l'UI waveform (cachée tant qu'aucun son n'est sélectionné)
  createWaveformUI();
  await loadPresetByIndex(0);

    // 4) Changement de preset
    presetSelect.addEventListener('change', async () => {
      const idx = Number(presetSelect.value);
      await loadPresetByIndex(idx);
    });

    // 5) Changement de disposition clavier
    const layoutSelect = document.getElementById('keyboardLayout');
    if (layoutSelect) {
      layoutSelect.addEventListener('change', () => {
        currentLayout = layoutSelect.value;
        PAD_KEYS = currentLayout === 'azerty' ? [...PAD_KEYS_AZERTY] : [...PAD_KEYS_QWERTY];
        PAD_LABELS = currentLayout === 'azerty' ? [...PAD_LABELS_AZERTY] : [...PAD_LABELS_QWERTY];
        
        // Si le contexte a déjà été activé une fois, le réactiver immédiatement
        // (le changement de select compte comme interaction utilisateur)
        if (audioContextResumed && ctx.state === 'suspended') {
          ctx.resume().then(() => {
            console.log('AudioContext re-resumed after layout change');
          }).catch(e => console.warn('Resume failed:', e));
        }
        
        // Met à jour uniquement les labels des touches sans recharger tout le preset
        updatePadKeyLabels();
        
        // IMPORTANT: retire le focus du select pour que les touches clavier fonctionnent
        layoutSelect.blur();
      });
    }

    // Binding clavier (une seule fois)
    if (!keyboardBound) {
      window.addEventListener('keydown', (evt) => {
        let k = (evt.key || '').toLowerCase();
        if (!k) return;
        
        // Gestion des touches numériques en AZERTY: accepter à la fois &,é,",' et 1,2,3,4
        if (currentLayout === 'azerty') {
          if (k === '1') k = '&';
          else if (k === '2') k = 'é';
          else if (k === '3') k = '"';
          else if (k === '4') k = "'";
        }
        
        const idx = keyToPadIndex.get(k);
        if (idx === undefined) return;
        // évite de déclencher si focus est dans un champ de saisie
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        const fn = padPlayFns[idx];
        if (typeof fn === 'function') {
          evt.preventDefault(); // évite le comportement par défaut
          fn();
        }
      });
      keyboardBound = true;
    }

  } catch (err) {
    console.error(err);
    showError(err.message || String(err));
  }
};

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
  const preset = presets[idx];
  if (!preset) return;

  resetButtons();
  showError('');
  showStatus(`Loading ${preset.files.length} file(s)…`);

  try {
    // 1) charge + décode en parallèle
    decodedSounds = await Promise.all(
      preset.files.map(url => loadAndDecodeSound(url, ctx))
    );

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
        const decodedSound = decodedSounds[padIndex];
        const url = preset.files[padIndex];
        const displayName = formatSampleNameFromUrl(url);
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
          const src = playSound(ctx, decodedSound, start, end);
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
  stopBtn.style.padding = '0.6rem 1.2rem';
  stopBtn.style.background = 'rgba(17, 24, 39, 0.8)';
  stopBtn.style.color = '#e5e7eb';
  stopBtn.style.border = '1.5px solid rgba(167, 139, 250, 0.4)';
  stopBtn.style.borderRadius = '8px';
  stopBtn.style.fontSize = '0.9rem';
  stopBtn.style.fontWeight = '600';
  stopBtn.style.cursor = 'pointer';
  stopBtn.style.transition = 'all 0.2s ease';
  stopBtn.style.height = '100px'; // même hauteur que le canvas
  stopBtn.style.minWidth = '60px';
  stopBtn.style.letterSpacing = '0.02em';
  
  stopBtn.onmouseover = () => {
    stopBtn.style.borderColor = '#67e8f9';
    stopBtn.style.background = 'rgba(17, 24, 39, 0.95)';
  };
  
  stopBtn.onmouseout = () => {
    stopBtn.style.borderColor = 'rgba(167, 139, 250, 0.4)';
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
  sampleNameEl.style.textAlign = 'center';
  sampleNameEl.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  sampleNameEl.style.fontSize = '0.9rem';
  sampleNameEl.style.fontWeight = '600';
  sampleNameEl.style.marginTop = '4px';
  sampleNameEl.style.color = '#a78bfa';
  sampleNameEl.textContent = '';
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
  // fond sombre
  ctx2.fillStyle = '#0b1220';
  ctx2.fillRect(0, 0, cw, ch);
  // Épaisseur légèrement accrue pour mieux voir les couleurs
  ctx2.lineWidth = 2;
  // Dégradé violet → cyan (plus visible), constant pour toutes les waveforms
  const grad = makeVioletCyanGradient(ctx2, cw);
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

// Dégradé horizontal violet → cyan
function makeVioletCyanGradient(ctx, width) {
  const g = ctx.createLinearGradient(0, 0, width, 0);
  g.addColorStop(0.00, 'rgba(167, 139, 250, 0.98)'); // violet ~ violet-400/500
  g.addColorStop(0.50, 'rgba(147, 197, 253, 0.98)'); // bleu clair ~ blue-300
  g.addColorStop(1.00, 'rgba(103, 232, 249, 0.98)'); // cyan ~ cyan-300
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