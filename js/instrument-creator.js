/* ---------------------------------------------------------------------------
  instrument-creator.js
  Module dédié à la création d'instruments et au traitement audio :
  - Création d'instruments (16 notes pitchées)
  - Split de buffer audio sur les silences
  - Trim de silence au début
  - Création de presets depuis segments audio
  --------------------------------------------------------------------------- */

import { formatSampleNameFromUrl } from './utils.js';
import { isObjectUrl, revokeObjectUrlSafe, decodeBlobToAudioBuffer, createTrackedObjectUrl, dataURLToBlob, getUrlFromEntry } from './blob-utils.js';
import { updateOrCreatePresetInLocalStorage as pmUpdateOrCreatePresetInLocalStorage, blobToDataURL } from './presets-manager.js';

/**
 * Crée un instrument (preset) à partir d'un URL/Blob URL qui contient un sample unique
 * Le preset contiendra 16 entrées utilisant la même source mais avec playbackRate différents
 * @param {string} url - URL du sample source
 * @param {string} baseName - Nom de base pour l'instrument
 * @param {Object} params - Paramètres (ctx, audioSamplerComp, presets, etc.)
 */
export async function createInstrumentFromBufferUrl(url, baseName = 'Instrument', params) {
  const { 
    ctx, 
    audioSamplerComp, 
    trimPositions, 
    presets, 
    fillPresetSelect, 
    presetSelect, 
    loadPresetByIndex,
    showStatus,
    showError 
  } = params;
  
  try {
    console.log('[instrument-creator] createInstrumentFromBufferUrl start', { url, baseName, scale: (params && (params.scale || params.scaleMode)) });
    const resp = await fetch(url);
    const ab = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(ab);
    const trimmed = trimLeadingSilence(decoded, 0.01, ctx);

    let useUrl = url;
    const originalUrl = url;
    if (audioSamplerComp && audioSamplerComp.recorder) {
      const wav = audioSamplerComp.recorder.audioBufferToWavBlob(trimmed);
      const created = createTrackedObjectUrl(wav);
      if (created) useUrl = created;
      // Si on a remplacé une blob URL temporaire, révoque l'ancienne
      try { if (originalUrl && originalUrl !== useUrl && isObjectUrl(originalUrl)) revokeObjectUrlSafe(originalUrl); } catch (e) { }
    }

    trimPositions.set(useUrl, { start: 0, end: trimmed.duration });

    // Determiner le mode/échelle utilisé pour générer les 16 notes.
    // params.scale ou params.scaleMode peut spécifier: 'chromatic', 'whole', 'major', 'minor',
    // 'harmonicMinor', 'mixolydian', 'lydian', 'pentatonicMajor', 'pentatonicMinor', etc.
    const scaleMode = (params && (params.scale || params.scaleMode)) || 'chromatic';

    // helper: patterns d'intervalles (en demi-tons) pour une octave
    const SCALE_PATTERNS = {
      chromatic: [0,1], // traitement spécial: pas de pattern, pas d'itération
      // Whole-tone scale: 6 notes par octave (0,2,4,6,8,10)
      whole: [0,2,4,6,8,10],
      major: [0,2,4,5,7,9,11],
      minor: [0,2,3,5,7,8,10],
      harmonicMinor: [0,2,3,5,7,8,11],
      mixolydian: [0,2,4,5,7,9,10],
      lydian: [0,2,4,6,7,9,11],
      pentatonicMajor: [0,2,4,7,9],
      pentatonicMinor: [0,3,5,7,10]
    };

    // Génère une liste de décalages (en demi-tons) centrée autour de 0 sur `length` notes.
    function generateOffsetsForMode(mode, length = 16) {
      if (mode === 'chromatic') {
        // chromatique simple: -12 .. +3 (comme avant)
        return Array.from({ length }, (_, i) => i - 12);
      }

      const pattern = SCALE_PATTERNS[mode] || SCALE_PATTERNS['major'];

      // Construire des positions de degrés sur plusieurs octaves couvrant une large plage
      const positions = [];
      // parcourir quelques octaves négatives -> positives pour s'assurer d'avoir assez
      for (let oct = -3; oct <= 3; oct++) {
        for (let j = 0; j < pattern.length; j++) {
          positions.push(pattern[j] + 12 * oct);
        }
      }
      // trier
      positions.sort((a, b) => a - b);

      // choisir une fenêtre centrée autour de 0
      // trouver l'indice le plus proche de 0
      let centerIdx = 0;
      for (let i = 0; i < positions.length; i++) {
        if (positions[i] >= 0) { centerIdx = i; break; }
      }
      const half = Math.floor(length / 2);
      let startIdx = Math.max(0, centerIdx - half);
      // si pas assez d'éléments après, recaler en fin
      if (startIdx + length > positions.length) startIdx = Math.max(0, positions.length - length);
      const slice = positions.slice(startIdx, startIdx + length);
      // assurer longueur
      while (slice.length < length) slice.push(slice[slice.length - 1] + 2);
      return slice;
    }

    const offsets = generateOffsetsForMode(scaleMode, 16);
    console.log('[instrument-creator] scaleMode offsets generated', scaleMode, offsets);
    const files = [];

    // Helper : render un AudioBuffer à un playbackRate donné via OfflineAudioContext
    async function renderBufferWithPlaybackRate(buffer, rate) {
      // Le rendu d'un buffer avec playbackRate != 1 change la durée
      const outLength = Math.ceil(buffer.length / Math.abs(rate));
      const sampleRate = buffer.sampleRate;
      const offline = new OfflineAudioContext(buffer.numberOfChannels, outLength, sampleRate);
      const src = offline.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      src.connect(offline.destination);
      src.start(0);
      const rendered = await offline.startRendering();
      return rendered;
    }

    // Pour chaque note, on génère un AudioBuffer pitché, on le convertit en WAV,
    // on crée une object URL trackée et on sauvegarde le Blob en IndexedDB
    // index du preset à venir (position dans `presets` une fois ajouté)
    const nextPresetIndex = presets.length;

    for (let idx = 0; idx < offsets.length; idx++) {
      const o = offsets[idx];
      try {
        const rate = Math.pow(2, o / 12);
        const pitched = await renderBufferWithPlaybackRate(trimmed, rate);
        // generate wav blob via recorder if available, fallback to encode later
        let wavBlob = null;
        if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.audioBufferToWavBlob === 'function') {
          try { wavBlob = audioSamplerComp.recorder.audioBufferToWavBlob(pitched); } catch (e) { wavBlob = null; }
        }
        if (!wavBlob) {
          // As a fallback, try to create a WAV via minimal helper (not expected)
          // Skip if unavailable
          continue;
        }
        // create tracked object URL for runtime usage
        const blobUrl = createTrackedObjectUrl(wavBlob);
        console.log('[instrument-creator] generated note', { presetIndex: nextPresetIndex, padIndex: idx, offset: o, rate, blobUrl });
        // save to IndexedDB for later retrieval on import
        let savedSampleId = null;
        try {
          if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
            // name each generated note clearly with preset index and pad index
            // ex: "MyInstrument-instrument-3-7" signifie preset #3, pad #7
            const safeBase = String(baseName).replace(/\s+/g, '_');
            const padIndex = idx; // 0..15 order
            const sampleName = `${safeBase}-instrument-${nextPresetIndex}-${padIndex}`;
            try { savedSampleId = await audioSamplerComp.recorder.saveSample(wavBlob, { name: sampleName, presetIndex: nextPresetIndex, padIndex }); } catch (e) { savedSampleId = null; }
          }
        } catch (e) {
          console.warn('Failed to save generated instrument note to DB', e);
        }
        trimPositions.set(blobUrl, { start: 0, end: pitched.duration });
        // Le blob contient déjà la note pitchée (rendu offline). Pour éviter
        // d'appliquer le pitch deux fois lors de la lecture (double multiplication
        // du rate), on fixe playbackRate à 1 pour les fichiers pré-rendus.
        const entry = { url: blobUrl, name: baseName, playbackRate: 1 };
        if (savedSampleId !== null) entry._sampleId = savedSampleId;
        files.push(entry);
      } catch (e) {
        console.warn('Instrument note generation failed for offset', o, e);
      }
    }

    if (files.length === 0) throw new Error('Impossible de générer les notes de l\'instrument');

    const preset = {
      name: `${baseName} (instrument)`,
      files,
      originalFiles: []
    };

    presets.push(preset);
    // Met à jour l'UI
    fillPresetSelect && fillPresetSelect(presetSelect, presets);
    if (presetSelect) presetSelect.value = String(presets.length - 1);
    // Essayer de persister automatiquement le preset via le wrapper fourni
    try {
      if (params && typeof params.updateOrCreatePreset === 'function') {
        await params.updateOrCreatePreset(presets.length - 1, preset.name);
      } else {
        // fallback: appeler directement le helper de presets-manager pour persister
        try {
          await pmUpdateOrCreatePresetInLocalStorage(presets, trimPositions, presets.length - 1, { dataURLToBlob, createTrackedObjectUrl, isObjectUrl, getUrlFromEntry, blobToDataURL }, preset.name);
        } catch (pe) {
          console.warn('Fallback persistence failed', pe);
          // si même le fallback échoue, on retombe sur le chargement runtime
          await loadPresetByIndex(presets.length - 1);
        }
      }
      showStatus(`Instrument créé à partir de ${baseName}`);
    } catch (e) {
      // si la persistance échoue, on tente quand même de charger le preset
      try { await loadPresetByIndex(presets.length - 1); } catch (_) {}
      showError && showError('Instrument créé mais la sauvegarde automatique a échoué: ' + (e && (e.message || e)));
    }
  } catch (err) {
    showError('Erreur création instrument: ' + (err.message || err));
  }
}

