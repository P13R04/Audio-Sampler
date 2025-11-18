/* ---------------------------------------------------------------------------
  ui-helpers.js
  Module dédié aux helpers d'interface utilisateur :
  - Affichage de status et erreurs
  - Gestion des boutons
  - Mise à jour des informations temporelles
  - Affichage du nom du sample
  --------------------------------------------------------------------------- */

import { pixelToSeconds, formatTime } from './utils.js';

/**
 * Affiche un message de status
 * @param {HTMLElement} statusEl - Élément de status
 * @param {string} msg - Message à afficher
 */
export function showStatus(statusEl, msg) {
  if (statusEl) statusEl.textContent = msg || '';
}

/**
 * Affiche un message d'erreur
 * @param {HTMLElement} errorEl - Élément d'erreur
 * @param {HTMLElement} statusEl - Élément de status (pour le nettoyer)
 * @param {string} msg - Message d'erreur
 */
export function showError(errorEl, statusEl, msg) {
  if (errorEl) errorEl.textContent = msg || '';
  if (statusEl) showStatus(statusEl, '');
}

/**
 * Réinitialise le conteneur de boutons
 * @param {HTMLElement} buttonsContainer - Conteneur des boutons
 */
export function resetButtons(buttonsContainer) {
  if (buttonsContainer) buttonsContainer.innerHTML = '';
}

/**
 * Met à jour l'affichage textuel des temps (Start/End/Duration)
 * @param {HTMLElement} timeInfoEl - Élément d'affichage des temps
 * @param {AudioBuffer} currentShownBuffer - Buffer audio actuel
 * @param {string} currentShownUrl - URL actuelle
 * @param {Map} trimPositions - Positions de trim stockées
 * @param {Object} trimbarsDrawer - Objet gérant les trimbars
 * @param {HTMLCanvasElement} waveformCanvas - Canvas de la waveform
 */
export function updateTimeInfo(
  timeInfoEl,
  currentShownBuffer,
  currentShownUrl,
  trimPositions,
  trimbarsDrawer,
  waveformCanvas
) {
  if (!timeInfoEl || !currentShownBuffer) return;
  
  const dur = currentShownBuffer.duration;
  let startSec = 0, endSec = dur;
  
  const stored = currentShownUrl && trimPositions.get(currentShownUrl);
  if (stored) {
    startSec = stored.start;
    endSec = stored.end;
  } else if (trimbarsDrawer) {
    const l = trimbarsDrawer.leftTrimBar.x;
    const r = trimbarsDrawer.rightTrimBar.x;
    startSec = pixelToSeconds(l, dur, waveformCanvas.width);
    endSec = pixelToSeconds(r, dur, waveformCanvas.width);
  }
  
  const selDur = Math.max(0, endSec - startSec);

  // Affiche uniquement Start / End / Duration
  timeInfoEl.textContent = `Start: ${formatTime(startSec)}  —  End: ${formatTime(endSec)}  —  Duration: ${formatTime(selDur)}`;
}

/**
 * Met à jour l'affichage du nom du sample actuellement montré
 * @param {HTMLElement} sampleNameEl - Élément d'affichage du nom
 * @param {number|null} currentShownPadIndex - Index du pad actuel
 * @param {string|null} currentShownSampleName - Nom du sample actuel
 */
export function updateSampleName(sampleNameEl, currentShownPadIndex, currentShownSampleName) {
  if (!sampleNameEl) return;
  
  if (currentShownPadIndex !== null && currentShownSampleName) {
    sampleNameEl.textContent = `Play n°${currentShownPadIndex + 1} — ${currentShownSampleName}`;
  } else {
    sampleNameEl.textContent = '';
  }
}

/**
 * Arrête la lecture en cours
 * @param {AudioBufferSourceNode|null} currentSource - Source audio en cours
 * @returns {null} - Toujours null pour réinitialiser la référence
 */
export function stopCurrentPlayback(currentSource) {
  if (currentSource) {
    try { currentSource.stop(0); } catch (_) {}
    try { currentSource.disconnect(); } catch (_) {}
  }
  return null;
}
