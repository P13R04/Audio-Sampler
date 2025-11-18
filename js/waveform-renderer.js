/* ---------------------------------------------------------------------------
  waveform-renderer.js
  Module dédié au rendu de la waveform :
  - Dessin de la waveform sur canvas
  - Animation de l'overlay (trimbars + playhead)
  - Création de gradients pour la waveform
  - Gestion des labels de trim
  --------------------------------------------------------------------------- */

import { pixelToSeconds, formatTime } from './utils.js';
import TrimbarsDrawer from './trimbarsdrawer.js';

/**
 * Crée l'interface de la waveform avec canvas et overlay
 * @param {HTMLElement} buttonsContainer - Conteneur des boutons (pour insérer après)
 * @param {Function} stopCurrentPlayback - Fonction pour arrêter la lecture
 * @returns {Object} - Éléments créés (waveformCanvas, overlayCanvas, etc.)
 */
export function createWaveformUI(buttonsContainer, stopCurrentPlayback) {
  const wrapper = document.createElement('div');
    wrapper.classList.add('waveform-wrapper');

  const container = document.createElement('div');
  container.id = 'waveformContainer';
    container.classList.add('waveform-container');

  const waveformCanvas = document.createElement('canvas');
  waveformCanvas.width = 800;
  waveformCanvas.height = 100;
    waveformCanvas.classList.add('waveform-canvas');
  container.appendChild(waveformCanvas);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = 800;
  overlayCanvas.height = 116;
    overlayCanvas.classList.add('waveform-overlay');
  container.appendChild(overlayCanvas);

  // Créer des labels DOM positionnés au-dessus de la waveform
  const leftTrimLabel = document.createElement('div');
  const rightTrimLabel = document.createElement('div');
  [leftTrimLabel, rightTrimLabel].forEach(el => {
    el.className = 'trim-label';
    container.appendChild(el);
  });

  // Bouton "Stop" (arrêt de la lecture)
  const stopBtn = document.createElement('button');
  stopBtn.id = 'stopButton';
  stopBtn.textContent = '⏹ Stop';
  stopBtn.classList.add('control-btn');
  
  stopBtn.onmouseover = () => {
      stopBtn.classList.add('hover');
  };
  
  stopBtn.onmouseout = () => {
      stopBtn.classList.remove('hover');
  };
  
  stopBtn.onclick = () => {
    stopCurrentPlayback();
  };

  wrapper.appendChild(container);
  wrapper.appendChild(stopBtn);

  buttonsContainer.insertAdjacentElement('afterend', wrapper);

  const trimbarsDrawer = new TrimbarsDrawer(overlayCanvas, 100, 200);

  // Élément d'affichage du temps
  const timeInfoEl = document.createElement('div');
  timeInfoEl.id = 'timeInfo';
  timeInfoEl.textContent = '';
    timeInfoEl.classList.add('time-info');
  wrapper.insertAdjacentElement('afterend', timeInfoEl);
  
  // Élément affichant le nom du sample
  const sampleNameEl = document.createElement('div');
  sampleNameEl.id = 'sampleName';
  sampleNameEl.textContent = '';
  sampleNameEl.className = 'sample-name';
  timeInfoEl.insertAdjacentElement('afterend', sampleNameEl);

    wrapper.classList.add('hidden'); // masqué initialement via CSS

  return {
    wrapper,
    waveformCanvas,
    overlayCanvas,
    trimbarsDrawer,
    leftTrimLabel,
    rightTrimLabel,
    timeInfoEl,
    sampleNameEl
  };
}

/**
 * Dessine la waveform sur le canvas
 * @param {AudioBuffer} buffer - Buffer audio à dessiner
 * @param {HTMLCanvasElement} canvas - Canvas de destination
 * @param {HTMLCanvasElement} overlayCanvas - Canvas overlay (pour sync)
 */
export function drawWaveform(buffer, canvas, overlayCanvas = null) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight || 100;
  
  const cw = canvas.width = Math.floor(cssWidth * dpr);
  const ch = canvas.height = Math.floor(cssHeight * dpr);
  
  // Sync overlay canvas
  if (overlayCanvas) {
    // keep overlay pixel size identical to waveform canvas so trimbars align
    overlayCanvas.width = cw;
    overlayCanvas.height = ch;
  }
  
  const ctx2 = canvas.getContext('2d');
  ctx2.clearRect(0, 0, cw, ch);

  const cs = getComputedStyle(canvas);
  const borderColor = (cs && cs.getPropertyValue('--waveform-border')) ? 
    cs.getPropertyValue('--waveform-border').trim() : 'rgba(167,139,250,0.3)';

  const channelData = buffer.numberOfChannels > 0 ? 
    buffer.getChannelData(0) : new Float32Array(0);
  const step = Math.max(1, Math.floor(channelData.length / cw));
  
  const waveFill = (cs && cs.getPropertyValue('--wave-fill')) ? 
    cs.getPropertyValue('--wave-fill').trim() : '#0b1220';
  ctx2.fillStyle = waveFill;
  ctx2.fillRect(0, 0, cw, ch);
  
  ctx2.lineWidth = 2;
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
    let y1 = ((1 + max) / 2) * ch;
    let y2 = ((1 + min) / 2) * ch;
    ctx2.moveTo(i + 0.5, y1);
    ctx2.lineTo(i + 0.5, y2);
  }
  ctx2.stroke();

  ctx2.lineWidth = Math.max(1, Math.round(1 * dpr));
  ctx2.strokeStyle = borderColor;
  ctx2.strokeRect(0.5, 0.5, cw - 1, ch - 1);
}

