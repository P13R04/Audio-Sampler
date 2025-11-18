import { pixelToSeconds, formatSampleNameFromUrl } from './utils.js';

// PresetLoader : encapsule la logique de chargement d'un preset
// Dépendances injectées via l'objet `deps` pour faciliter le test et le refactor.
//
// NOTE (FR) : ce loader charge et décode des sources audio à partir d'URLs
// (qui peuvent être des `blob:` URLs créées à la volée). Il ne révoque pas
// automatiquement les `blob:` URLs car celles-ci peuvent être partagées entre
// l'UI et la structure `presets`. La responsabilité de la révocation revient
// aux flows qui remplacent ou nettoient les presets (ex: `revokePresetBlobUrlsNotInNew`).
export class PresetLoader {
  constructor(deps = {}) {
    // Dépendances requises
    this.ctx = deps.ctx;
    this.presets = deps.presets;
    this.trimPositions = deps.trimPositions;
    this.keyboardManager = deps.keyboardManager;
    this.buttonsContainer = deps.buttonsContainer;
    this.waveformState = deps.waveformState;
    this.waveformCanvas = deps.waveformCanvas;
    this.trimbarsDrawer = deps.trimbarsDrawer;
    this.statusEl = deps.statusEl;
    this.showStatus = deps.showStatus;
    this.showError = deps.showError;
    this.resetButtons = deps.resetButtons;
    // fonctions utilitaires externes
    this.loadAndDecodeSound = deps.loadAndDecodeSound;
    this.playSound = deps.playSound;
    // Concurrency: number of simultaneous decode jobs (default 3)
    this.concurrency = (typeof deps.concurrency === 'number' && deps.concurrency > 0) ? Math.max(1, Math.floor(deps.concurrency)) : 3;
  }

