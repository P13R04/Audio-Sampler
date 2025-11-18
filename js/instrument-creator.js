/* ---------------------------------------------------------------------------
  instrument-creator.js
  Module dédié à la création d'instruments et au traitement audio :
  - Création d'instruments (16 notes pitchées)
  - Split de buffer audio sur les silences
  - Trim de silence au début
  - Création de presets depuis segments audio
  --------------------------------------------------------------------------- */

import { formatSampleNameFromUrl } from './utils.js';
import { isObjectUrl, revokeObjectUrlSafe, decodeBlobToAudioBuffer, createTrackedObjectUrl } from './blob-utils.js';

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

    // Construire 16 offsets en demi-tons (par défaut: -12 .. +3)
    const offsets = Array.from({ length: 16 }, (_, i) => i - 12);
    const entries = offsets.map(o => ({ 
      url: useUrl, 
      name: baseName, 
      playbackRate: Math.pow(2, o / 12) 
    }));
    
    const preset = { 
      name: `${baseName} (instrument)`, 
      files: entries, 
      originalFiles: [] 
    };
    
    presets.push(preset);
    fillPresetSelect(presetSelect, presets);
    presetSelect.value = String(presets.length - 1);
    await loadPresetByIndex(presets.length - 1);
    showStatus(`Instrument créé à partir de ${baseName}`);
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
  const segments = splitBufferOnSilence(decoded, 0.02, 0.04, ctx);
  
  if (!segments || segments.length === 0) throw new Error('Aucun segment détecté');

  const files = [];
  for (let i = 0; i < segments.length && files.length < 16; i++) {
    const seg = segments[i];
    const blob = audioSamplerComp.recorder.audioBufferToWavBlob(seg);
    const blobUrl = createTrackedObjectUrl(blob);
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    files.push({ 
      url: blobUrl, 
      name: (saved.name || `sample-${id}`) + `-part${i + 1}` 
    });
  }
  
  const preset = { 
    name: `${saved.name || 'Sample'} (split)`, 
    files, 
    originalFiles: [] 
  };
  
  presets.push(preset);
  fillPresetSelect(presetSelect, presets);
  presetSelect.value = String(presets.length - 1);
  await loadPresetByIndex(presets.length - 1);
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
  const segments = splitBufferOnSilence(buffer, 0.008, 0.04, ctx);
  
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
    trimPositions.set(blobUrl, { start: 0, end: seg.duration });
    files.push({ url: blobUrl, name: `${baseName}-part${i+1}` });
  }
  
  if (files.length === 0) throw new Error('Aucun segment valide');
  
  const preset = { 
    name: `${baseName} (split)`, 
    files, 
    originalFiles: [] 
  };
  
  presets.push(preset);
  fillPresetSelect(presetSelect, presets);
  presetSelect.value = String(presets.length - 1);
  await loadPresetByIndex(presets.length - 1);
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