/**
 * Crée un dégradé horizontal pour la waveform
 * @param {CanvasRenderingContext2D} ctx - Contexte du canvas
 * @param {number} width - Largeur du gradient
 * @returns {CanvasGradient} - Gradient créé
 */
export function makeWaveformGradient(ctx, width) {
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

/**
 * Crée la boucle d'animation de l'overlay
 * @param {Object} state - État partagé (trimbarsDrawer, currentSource, etc.)
 * @returns {Function} - Fonction d'animation à appeler avec requestAnimationFrame
 */
export function createAnimateOverlay(state) {
  // Retourne un objet avec `start()` et `stop()` pour contrôler la boucle
  let rafId = null;
  let running = false;

  function loop() {
    if (!running) return;
    const {
      trimbarsDrawer,
      overlayCanvas,
      currentSource,
      currentShownBuffer,
      ctx,
      playStartCtxTime,
      playStartSec,
      playEndSec,
      leftTrimLabel,
      rightTrimLabel,
      waveformCanvas,
      updateTimeInfo
    } = state;

    if (trimbarsDrawer && overlayCanvas) {
      trimbarsDrawer.clear();
      trimbarsDrawer.draw();

      // Draw playhead if playing
      if (currentSource && currentShownBuffer) {
        try {
          const now = ctx.currentTime;
          const elapsed = Math.max(0, now - playStartCtxTime);
          const posSec = playStartSec + elapsed;

          if (posSec >= playEndSec) {
            state.currentSource = null;
          } else {
            const x = (posSec / currentShownBuffer.duration) * overlayCanvas.width;
            const g = overlayCanvas.getContext('2d');
            g.save();
            g.strokeStyle = '#ffffff';
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(x + 0.5, 0);
            g.lineTo(x + 0.5, overlayCanvas.height);
            g.stroke();
            g.restore();
          }
        } catch (err) {
          console.warn('animateOverlay playhead draw failed', err);
        }
      }

      // Update trim labels
      if (currentShownBuffer && trimbarsDrawer && leftTrimLabel && rightTrimLabel) {
        const dur = currentShownBuffer.duration;
        const leftSec = pixelToSeconds(trimbarsDrawer.leftTrimBar.x, dur, overlayCanvas.width);
        const rightSec = pixelToSeconds(trimbarsDrawer.rightTrimBar.x, dur, overlayCanvas.width);

        const cs = getComputedStyle(document.documentElement);
        const leftColor = (cs.getPropertyValue('--wave-grad-1') || '#a78bfa').trim();
        const rightColor = (cs.getPropertyValue('--wave-grad-3') || '#67e8f9').trim();
        const textColor = (cs.getPropertyValue('--btn-text') || '#ffffff').trim();

        function colorToRGBA(col, alpha = 0.25) {
          if (!col || typeof col !== 'string') return `rgba(255,255,255,${alpha})`;
          col = col.trim();
          if (col[0] === '#') {
            let hex = col.slice(1);
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            if (hex.length === 6) {
              const r = parseInt(hex.slice(0,2), 16);
              const g_ = parseInt(hex.slice(2,4), 16);
              const b = parseInt(hex.slice(4,6), 16);
              return `rgba(${r},${g_},${b},${alpha})`;
            }
          }
          if (col.indexOf('rgb(') === 0) return col.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
          if (col.indexOf('rgba(') === 0) return col.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, `rgba($1,$2,$3,${alpha})`);
          return `rgba(255,255,255,${alpha})`;
        }

        const scaleX = overlayCanvas.clientWidth / overlayCanvas.width || 1;
        const leftCssX = Math.round((trimbarsDrawer.leftTrimBar.x) * scaleX);
        const rightCssX = Math.round((trimbarsDrawer.rightTrimBar.x) * scaleX);

        const dpr = window.devicePixelRatio || 1;
        const fontPx = Math.round(11 * dpr);
        const padY = Math.round(4 * dpr);
        const containerPadding = 8;
        const labelH = Math.ceil(fontPx + padY * 2);
        // Position le label juste au-dessus de la zone extérieure du container avec une petite marge
        const labelTop = -10 - containerPadding - 3;

        leftTrimLabel.textContent = formatTime(leftSec);
        leftTrimLabel.style.setProperty('--trim-bg', colorToRGBA(leftColor, 0.25));
        leftTrimLabel.style.setProperty('--trim-color', textColor);
        leftTrimLabel.style.setProperty('--trim-left', `${leftCssX}px`);
        leftTrimLabel.style.setProperty('--trim-top', `${labelTop}px`);

        rightTrimLabel.textContent = formatTime(rightSec);
        rightTrimLabel.style.setProperty('--trim-bg', colorToRGBA(rightColor, 0.25));
        rightTrimLabel.style.setProperty('--trim-color', textColor);
        rightTrimLabel.style.setProperty('--trim-left', `${rightCssX}px`);
        rightTrimLabel.style.setProperty('--trim-top', `${labelTop}px`);
      }
    }

    if (updateTimeInfo) updateTimeInfo();
    rafId = requestAnimationFrame(loop);
  }

  return {
    start() {
      if (running) return;
      running = true;
      loop();
    },
    stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }
  };
}

