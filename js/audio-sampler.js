// Web Component minimal : <audio-sampler>
// Proof-of-concept qui expose un enregistrement dans 1 slot (extensible à 16).
// Comportement : boutons Record / Stop / Play / Save. Utilise `Recorder` (js/recorder.mjs).

import { Recorder } from './recorder.mjs';

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
  }

  // Rendu minimal de l'UI dans le Shadow DOM
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: sans-serif; }
        button { margin-right: 6px; }
        canvas { display:block; margin-top:10px; border:1px solid #ddd; }
      </style>
      <div>
        <button id="record">🎙️ Enregistrer</button>
        <button id="stop">⏹️ Stop</button>
        <button id="play">▶️ Lecture</button>
        <button id="save">💾 Sauvegarder</button>
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

  // Démarre l'enregistrement (init lazy pour éviter prompt à la charge)
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
      this.dispatchEvent(new CustomEvent('sampleadded', { detail: { id, name } }));
    } catch (err) {
      this.$status.textContent = 'Erreur sauvegarde : ' + err.message;
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
    }
  }

  // Dessine la forme d'onde (simple)
  _renderWave(data) {
    const canvas = this.$canvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#333';
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

  // Méthodes publiques recommandées pour l'API du composant
  async record(slot = 0) { await this._onRecordClick(); }
  async stopRecording() { await this._onStopClick(); }
  play(slot = 0) { this._onPlayClick(); }
  async saveLast(name) { if (!this.lastBlob) return; return this.recorder.saveSample(this.lastBlob, { name }); }
}

customElements.define('audio-sampler', AudioSampler);