/**
 * Crée un instrument (16 notes pitchées) à partir d'un sample sauvegardé
 * @param {number} id - ID du sample dans IndexedDB
 * @param {Object} params - Paramètres nécessaires
 */
export async function createInstrumentFromSavedSample(id, params) {
  const { audioSamplerComp } = params;
  
  if (!audioSamplerComp || !audioSamplerComp.recorder) {
    throw new Error('Composant recorder introuvable');
  }
  
  const saved = await audioSamplerComp.recorder.getSample(id);
  if (!saved || !saved.blob) throw new Error('Sample introuvable');
  
  const blobUrl = createTrackedObjectUrl(saved.blob);
  const name = saved.name || `sample-${id}`;
  
  await createInstrumentFromBufferUrl(blobUrl, name, params);
}

/**
 * Scinde un AudioBuffer en segments en détectant les silences.
 * Retourne un tableau d'AudioBuffer (segments non vides)
 * @param {AudioBuffer} buffer - Buffer à découper
 * @param {number} threshold - Seuil RMS pour silence
 * @param {number} minSegmentDuration - Durée minimum d'un segment (secondes)
 * @param {AudioContext} ctx - Contexte audio
 * @returns {Array<AudioBuffer>} - Segments détectés
 */
export function splitBufferOnSilence(buffer, threshold = 0.008, minSegmentDuration = 0.04, ctx) {
  const sr = buffer.sampleRate;
  const minSegSamples = Math.floor(minSegmentDuration * sr);
  const chCount = buffer.numberOfChannels;
  const len = buffer.length;

  const winMs = 0.010; // 10 ms
  const winSize = Math.max(1, Math.floor(winMs * sr));

  const env = new Float32Array(len);
  const channels = [];
  for (let ch = 0; ch < chCount; ch++) channels.push(buffer.getChannelData(ch));

  const sqSums = new Float32Array(len);
  for (let ch = 0; ch < chCount; ch++) {
    const src = channels[ch];
    for (let i = 0; i < len; i++) {
      const v = src[i];
      sqSums[i] += v * v;
    }
  }

  let windowSum = 0;
  for (let i = 0; i < len; i++) {
    windowSum += sqSums[i];
    if (i - winSize >= 0) windowSum -= sqSums[i - winSize];
    const denom = Math.min(winSize, i + 1);
    const meanSq = windowSum / denom / chCount;
    env[i] = Math.sqrt(meanSq);
  }

  const segments = [];
  let i = 0;
  while (i < len) {
    while (i < len && env[i] <= threshold) i++;
    if (i >= len) break;
    const start = i;
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

/**
 * Crée un preset en scindant un sample sauvegardé en plusieurs segments
 * @param {number} id - ID du sample dans IndexedDB
 * @param {Object} params - Paramètres nécessaires
 */
export async function createPresetFromSavedSampleSegments(id, params) {
  const { 
    audioSamplerComp, 
    ctx,
    trimPositions,
    presets, 
    fillPresetSelect, 
    presetSelect, 
    loadPresetByIndex,
    showStatus,
    showError 
  } = params;
  
  if (!audioSamplerComp || !audioSamplerComp.recorder) {
    throw new Error('Composant recorder introuvable');
  }
  
  const saved = await audioSamplerComp.recorder.getSample(id);
  if (!saved || !saved.blob) throw new Error('Sample introuvable');
  
  const arrayBuffer = await saved.blob.arrayBuffer();
  const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(arrayBuffer);
  // prefer using the recorder's detectionThreshold when available so UI modes apply
  const savedThresh = (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.detectionThreshold === 'number') ? audioSamplerComp.recorder.detectionThreshold : 0.02;
  const segments = splitBufferOnSilence(decoded, savedThresh, 0.04, ctx);
  
  if (!segments || segments.length === 0) throw new Error('Aucun segment détecté');

  const files = [];
    for (let i = 0; i < segments.length && files.length < 16; i++) {
    const seg = segments[i];
    const blob = audioSamplerComp.recorder.audioBufferToWavBlob(seg);
    const blobUrl = createTrackedObjectUrl(blob);
    // Persist the split segment in IndexedDB so it can be recovered later
    let savedSampleId = null;
    try {
      if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
        try { savedSampleId = await audioSamplerComp.recorder.saveSample(blob, { name: (saved.name || `sample-${id}`) + `-part${i + 1}` }); } catch (e) { savedSampleId = null; }
      }
    } catch (e) { console.warn('Failed to save split segment', e); }
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    const entry = { url: blobUrl, name: (saved.name || `sample-${id}`) + `-part${i + 1}` };
    if (savedSampleId !== null) entry._sampleId = savedSampleId;
    files.push(entry);
  }
  
  const preset = { 
    name: `${saved.name || 'Sample'} (split)`, 
    files, 
    originalFiles: [] 
  };
  
  presets.push(preset);
  fillPresetSelect && fillPresetSelect(presetSelect, presets);
  if (presetSelect) presetSelect.value = String(presets.length - 1);
  // Try to persist the newly created preset (saved split segments exist in DB already)
  try {
    if (params && typeof params.updateOrCreatePreset === 'function') {
      await params.updateOrCreatePreset(presets.length - 1, preset.name);
    } else {
      await pmUpdateOrCreatePresetInLocalStorage(presets, trimPositions, presets.length - 1, { dataURLToBlob, createTrackedObjectUrl, isObjectUrl, getUrlFromEntry, blobToDataURL }, preset.name);
    }
  } catch (e) {
    console.warn('Failed to persist split preset automatically', e);
    try { await loadPresetByIndex(presets.length - 1); } catch (_) {}
  }
  showStatus(`Preset créé (${files.length} sons) à partir de ${saved.name || id}`);
}

/**
 * Crée un preset à partir d'un AudioBuffer en le découpant en segments
 * @param {AudioBuffer} buffer - Buffer à découper
 * @param {string} baseName - Nom de base
 * @param {Object} params - Paramètres nécessaires
 */
export async function createPresetFromBufferSegments(buffer, baseName = 'Recording', params) {
  const { 
    ctx,
    audioSamplerComp,
    trimPositions,
    presets,
    fillPresetSelect,
    presetSelect,
    loadPresetByIndex,
    showStatus,
    showError
  } = params;
  
  if (!buffer) throw new Error('AudioBuffer manquant');
  
  showStatus('Détection des segments (split) en cours…');
  // allow caller to influence threshold via params (e.g. recorder.mode)
  const preferredThresh = (params && params.audioSamplerComp && params.audioSamplerComp.recorder && typeof params.audioSamplerComp.recorder.detectionThreshold === 'number') ? params.audioSamplerComp.recorder.detectionThreshold : 0.008;
  const segments = splitBufferOnSilence(buffer, preferredThresh, 0.04, ctx);
  
  if (!segments || segments.length === 0) {
    showError('Aucun segment détecté — essayez d\'enregistrer à nouveau ou ajustez le seuil.');
    return;
  }
  
  const files = [];
    for (let i = 0; i < segments.length && files.length < 16; i++) {
    const seg = segments[i];
    const blob = audioSamplerComp ? audioSamplerComp.recorder.audioBufferToWavBlob(seg) : null;
    if (!blob) continue;
    const blobUrl = createTrackedObjectUrl(blob);
    // Persist split piece
    let savedSampleId = null;
    try {
      if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
        try { savedSampleId = await audioSamplerComp.recorder.saveSample(blob, { name: `${baseName}-part${i+1}` }); } catch (e) { savedSampleId = null; }
      }
    } catch (e) { console.warn('Failed to save split piece', e); }
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    const entry = { url: blobUrl, name: `${baseName}-part${i+1}` };
    if (savedSampleId !== null) entry._sampleId = savedSampleId;
    files.push(entry);
  }
  
  if (files.length === 0) throw new Error('Aucun segment valide');
  
  const preset = { 
    name: `${baseName} (split)`, 
    files, 
    originalFiles: [] 
  };
  
  presets.push(preset);
  fillPresetSelect && fillPresetSelect(presetSelect, presets);
  if (presetSelect) presetSelect.value = String(presets.length - 1);
  // Persist the created preset so it's stored in user presets (localStorage)
  try {
    if (params && typeof params.updateOrCreatePreset === 'function') {
      await params.updateOrCreatePreset(presets.length - 1, preset.name);
    } else {
      await pmUpdateOrCreatePresetInLocalStorage(presets, trimPositions, presets.length - 1, { dataURLToBlob, createTrackedObjectUrl, isObjectUrl, getUrlFromEntry, blobToDataURL }, preset.name);
    }
  } catch (e) {
    console.warn('Failed to persist buffer-split preset automatically', e);
    try { await loadPresetByIndex(presets.length - 1); } catch (_) {}
  }
  showStatus(`Preset créé (${files.length} sons) à partir de ${baseName}`);
}

/**
 * Crée un instrument à partir d'un AudioBuffer
 * @param {AudioBuffer} buffer - Buffer source
 * @param {string} baseName - Nom de base
 * @param {Object} params - Paramètres nécessaires
 */
export async function createInstrumentFromAudioBuffer(buffer, baseName = 'Instrument', params) {
  if (!buffer) throw new Error('AudioBuffer manquant');
  
  const { audioSamplerComp } = params;
  if (!audioSamplerComp) throw new Error('Composant enregistrement introuvable');
  
  const wav = audioSamplerComp.recorder.audioBufferToWavBlob(buffer);
  const url = createTrackedObjectUrl(wav);
  await createInstrumentFromBufferUrl(url, baseName, params);
}

/**
 * Trim leading silence from an AudioBuffer
 * @param {AudioBuffer} buffer - Buffer à trimmer
 * @param {number} threshold - Seuil d'amplitude
 * @param {AudioContext} ctx - Contexte audio
 * @returns {AudioBuffer} - Buffer sans silence au début
 */
export function trimLeadingSilence(buffer, threshold = 0.01, ctx) {
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