/**
 * Configure les événements de la souris sur l'overlay
 * @param {HTMLCanvasElement} overlayCanvas - Canvas overlay
 * @param {TrimbarsDrawer} trimbarsDrawer - Gestionnaire de trimbars
 * @param {Object} mousePos - Position de la souris (référence partagée)
 * @param {Object} state - État partagé (currentShownBuffer, etc.)
 */
export function setupOverlayMouseEvents(overlayCanvas, trimbarsDrawer, mousePos, state) {
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
    if (state.currentShownBuffer && state.currentShownUrl) {
      const leftPx = trimbarsDrawer.leftTrimBar.x;
      const rightPx = trimbarsDrawer.rightTrimBar.x;
      const leftSec = pixelToSeconds(leftPx, state.currentShownBuffer.duration, state.waveformCanvas.width);
      const rightSec = pixelToSeconds(rightPx, state.currentShownBuffer.duration, state.waveformCanvas.width);
      state.trimPositions.set(state.currentShownUrl, { start: leftSec, end: rightSec });
    }
  }

  overlayCanvas.onmouseup = stopDragAndSave;
  
  const _windowMouseUpHandler = (evt) => {
    if ((trimbarsDrawer.leftTrimBar && trimbarsDrawer.leftTrimBar.dragged) ||
        (trimbarsDrawer.rightTrimBar && trimbarsDrawer.rightTrimBar.dragged)) {
      stopDragAndSave();
    }
  };
  window.addEventListener('mouseup', _windowMouseUpHandler);

  // Fournit une API de cleanup pour retirer les handlers ajoutés
  return {
    stop() {
      try {
        overlayCanvas.onmousemove = null;
        overlayCanvas.onmousedown = null;
        overlayCanvas.onmouseup = null;
        window.removeEventListener('mouseup', _windowMouseUpHandler);
      } catch (e) { /* noop */ }
    }
  };
}

/**
 * Affiche la waveform pour un son donné
 * @param {AudioBuffer} buffer - Buffer audio
 * @param {string} url - URL du son
 * @param {number} padIndex - Index du pad
 * @param {string} sampleName - Nom du sample
 * @param {Object} state - État partagé
 */
export function showWaveformForSound(buffer, url, padIndex, sampleName, state) {
  const { 
    waveformCanvas, 
    overlayCanvas,
    trimbarsDrawer, 
    trimPositions, 
    updateTimeInfo, 
    updateSampleName 
  } = state;
  
  if (!waveformCanvas) return;
  
  const container = waveformCanvas.parentElement;
  const wrapper = container.parentElement;
  wrapper.classList.remove('hidden');
  
  state.currentShownBuffer = buffer;
  state.currentShownUrl = url;
  state.currentShownPadIndex = padIndex;
  state.currentShownSampleName = sampleName;

  drawWaveform(buffer, waveformCanvas, overlayCanvas);

  const stored = trimPositions.get(url) || { start: 0, end: buffer.duration };
  const leftPx = (stored.start / buffer.duration) * waveformCanvas.width;
  const rightPx = (stored.end / buffer.duration) * waveformCanvas.width;
  trimbarsDrawer.leftTrimBar.x = leftPx;
  trimbarsDrawer.rightTrimBar.x = rightPx;
  trimPositions.set(url, { start: stored.start, end: stored.end });

  if (updateTimeInfo) updateTimeInfo();
  if (updateSampleName) updateSampleName();
}
