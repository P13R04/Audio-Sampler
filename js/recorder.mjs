// Module d'enregistrement et utilitaires (ESM)
// Fournit : Recorder class qui encapsule MediaRecorder, décodage en AudioBuffer,
// normalisation, conversion WAV et stockage simple dans IndexedDB.

// IMPORTANT : Ce module est un POC (proof-of-concept). Il fournit les fonctionnalités
// nécessaires pour l'UI et le Web Component minimal. On pourra factoriser/optimiser
// plus tard (gestion avancée des formats, chunking, time-stretch, etc.).

export class Recorder {
  constructor({ maxDuration = 30, dbName = 'audio-sampler', storeName = 'samples' } = {}) {
    // Durée max d'enregistrement en secondes (configurable)
    this.maxDuration = maxDuration;
    this.dbName = dbName;
    this.storeName = storeName;

    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this._recordTimeout = null;
    this._db = null; // promise d'ouverture de la base
  }

  // Initialise l'accès au micro et prépare MediaRecorder
  // Lance une requête de permission si besoin.
  async init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia non supporté par ce navigateur');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);

    // Collecte des chunks logiciels
    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });

    // Prépare l'IndexedDB
    this._db = this._openDB();
  }

  // Assure que la base IndexedDB est ouverte (utilisé par les méthodes publiques)
  async _ensureDB() {
    if (!this._db) this._db = this._openDB();
    return this._db;
  }

  // Démarre l'enregistrement et arrête automatiquement après maxDuration
  start() {
    if (!this.mediaRecorder) throw new Error('Recorder non initialisé. Appelez init()');
    this.chunks = [];
    this.mediaRecorder.start();
    this._recordTimeout = setTimeout(() => this.stop(), this.maxDuration * 1000);
  }

  // Arrête l'enregistrement et retourne { blob, audioBuffer }
  async stop() {
    if (!this.mediaRecorder) return null;
    return new Promise((resolve, reject) => {
      this.mediaRecorder.addEventListener('stop', async () => {
        clearTimeout(this._recordTimeout);
        const blob = new Blob(this.chunks, { type: this.chunks[0]?.type || 'audio/webm' });
        try {
          const arrayBuffer = await blob.arrayBuffer();
          const decoded = await this.audioContext.decodeAudioData(arrayBuffer).catch((e) => {
            // Certains navigateurs peuvent rejeter; fournir message d'erreur utile
            throw new Error('Erreur lors du décodage de l\'audio : ' + e.message);
          });

          // Trim leading silence so the recording effectively "starts" at the
          // first detected sound. This removes the unavoidable short silence
          // that can appear at the beginning when the user clicks Record.
          const trimmed = this._trimLeadingSilence(decoded, 0.01);

          // Normalise le buffer pour éviter des samples trop faibles
          this._normalizeInPlace(trimmed);

          resolve({ blob, audioBuffer: trimmed });
        } catch (err) {
          reject(err);
        }
      }, { once: true });

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Trim leading silence from an AudioBuffer.
  // - buffer: AudioBuffer to trim
  // - threshold: amplitude threshold to consider as "sound" (0..1)
  // Returns a new AudioBuffer starting at the first sample that exceeds the threshold.
  _trimLeadingSilence(buffer, threshold = 0.01) {
    if (!buffer || buffer.length === 0) return buffer;
    const ch0 = buffer.getChannelData(0);
    let startSample = 0;
    // scan for first sample above threshold
    while (startSample < ch0.length && Math.abs(ch0[startSample]) <= threshold) {
      startSample++;
    }
    // If nothing to trim, return original
    if (startSample === 0 || startSample >= ch0.length - 1) return buffer;

    const remaining = ch0.length - startSample;
    const newBuf = this.audioContext.createBuffer(buffer.numberOfChannels, remaining, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = newBuf.getChannelData(ch);
      for (let i = 0; i < remaining; i++) dst[i] = src[i + startSample];
    }
    return newBuf;
  }

  // Convertit un AudioBuffer en Blob WAV (PCM16)
  // Utile pour exporter des presets compatibles.
  audioBufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length * numChannels * 2 + 44;
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);

    // Helper to write strings
    function writeString(view, offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // En-tête WAV
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * numChannels * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1Size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * numChannels * 2, true);

    // Écrire les samples interleavés en PCM16
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  // Normalise un AudioBuffer en place (maximiser sans saturer)
  _normalizeInPlace(buffer) {
    const numChannels = buffer.numberOfChannels;
    let maxValue = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) maxValue = Math.max(maxValue, Math.abs(data[i]));
    }
    if (maxValue === 0 || maxValue === 1) return;
    const amp = 1 / maxValue;
    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) data[i] *= amp;
    }
  }

  // ---------- IndexedDB minimal wrapper pour stocker des samples ---------
  async _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Sauvegarde un blob (sample) avec méta (objet) ; retourne l'id
  async saveSample(blob, meta = {}) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const item = Object.assign({}, meta, { blob, createdAt: Date.now() });
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Récupère un sample par id
  async getSample(id) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Récupère tous les samples stockés (tableau d'objets)
  async getAllSamples() {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Supprime un sample par id
  async deleteSample(id) {
    const db = await this._ensureDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Ferme le flux micro et libère les ressources
  destroy() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.close) {
      this.audioContext.close();
    }
  }
}
