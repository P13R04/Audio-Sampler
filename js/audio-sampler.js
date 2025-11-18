// Web Component minimal : `<audio-sampler>`
// Preuve de concept (POC) exposant un enregistrement simple (1 slot,
// extensible à 16). Comporte les boutons Enregistrer / Stop / Lecture / Sauvegarder.
// Utilise la classe `Recorder` définie dans `js/recorder.mjs`.

import { Recorder } from './recorder.mjs';
import { bus } from './event-bus.js';

class AudioSampler extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.recorder = new Recorder({ maxDuration: 30 }); // 30s par défaut
    this.lastAudioBuffer = null;
    this.lastBlob = null;
    this.bufferSource = null;
  }

  connectedCallback() {
    this._render();
    // Listen for theme changes and redraw waveform immediately when theme updates
    if (typeof window !== 'undefined') {
      this._themeHandler = () => {
        if (this.lastAudioBuffer) {
          try { this._renderWave(this.lastAudioBuffer.getChannelData(0)); } catch (e) { /* ignore */ }
        }
      };
      window.addEventListener('sampler-theme-changed', this._themeHandler);
    }
  }

  // Rendu minimal de l'UI dans le Shadow DOM
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: sans-serif; }
        /* control buttons use the shared theme variables from the page (with fallback) */
        button.control-btn { margin-right: 6px; border-radius: var(--btn-radius, 10px); padding: 0.4rem 0.6rem; font-weight:700; border:1.5px solid var(--btn-border-start); background: linear-gradient(180deg,var(--btn-bg-top),var(--btn-bg-bottom)); color:var(--btn-text); cursor:pointer }
        canvas { display:block; margin-top:10px; border:1px solid rgba(255,255,255,0.06); background: var(--wave-fill); }
      </style>
      <div>
        <button id="record" class="control-btn">🎙️ Enregistrer</button>
        <button id="stop" class="control-btn">⏹️ Stop</button>
        <button id="play" class="control-btn">▶️ Lecture</button>
        <button id="save" class="control-btn">💾 Sauvegarder</button>
      </div>
      <canvas id="wave" width="600" height="120"></canvas>
      <div id="status" style="margin-top:8px;color:#444;font-size:0.9em"></div>
    `;

    this.$record = this.shadowRoot.getElementById('record');
    this.$stop = this.shadowRoot.getElementById('stop');
    this.$play = this.shadowRoot.getElementById('play');
    this.$save = this.shadowRoot.getElementById('save');
    this.$canvas = this.shadowRoot.getElementById('wave');
    this.$status = this.shadowRoot.getElementById('status');

    this.$stop.disabled = true;
    this.$play.disabled = true;
    this.$save.disabled = true;

    this.$record.addEventListener('click', () => this._onRecordClick());
    this.$stop.addEventListener('click', () => this._onStopClick());
    this.$play.addEventListener('click', () => this._onPlayClick());
    this.$save.addEventListener('click', () => this._onSaveClick());
  }

  // Masque les boutons de contrôle internes (utilisé lorsque l'application
  // hôte fournit ses propres contrôles)
  hideControls() {
    try {
      const container = this.shadowRoot.querySelector('div');
      if (container) {
        // remove the buttons container while keeping waveform canvas
        const buttons = container.querySelectorAll('button');
        if (buttons && buttons.length) {
          buttons.forEach(b => b.remove());
        }
      }
    } catch (e) {
      // swallow errors to avoid breaking host app
      console.warn('hideControls failed', e);
    }
  }

  // Démarre l'enregistrement (initialisation lazy pour éviter la popup
  // de permission au chargement de la page)
  async _onRecordClick() {
    try {
      if (!this.recorder.mediaRecorder) {
        this.$status.textContent = 'Initialisation du micro…';
        await this.recorder.init();
      }
      this.recorder.start();
      this.$status.textContent = 'Enregistrement… (max ' + this.recorder.maxDuration + 's)';
      this.$record.disabled = true;
      this.$stop.disabled = false;
      this.dispatchEvent(new CustomEvent('recordingstart'));
    } catch (err) {
      this.$status.textContent = 'Erreur micro : ' + err.message;
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    }
  }

  // Arrête et récupère le sample
  async _onStopClick() {
    try {
      const res = await this.recorder.stop();
      if (!res) return;
      this.lastBlob = res.blob;
      this.lastAudioBuffer = res.audioBuffer;
      this.$status.textContent = 'Enregistrement prêt — durée approximative : ' + Math.round(this.lastAudioBuffer.duration) + 's';
      this.$record.disabled = false;
      this.$stop.disabled = true;
      this.$play.disabled = false;
      this.$save.disabled = false;
      this._renderWave(this.lastAudioBuffer.getChannelData(0));
      this.dispatchEvent(new CustomEvent('recordingstop', { detail: { audioBuffer: this.lastAudioBuffer } }));
    } catch (err) {
      this.$status.textContent = 'Erreur lors de l\'arrêt : ' + err.message;
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    }
  }

  // Lecture simple du dernier sample enregistré
  _onPlayClick() {
    if (!this.lastAudioBuffer) return;
    this._stopPlayback();
    const ac = this.recorder.audioContext;
    this.bufferSource = ac.createBufferSource();
    this.bufferSource.buffer = this.lastAudioBuffer;
    const limiter = ac.createDynamicsCompressor();
    this.bufferSource.connect(limiter);
    limiter.connect(ac.destination);
    this.bufferSource.start();
    this.$status.textContent = 'Lecture…';
    this.$play.disabled = true;
    this.dispatchEvent(new CustomEvent('playstart'));
    this.bufferSource.onended = () => {
      this.$status.textContent = 'Lecture terminée';
      this.$play.disabled = false;
      this.dispatchEvent(new CustomEvent('playend'));
    };
  }

  _stopPlayback() {
    if (this.bufferSource) {
      try { this.bufferSource.stop(); } catch (e) {}
      this.bufferSource.disconnect();
      this.bufferSource = null;
    }
  }

  // Sauvegarde le sample dans IndexedDB via Recorder.saveSample()
  async _onSaveClick() {
    if (!this.lastAudioBuffer) return;
    const name = prompt('Nom du sample à sauvegarder :', 'mon-sample');
    if (!name) return;
    try {
      // Convertir l'AudioBuffer (déjà trimé) en WAV Blob pour sauvegarder la version
      // qui commence vraiment au premier son. Cela évite d'enregistrer le blob brut
      // produit par MediaRecorder (qui contient le silence initial).
      const wavBlob = this.recorder.audioBufferToWavBlob(this.lastAudioBuffer);
      const id = await this.recorder.saveSample(wavBlob, { name });
      this.$status.textContent = 'Sample sauvegardé (id ' + id + ')';
      // Dispatch sur le component (local) pour compatibilité
      this.dispatchEvent(new CustomEvent('sampleadded', { detail: { id, name } }));
      // Et sur le bus global pour découpler l'app principale
      try {
        bus.dispatchEvent(new CustomEvent('sampleadded', { detail: { id, name } }));
      } catch (e) {
        // bus dispatch ne doit pas empêcher le flow principal
        console.warn('event-bus dispatch failed', e);
      }
    } catch (err) {
      this.$status.textContent = 'Erreur sauvegarde : ' + err.message;
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    }
  }

  // Dessine la forme d'onde (méthode simple de rendu)
  _renderWave(data) {
    const canvas = this.$canvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;
    // Utiliser les variables CSS personnalisées si disponibles pour
    // respecter le thème de l'hôte
    const cs = getComputedStyle(this);
    const waveFill = cs.getPropertyValue('--wave-fill') || '#0b1220';
    const waveStroke = cs.getPropertyValue('--wave-stroke') || '#a78bfa';
    ctx.fillStyle = waveFill.trim() || '#0b1220';
    ctx.fillRect(0, 0, w, h);
    // create a horizontal gradient using CSS variables if present
    const g1 = (cs.getPropertyValue('--wave-grad-1') || 'rgba(167, 139, 250, 0.98)').trim();
    const g2 = (cs.getPropertyValue('--wave-grad-2') || 'rgba(147, 197, 253, 0.98)').trim();
    const g3 = (cs.getPropertyValue('--wave-grad-3') || 'rgba(103, 232, 249, 0.98)').trim();
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0.0, g1);
    grad.addColorStop(0.5, g2);
    grad.addColorStop(1.0, g3);
    ctx.strokeStyle = grad;
    ctx.beginPath();
    const step = data.length / w;
    for (let x = 0; x < w; x++) {
      const i = Math.floor(x * step);
      const v = data[i] || 0;
      const y = mid - v * mid;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  disconnectedCallback() {
    if (this._themeHandler && typeof window !== 'undefined') {
      window.removeEventListener('sampler-theme-changed', this._themeHandler);
    }
  }

  // Méthodes publiques recommandées pour l'API du composant
  async record(slot = 0) { await this._onRecordClick(); }
  async stopRecording() { await this._onStopClick(); }
  play(slot = 0) { this._onPlayClick(); }
  async saveLast(name) { if (!this.lastBlob) return; return this.recorder.saveSample(this.lastBlob, { name }); }
}

customElements.define('audio-sampler', AudioSampler);
