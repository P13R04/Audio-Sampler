// Module d'enregistrement et utilitaires (ESM)
// Fournit la classe `Recorder` qui encapsule :
// - MediaRecorder pour capturer l'audio microphone
// - décodage en AudioBuffer
// - normalisation et trimming
// - conversion en Blob WAV (PCM16)
//
// Note : ce module est volontairement simple (POC). Il peut être amélioré
// ultérieurement (gestion de formats, chunking, meilleure gestion des erreurs,
// compression, etc.).

export class Recorder {
  constructor({ maxDuration = 30, audioContext = null, detectionThreshold = 0.02, detectionHoldMs = 30, windowMs = 10 } = {}) {
    // Durée max d'enregistrement en secondes (configurable)
    this.maxDuration = maxDuration;

    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    // Use injected AudioContext if provided, otherwise create a new one
    if (audioContext && typeof audioContext === 'object') {
      this.audioContext = audioContext;
      this._ownsAudioContext = false;
    } else {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this._ownsAudioContext = true;
    }
    this._recordTimeout = null;
    // Niveau minimal pour considérer que le son commence (valeur par défaut augmentée)
    this.detectionThreshold = detectionThreshold;
    // Durée minimale (ms) pendant laquelle le RMS doit rester au-dessus du seuil
    this.detectionHoldMs = detectionHoldMs;
    // Taille de la fenêtre (ms) utilisée pour calculer le RMS glissant
    this.windowMs = windowMs;
  }

  // Initialise l'accès au micro et prépare le MediaRecorder.
  // Demande la permission d'accès au microphone si nécessaire.
  async init() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia non supporté par ce navigateur');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);

    // Écoute des chunks émis par MediaRecorder
    this.mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    });
  }

  // Démarre l'enregistrement et stoppe automatiquement après `maxDuration`.
  start() {
    if (!this.mediaRecorder) throw new Error('Recorder non initialisé. Appelez init()');
    this.chunks = [];
    this.mediaRecorder.start();
    this._recordTimeout = setTimeout(() => this.stop(), this.maxDuration * 1000);
  }

  // Arrête l'enregistrement et retourne un objet { blob, audioBuffer }.
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
          const trimmed = this._trimLeadingSilence(decoded);

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

  // Supprime le silence initial d'un AudioBuffer.
  // - buffer : AudioBuffer à traiter
  // - threshold : seuil d'amplitude pour considérer qu'il y a du son (0..1)
  // Renvoie un nouveau AudioBuffer commençant au premier échantillon audibl
  _trimLeadingSilence(buffer, threshold = undefined) {
    /**
     * Détection basée sur le RMS sur fenêtres non chevauchantes.
     * - threshold : amplitude RMS minimale (0..1)
     * - windowMs : taille de la fenêtre en ms
     * - detectionHoldMs : durée en ms pendant laquelle le RMS doit rester > threshold
     */
    if (!buffer || buffer.length === 0) return buffer;
    threshold = (typeof threshold === 'number') ? threshold : (this.detectionThreshold || 0.02);
    const sr = buffer.sampleRate;
    const windowSize = Math.max(1, Math.floor((this.windowMs || 10) * sr / 1000));
    const holdWindows = Math.max(1, Math.ceil((this.detectionHoldMs || 30) / (this.windowMs || 10)));

    // Calculate RMS per window across channels
    const numWindows = Math.ceil(buffer.length / windowSize);
    const rms = new Float32Array(numWindows);
    for (let w = 0; w < numWindows; w++) {
      const start = w * windowSize;
      const end = Math.min(buffer.length, start + windowSize);
      let sumSq = 0;
      let count = 0;
      for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = start; i < end; i++) {
          const v = data[i];
          sumSq += v * v;
          count++;
        }
      }
      rms[w] = (count > 0) ? Math.sqrt(sumSq / count) : 0;
    }

    // Find first window where rms > threshold for at least holdWindows consecutive windows
    let firstWindowIndex = -1;
    for (let i = 0; i < numWindows; i++) {
      if (rms[i] > threshold) {
        let ok = true;
        for (let k = 1; k < holdWindows; k++) {
          if (i + k >= numWindows || rms[i + k] <= threshold) { ok = false; break; }
        }
        if (ok) { firstWindowIndex = i; break; }
      }
    }

    if (firstWindowIndex === -1) {
      // Nothing detected — return original
      return buffer;
    }

    // Convert to sample index; add a small pre-roll equal to one window to avoid cutting too tightly
    let startSample = Math.max(0, firstWindowIndex * windowSize - windowSize);
    if (startSample >= buffer.length - 1) return buffer;
    const remaining = buffer.length - startSample;
    const newBuf = this.audioContext.createBuffer(buffer.numberOfChannels, remaining, sr);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = newBuf.getChannelData(ch);
      for (let i = 0; i < remaining; i++) dst[i] = src[i + startSample];
    }
    return newBuf;
  }

  // Convertit un AudioBuffer en Blob WAV (PCM16)
  // Utilisé pour exporter des presets compatibles WAV.
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

  // Normalise un AudioBuffer en place (amplification sans écrêtage)
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

  // Ferme le flux microphone et libère les ressources associées.
  destroy() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    // Close the AudioContext only if this instance created it
    try {
      if (this._ownsAudioContext && this.audioContext && this.audioContext.close) {
        this.audioContext.close();
      }
    } catch (e) {
      console.warn('Échec fermeture AudioContext du recorder', e);
    }
  }
}
