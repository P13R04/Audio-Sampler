// blob-utils.js
// Utilitaires centralisés pour la gestion des `blob:` URLs et le décodage
// audio. Ces helpers évitent la duplication de logique (création/
// révocation d'URL blob, décodage) entre les différents modules.

export function isObjectUrl(u) {
  return typeof u === 'string' && u.startsWith('blob:');
}

export function getUrlFromEntry(entry) {
  if (!entry) return null;
  return (typeof entry === 'string') ? entry : (entry.url || null);
}

export function revokeObjectUrlSafe(u) {
  try {
    if (isObjectUrl(u)) URL.revokeObjectURL(u);
    try { if (_trackedObjectUrls && _trackedObjectUrls.has && _trackedObjectUrls.has(u)) _trackedObjectUrls.delete(u); } catch (e) {}
  } catch (e) {
    console.warn('Failed to revoke object URL', u, e);
  }
}

// Registre interne des blob: URLs créées via `createTrackedObjectUrl`.
// Permet une révocation déterministe et un nettoyage centralisé.
const _trackedObjectUrls = new Set();

export function createTrackedObjectUrl(blob) {
  try {
    const url = URL.createObjectURL(blob);
    try { _trackedObjectUrls.add(url); } catch (e) {}
    return url;
  } catch (e) {
    console.warn('createTrackedObjectUrl failed', e);
    return null;
  }
}

export function revokeTrackedObjectUrl(u) {
  try {
    if (!u) return;
    if (_trackedObjectUrls.has(u)) _trackedObjectUrls.delete(u);
    if (isObjectUrl(u)) URL.revokeObjectURL(u);
  } catch (e) { console.warn('revokeTrackedObjectUrl failed', e); }
}

export function revokeAllTrackedObjectUrls() {
  try {
    for (const u of Array.from(_trackedObjectUrls)) {
      try { if (isObjectUrl(u)) URL.revokeObjectURL(u); } catch (e) {}
      try { _trackedObjectUrls.delete(u); } catch (e) {}
    }
  } catch (e) { console.warn('revokeAllTrackedObjectUrls failed', e); }
}

// Révoque les blob: URLs présentes dans l'ancien preset qui ne sont pas
// référencées dans la nouvelle liste de fichiers. Utile lors de la
// modification d'un preset pour éviter des fuites mémoire liées aux
// object URLs temporaires.
export function revokePresetBlobUrlsNotInNew(presets, trimPositions, presetIndex, newFiles) {
  try {
    const old = (presets[presetIndex] && Array.isArray(presets[presetIndex].files)) ? presets[presetIndex].files : [];
    const newUrls = new Set((newFiles || []).map(getUrlFromEntry).filter(Boolean));
    try { console.debug('[revokePresetBlobUrlsNotInNew] presetIndex=', presetIndex, 'oldCount=', old.length, 'newCount=', newUrls.size); } catch (e) {}
    for (const e of old) {
      const u = getUrlFromEntry(e);
      // If this entry references a persistent sample (has _sampleId), do not
      // revoke the tracked object URL here — it was created from IndexedDB and
      // may still be needed by the loader. Only revoke pure session-only blob
      // URLs that are not present in the new set.
      const hasSampleId = (e && typeof e._sampleId !== 'undefined' && e._sampleId !== null);
      if (u && isObjectUrl(u) && !newUrls.has(u) && !hasSampleId) {
        try { console.debug('[revokePresetBlobUrlsNotInNew] revoking url=', u, 'from presetIndex=', presetIndex); } catch (e) {}
        revokeObjectUrlSafe(u);
        try { trimPositions.delete(u); } catch (err) {}
      }
    }
  } catch (e) { console.warn('revokePresetBlobUrlsNotInNew failed', e); }
}

// Révoque toutes les blob:URLs d'un preset (suppression complète)
export function revokeAllBlobUrlsForPreset(presets, trimPositions, presetIndex) {
  try {
    const p = presets[presetIndex];
    if (!p || !Array.isArray(p.files)) return;
    for (const e of p.files) {
      const u = getUrlFromEntry(e);
      if (u && isObjectUrl(u)) {
        try { console.debug('[revokeAllBlobUrlsForPreset] revoking url=', u, 'for presetIndex=', presetIndex); } catch (e) {}
        revokeObjectUrlSafe(u);
        try { trimPositions.delete(u); } catch (err) {}
      }
    }
  } catch (e) { console.warn('revokeAllBlobUrlsForPreset failed', e); }
}

// Décode un Blob audio en `AudioBuffer` (best-effort). Retourne une Promise.
export function decodeBlobToAudioBuffer(blob, ctx) {
  return new Promise(async (resolve, reject) => {
    try {
      const ab = await blob.arrayBuffer();
      if (!ctx) return resolve(null);
      // Certains navigateurs retournent une Promise depuis decodeAudioData
      // tandis que d'autres utilisent la forme callback ; gérer les deux.
      const maybePromise = ctx.decodeAudioData(ab);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve).catch(reject);
        return;
      }
      // fallback to callback form
      ctx.decodeAudioData(ab, (decoded) => resolve(decoded), (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Convertit une data:URL en Blob
 * @param {string} dataurl
 * @returns {Blob}
 */
export function dataURLToBlob(dataurl) {
  const parts = dataurl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}