  // Méthode principale pour charger un preset par index
  async loadPresetByIndex(idx) {
    const preset = this.presets[idx];
    if (!preset) return;

    // Réinitialise l'UI
    this.resetButtons && this.resetButtons();
    this.showError && this.showError('');
    this.showStatus && this.showStatus(`Loading ${preset.files.length} file(s)…`);

    try {
      const fileEntries = (preset.files || []).map(f => {
        if (typeof f === 'string') return { url: f, name: formatSampleNameFromUrl(f), playbackRate: 1 };
        return { url: f.url, name: f.name || formatSampleNameFromUrl(f.url), playbackRate: (typeof f.playbackRate === 'number' ? f.playbackRate : 1) };
      });

      // Décodage avec limite de concurrence pour améliorer les performances
      // sans saturer la mémoire. On lance plusieurs workers qui consomment
      // la file d'entrées et écrivent leurs résultats dans `results`.
      const concurrency = Math.min(this.concurrency, fileEntries.length); // concurrency limit configurable
      const results = new Array(fileEntries.length);
      let nextIndex = 0;

      const worker = async () => {
        while (true) {
          const i = nextIndex++;
          if (i >= fileEntries.length) break;
          const e = fileEntries[i];
          try {
            this.showStatus && this.showStatus(`Décodage ${i + 1}/${fileEntries.length} — ${e.url}`);
            const buf = await this.loadAndDecodeSound(e.url, this.ctx);
            results[i] = { buffer: buf, url: e.url, name: e.name, playbackRate: e.playbackRate || 1 };
            this.showStatus && this.showStatus(`Décodé ${i + 1}/${fileEntries.length}`);
          } catch (err) {
            console.warn('PresetLoader: failed to decode', e.url, err);
            this.showError && this.showError(`Erreur décodage: ${e.url} — ${err && (err.message || err)}`);
            results[i] = null;
          }
        }
      };

      // Démarre les workers et attend la fin
      const workers = Array.from({ length: concurrency }, () => worker());
      await Promise.all(workers);

      // Filtre les résultats valides
      const decodedSounds = results.filter(Boolean);

      if (decodedSounds.length === 0) {
        throw new Error('Aucun fichier décodé pour ce preset');
      }

      // resume audio context if necessary
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      // Reset keyboard mapping
      if (this.keyboardManager) this.keyboardManager.padPlayFns = [];

      const rows = 4, cols = 4, total = rows * cols;
      // Build an array of DOM nodes at their display positions so that
      // padIndex 0 is placed bottom-left and padIndex (total-1) top-right.
      const nodes = new Array(total);
      for (let padIndex = 0; padIndex < total; padIndex++) {
        const rowFromBottom = Math.floor(padIndex / cols);
        const col = padIndex % cols;
        // visual row (0 = top) we want padIndex=0 at bottom => visualRow = rows-1-rowFromBottom
        const visualRow = (rows - 1 - rowFromBottom);
        const displayIndex = visualRow * cols + col; // DOM order index where this pad should appear

        if (padIndex < decodedSounds.length) {
          const entryObj = decodedSounds[padIndex];
          const decodedSound = entryObj.buffer;
          const url = entryObj.url;
          const playbackRate = entryObj.playbackRate || 1;
          let displayName = entryObj.name || (url ? formatSampleNameFromUrl(url) : `Sample ${padIndex + 1}`);
          const compact = String(displayName).replace(/\s+/g, '');
          if (/^[0-9a-fA-F\-]{6,}$/.test(compact)) displayName = 'Sample';

          const fileName = (() => { try { return decodeURIComponent((url && url.split('/').pop()) || ''); } catch { return (url && url.split('/').pop()) || ''; } })();

          const btn = document.createElement('button');
          btn.classList.add('pad-btn');
          // Display the logical sample number (padIndex + 1) on the button label
          // Build DOM nodes safely to avoid any HTML injection from preset names
          const titleSpan = document.createElement('span');
          titleSpan.className = 'pad-title';
          titleSpan.textContent = `Play n°${padIndex + 1}`;
          const subtitleSpan = document.createElement('span');
          subtitleSpan.className = 'pad-subtitle';
          subtitleSpan.textContent = displayName;
          const keySpan = document.createElement('span');
          keySpan.className = 'pad-key';
          btn.appendChild(titleSpan);
          btn.appendChild(subtitleSpan);
          btn.appendChild(keySpan);
          btn.title = fileName || displayName;

          const playFn = () => {
            btn.classList.add('playing');
            setTimeout(() => btn.classList.remove('playing'), 600);
            try {
              if (this.waveformState && this.waveformState.showWaveform) {
                // showWaveform should receive the logical pad index (padIndex)
                // so that UI labels (Play n°X) match the sample number.
                this.waveformState.showWaveform(decodedSound, url, padIndex, displayName);
              }
            } catch (err) { console.warn('Unable to show waveform', err); }

            if (this.ctx && this.ctx.state === 'suspended') {
              this.ctx.resume().catch(() => {});
            }

            let start = 0, end = decodedSound.duration;
            const stored = this.trimPositions.get(url);
            if (stored) { start = stored.start; end = stored.end; }
            else if (this.trimbarsDrawer && this.waveformCanvas) {
              const l = this.trimbarsDrawer.leftTrimBar.x;
              const r = this.trimbarsDrawer.rightTrimBar.x;
              start = pixelToSeconds(l, decodedSound.duration, this.waveformCanvas.width);
              end = pixelToSeconds(r, decodedSound.duration, this.waveformCanvas.width);
            }

            start = Math.max(0, Math.min(start, decodedSound.duration));
            end = Math.max(start + 0.01, Math.min(end, decodedSound.duration));

            this.trimPositions.set(url, { start, end });

            // stop previous
            if (this.waveformState && this.waveformState.stopCurrentPlayback) this.waveformState.stopCurrentPlayback();
            const src = this.playSound(this.ctx, decodedSound, start, end, playbackRate);
            if (src) {
              if (this.waveformState) {
                this.waveformState.currentSource = src;
                this.waveformState.playStartCtxTime = this.ctx.currentTime;
                this.waveformState.playStartSec = start;
                this.waveformState.playEndSec = end;
              }
              src.onended = () => {
                if (this.waveformState) this.waveformState.currentSource = null;
              };
            }
          };

          if (this.keyboardManager) this.keyboardManager.padPlayFns[displayIndex] = playFn;
          btn.addEventListener('click', playFn);
          nodes[displayIndex] = btn;
        } else {
          const empty = document.createElement('div');
          empty.className = 'pad-empty';
          nodes[displayIndex] = empty;
        }
      }

      // Append nodes in DOM order (top-to-bottom, left-to-right) so CSS grid places them accordingly
      for (let i = 0; i < total; i++) {
        if (nodes[i]) this.buttonsContainer.appendChild(nodes[i]);
      }

      if (this.keyboardManager) this.keyboardManager.updatePadKeyLabels(this.buttonsContainer);

      if (this.statusEl) {
        // Build status DOM safely
        this.statusEl.textContent = '';
        const label = document.createElement('span');
        label.className = 'status-label';
        label.textContent = 'Loaded preset';
        const value = document.createElement('span');
        value.className = 'status-value';
        value.textContent = `${preset.name} (${decodedSounds.length} sounds)`;
        this.statusEl.appendChild(label);
        this.statusEl.appendChild(value);
      }
    } catch (err) {
      console.error(err);
      this.showError && this.showError(`Erreur lors du chargement du preset "${preset.name}": ${err.message || err}`);
    }
  }
}
