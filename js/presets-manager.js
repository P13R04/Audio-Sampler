/* ---------------------------------------------------------------------------
  presets-manager.js
  Module dédié à la gestion des presets :
  - Récupération depuis le backend via api-service
  - Normalisation des formats de réponse
  - Gestion de l'interface select
--------------------------------------------------------------------------- */

import { formatSampleNameFromUrl } from './utils.js';
import { LOCALSTORAGE_USER_PRESETS_KEY, OBJECT_URL_REVOKE_DELAY } from './constants.js';
import * as apiService from './api-service.js';

/**
 * Récupère les presets depuis le backend via api-service
 * @param {Object} filters - Filtres optionnels (type, query, factory)
 * @returns {Promise<Array>} - Données brutes des presets
 */
export async function fetchPresets(filters = {}) {
  return await apiService.fetchPresets(filters);
}

/**
 * Normalise la réponse du backend vers:
 *    [{ name, files: [absoluteUrl, ...] }, ...]
 *
 * Le backend renvoie un array de presets avec:
 *   { name, type, samples: [{ name, url }, ...] }
 * Les fichiers audio sont servis en statique depuis le backend.
 * On construit les URLs complètes via apiService.getAudioUrl().
 * 
 * @param {*} raw - Réponse brute du backend
 * @returns {Array} - Presets normalisés
 */
export function normalizePresets(raw) {
  // CAS attendu (array)
  if (Array.isArray(raw)) {
    return raw.map((preset, i) => {
      // format backend: samples = [{name, url}, ...]
      let files = [];
      
      if (Array.isArray(preset.samples)) {
        files = preset.samples
          .map(s => {
            if (!s || !s.url) return null;
            // Enlever le './' au début si présent et construire URL complète
            const cleanUrl = s.url.replace(/^\.\//, '');
            return { url: apiService.getAudioUrl(cleanUrl), name: s.name || extractFileName(cleanUrl) };
          })
          .filter(Boolean);
      } else if (Array.isArray(preset.files)) {
        // fallback: déjà des chemins
        files = preset.files.map(f => {
          const cleanUrl = String(f).replace(/^\.\//, '');
          return { url: apiService.getAudioUrl(cleanUrl), name: extractFileName(cleanUrl) };
        });
      } else if (Array.isArray(preset.urls)) {
        files = preset.urls.map(u => {
          const cleanUrl = String(u).replace(/^\.\//, '');
          return { url: apiService.getAudioUrl(cleanUrl), name: extractFileName(cleanUrl) };
        });
      }

      return {
        name: preset.name || preset.title || `Preset ${i + 1}`,
        files,
        type: preset.type,
        isFactoryPresets: preset.isFactoryPresets
      };
    }).filter(p => p.files.length > 0);
  }

  // CAS { presets: [...] }
  if (raw && Array.isArray(raw.presets)) {
    return normalizePresets(raw.presets);
  }

  // Autres formats -> vide
  return [];
}

/**
 * Remplit le select HTML avec les presets disponibles
 * @param {HTMLSelectElement} presetSelect - Élément select
 * @param {Array} presets - Liste des presets
 */
export function fillPresetSelect(presetSelect, presets) {
  // Être défensif : si presetSelect est null (nous avons retiré le <select> visible),
  // simplement ignorer pour éviter les erreurs quand d'autres modules appellent ce helper.
  if (!presetSelect || typeof presetSelect !== 'object' || !('innerHTML' in presetSelect)) return;
  
  // Sauvegarder la valeur actuelle pour la restaurer après reconstruction
  const currentValue = presetSelect.value;
  
  presetSelect.innerHTML = '';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name || `Preset ${i + 1}`;
    presetSelect.appendChild(opt);
  });
  
  // Restaurer la valeur si elle est toujours valide
  if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
    const idx = Number(currentValue);
    if (!isNaN(idx) && idx >= 0 && idx < presets.length) {
      presetSelect.value = currentValue;
    }
  }
}

/**
 * Extrait le nom de fichier d'une URL
 * @param {string} url - URL du fichier
 * @returns {string} - Nom de fichier
 */
export function extractFileName(url) {
  try { 
    return decodeURIComponent((url || '').split('/').pop()) || 'file'; 
  } catch { 
    return 'file'; 
  }
}

/**
 * Convertit un Blob en Data URL
 * @param {Blob} blob - Blob à convertir
 * @returns {Promise<string>} - Data URL
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Sérialise un preset pour export en remplaçant les blob: URLs par des data: URLs.
 * @param {Array} presets - tableau de presets runtime
 * @param {Map} trimPositions - map des positions de trim
 * @param {number} idx - index du preset à sérialiser
 * @param {Object} deps - dépendances: { isObjectUrl, getUrlFromEntry, blobToDataURL }
 */
export async function serializePresetForExport(presets, trimPositions, idx, deps) {
  const { isObjectUrl, getUrlFromEntry, blobToDataURL } = deps || {};
  const p = presets[idx];
  if (!p) throw new Error('Preset introuvable');
  const serial = { name: p.name || 'preset', files: [] };
  const files = Array.isArray(p.files) ? p.files : [];
  for (const f of files) {
    const url = getUrlFromEntry ? getUrlFromEntry(f) : (typeof f === 'string' ? f : (f && f.url));
    const entry = { name: (f && f.name) ? f.name : undefined };
    // If the runtime entry references a saved sample id (IndexedDB), prefer
    // serializing that id instead of attempting to inline the blob URL. This
    // makes persisted presets small and robust: on load we can resolve the
    // sample id back to the stored blob via the recorder API.
    if (f && typeof f._sampleId !== 'undefined' && f._sampleId !== null) {
      entry.sampleId = f._sampleId;
      try { if (f.trim) entry.trim = { start: f.trim.start, end: f.trim.end }; } catch (e) {}
      try { if (typeof f.playbackRate === 'number') entry.playbackRate = f.playbackRate; } catch (e) {}
      serial.files.push(entry);
      continue;
    }
    try {
      if (!url) { serial.files.push(entry); continue; }
      if (String(url).startsWith('data:')) {
        entry.url = url;
      } else if (isObjectUrl && isObjectUrl(url)) {
        const resp = await fetch(url);
        const blob = await resp.blob();
        entry.url = await blobToDataURL(blob);
      } else {
        entry.url = url;
      }
      try {
        const t = trimPositions.get(url);
        if (t) entry.trim = { start: t.start, end: t.end };
      } catch (e) {}
      try { if (typeof f.playbackRate === 'number') entry.playbackRate = f.playbackRate; } catch (e) {}
    } catch (err) {
      // Si on échoue à récupérer/convertir une URL d'objet en mémoire, il est plus sûr
      // de neutraliser l'entrée plutôt que de persister une URL blob: de session
      // qui sera invalide après rechargement et causera des erreurs de fetch du loader.
      try { console.warn('serializePresetForExport: failed to inline object URL, neutralizing entry for', url, err); } catch (_) {}
      entry.url = null;
    }
    serial.files.push(entry);
  }
  return serial;
}

/**
 * Télécharge un preset sérialisé en .preset.json
 */
export async function exportPresetToFile(presets, trimPositions, idx, deps) {
  const serial = await serializePresetForExport(presets, trimPositions, idx, deps);
  const blob = new Blob([JSON.stringify(serial, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = (serial.name || 'preset').replace(/[^a-z0-9\-_.]/gi, '_');
  a.download = `${name}.preset.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} }, OBJECT_URL_REVOKE_DELAY);
}

/**
 * Charge un preset sérialisé (obj) dans le runtime en créant des object URLs
 * pour les data: entries. Met à jour `presets` et `trimPositions`.
 * @param {Object} serial - preset sérialisé
 * @param {Array} presets - tableau runtime
 * @param {Map} trimPositions - map runtime
 * @param {Object} deps - dépendances: { dataURLToBlob, createTrackedObjectUrl, getUrlFromEntry }
 */
export async function loadPresetObjectIntoRuntime(serial, presets, trimPositions, deps) {
  const { dataURLToBlob, createTrackedObjectUrl, getSampleById } = deps || {};
  const p = { name: serial.name || 'Imported preset', files: [], originalFiles: [] };
  // Marquer comme provenant du stockage utilisateur pour que les appelants puissent distinguer
  p._fromUser = true;
  for (const f of Array.isArray(serial.files) ? serial.files : []) {
    // Supporter les entrées url héritées ainsi que les références sampleId.
    const url = f && f.url ? f.url : null;
    const sampleId = f && (typeof f.sampleId !== 'undefined') ? f.sampleId : null;
    const name = f && f.name ? f.name : undefined;
    if (!url && !sampleId) { p.files.push({ url: null, name }); continue; }
    if (sampleId !== null) {
      // Résoudre l'ID du sample sauvegardé vers un blob via le helper fourni
      try {
        try { console.debug('[loadPresetObjectIntoRuntime] resolving sampleId=', sampleId); } catch (e) {}
        if (typeof getSampleById === 'function') {
          const saved = await getSampleById(sampleId);
          if (saved && saved.blob) {
            const blobUrl = createTrackedObjectUrl ? createTrackedObjectUrl(saved.blob) : null;
            try { console.debug('[loadPresetObjectIntoRuntime] created tracked blobUrl=', blobUrl, 'for sampleId=', sampleId); } catch (e) {}
            const entry = { url: blobUrl, name };
            // Restore the persistent sample id so runtime entries remain linked
            // to the IndexedDB record and won't be re-saved later.
            try { if (typeof sampleId !== 'undefined' && sampleId !== null) entry._sampleId = sampleId; } catch (e) {}
            if (f && f.trim) entry.trim = { start: f.trim.start, end: f.trim.end };
            if (f && typeof f.playbackRate === 'number') entry.playbackRate = f.playbackRate;
            p.files.push(entry);
            if (f && f.trim && blobUrl) trimPositions.set(blobUrl, { start: f.trim.start, end: f.trim.end });
            continue;
          }
        }
      } catch (e) {
        // fall-through to attempt other strategies
      }
      // Si on n'a pas pu résoudre sampleId, ajouter un placeholder null
      p.files.push({ url: null, name });
      continue;
    }
    if (String(url).startsWith('data:')) {
      try {
        const blob = dataURLToBlob ? dataURLToBlob(url) : null;
        const blobUrl = createTrackedObjectUrl ? createTrackedObjectUrl(await blob) : null;
        const entry = { url: blobUrl, name };
        if (f && f.trim) entry.trim = { start: f.trim.start, end: f.trim.end };
        if (f && typeof f.playbackRate === 'number') entry.playbackRate = f.playbackRate;
        p.files.push(entry);
        if (f && f.trim && blobUrl) trimPositions.set(blobUrl, { start: f.trim.start, end: f.trim.end });
      } catch (e) {
        p.files.push({ url, name });
      }
    } else {
      // Les URLs non-data (ex: absolues ou blob:) sont traitées ici.
      // Les URLs `blob:` proviennent d'une session antérieure et sont
      // invalides après reload — on les neutralise immédiatement pour
      // éviter que le loader tente de fetch/decoder des `blob:` non valides.
      if (String(url).startsWith('blob:')) {
        p.files.push({ url: null, name });
        continue;
      }

      // Entrée normale (URL absolue ou autre scheme supporté)
      let entry = (typeof url === 'string') ? { url, name } : url;
      if (f && f.trim) entry.trim = { start: f.trim.start, end: f.trim.end };
      if (f && typeof f.playbackRate === 'number') entry.playbackRate = f.playbackRate;
      p.files.push(entry);
      if (f && f.trim && entry.url) try { trimPositions.set(entry.url, { start: f.trim.start, end: f.trim.end }); } catch (e) {}
    }
  }
  presets.push(p);
  return p;
}

/**
 * Update or create a preset via backend API (replaces localStorage logic).
 * Converts audio files to Blobs and uploads to backend.
 */
export async function updateOrCreatePresetInBackend(presets, trimPositions, idx, deps, newName) {
  const serial = await serializePresetForExport(presets, trimPositions, idx, deps);
  
  // Helper to create unique name
  function uniqueModifiedName(baseName) {
    const base = (baseName || 'preset').replace(/\s*modified(\s*\(\d+\))?$/i, '').trim();
    let candidate = `${base} modified`;
    let i = 2;
    // On pourrait vérifier sur le backend mais pour simplifier on ajoute juste un suffixe
    while (presets.some(p => p.name === candidate)) {
      candidate = `${base} modified (${i})`;
      i++;
    }
    return candidate;
  }

  const runtimePreset = (Array.isArray(presets) && presets[idx]) ? presets[idx] : null;
  
  // Déterminer le nom du preset
  const presetName = newName && String(newName).trim() ? 
    String(newName).trim() : 
    (runtimePreset && runtimePreset._fromUser ? serial.name : uniqueModifiedName(serial.name));
  const presetType = (runtimePreset && runtimePreset.type) ? runtimePreset.type : (serial.type || 'custom');
  
  // Convertir les fichiers en Blobs pour l'upload
  const files = [];
  for (let i = 0; i < (serial.files || []).length; i++) {
    const file = serial.files[i];
    if (file && file.url) {
      try {
        const response = await fetch(file.url);
        const blob = await response.blob();
        // Générer un nom unique pour chaque fichier en incluant l'index
        const baseName = file.name || 'sample';
        const filename = `${baseName}_${i + 1}.wav`;
        files.push(new File([blob], filename, { type: blob.type || 'audio/wav' }));
      } catch (err) {
        console.warn('Failed to fetch audio file:', file.url, err);
      }
    }
  }
  
  if (files.length === 0) {
    throw new Error('No audio files to upload');
  }
  
  // Utiliser l'API pour créer le preset avec tous les fichiers
  const { createPresetWithFiles, fetchPresets } = await import('./api-service.js');
  const result = await createPresetWithFiles(presetName, {
    type: presetType,
    isFactoryPresets: false
  }, files);
  
  // Recharger les presets depuis le backend
  const updatedPresets = await fetchPresets();
  const normalized = normalizePresets(updatedPresets);
  
  // Remplacer le tableau presets
  presets.length = 0;
  presets.push(...normalized);
  
  // Trouver l'index du nouveau preset
  const newIdx = presets.findIndex(p => p.name === presetName);
  
  return { updated: true, index: newIdx >= 0 ? newIdx : presets.length - 1 };
}

/**
 * DEPRECATED: Old localStorage function kept for compatibility
 * Use updateOrCreatePresetInBackend instead
 */
export async function updateOrCreatePresetInLocalStorage(presets, trimPositions, idx, deps, newName) {
  const serial = await serializePresetForExport(presets, trimPositions, idx, deps);
  const key = LOCALSTORAGE_USER_PRESETS_KEY;
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]');

    // Determine whether the runtime preset at idx is already a user preset.
    const runtimePreset = (Array.isArray(presets) && presets[idx]) ? presets[idx] : null;

    // Helper to create a unique name based on baseName among existing user presets
    function uniqueModifiedName(baseName) {
      const base = (baseName || 'preset').replace(/\s*modified(\s*\(\d+\))?$/i, '').trim();
      let candidate = `${base} modified`;
      let i = 2;
      const names = new Set((existing || []).map(p => p && p.name));
      while (names.has(candidate)) {
        candidate = `${base} modified (${i})`;
        i++;
      }
      return candidate;
    }

    // Si le preset runtime est déjà un preset utilisateur, préférer mettre à jour l'entrée correspondante par nom.
    if (runtimePreset && runtimePreset._fromUser) {
      const found = existing.findIndex(p => p && p.name === serial.name);
      if (found >= 0) {
        // Ensure we never persist session `blob:` URLs: sanitize serial.files
        try {
          serial.files = (serial.files || []).map(f => {
            if (f && typeof f.url === 'string' && String(f.url).startsWith('blob:')) return Object.assign({}, f, { url: null });
            return f;
          });
        } catch (e) {}
        existing[found] = serial;
        localStorage.setItem(key, JSON.stringify(existing));
        
        // CRITICAL FIX: Recharger le preset dans le runtime depuis le localStorage mis à jour
        // pour que presets[idx] reflète les changements
        const loaded = await loadPresetObjectIntoRuntime(serial, presets, trimPositions, deps && { dataURLToBlob: deps && deps.dataURLToBlob, createTrackedObjectUrl: deps && deps.createTrackedObjectUrl, getSampleById: deps && deps.getSampleById });
        // Remplacer le preset à idx par le preset rechargé
        const appendedIndex = presets.length - 1;
        if (appendedIndex !== idx && presets[appendedIndex] === loaded) {
          presets[idx] = loaded;
          try { presets.splice(appendedIndex, 1); } catch (e) {}
        } else if (appendedIndex === idx) {
          // Si idx était déjà le dernier, pas besoin de splice
          presets[idx] = loaded;
        }
        
        return { updated: true, index: idx };
      }
      // Pas trouvé parmi les presets utilisateurs -> ajouter tel quel (sanitizé)
      try {
        serial.files = (serial.files || []).map(f => {
          if (f && typeof f.url === 'string' && String(f.url).startsWith('blob:')) return Object.assign({}, f, { url: null });
          return f;
        });
      } catch (e) {}
      existing.push(serial);
      localStorage.setItem(key, JSON.stringify(existing));
      const loaded = await loadPresetObjectIntoRuntime(serial, presets, trimPositions, deps && { dataURLToBlob: deps && deps.dataURLToBlob, createTrackedObjectUrl: deps && deps.createTrackedObjectUrl, getSampleById: deps && deps.getSampleById });
      const runtimeIdx = presets.indexOf(loaded);
      return { updated: false, index: runtimeIdx >= 0 ? runtimeIdx : existing.length - 1 };
    }

    // Sinon (probablement modification d'un preset API), créer un nouveau preset utilisateur avec un nom modifié
    serial.name = newName && String(newName).trim() ? String(newName).trim() : uniqueModifiedName(serial.name);
    try {
      serial.files = (serial.files || []).map(f => {
        if (f && typeof f.url === 'string' && String(f.url).startsWith('blob:')) return Object.assign({}, f, { url: null });
        return f;
      });
    } catch (e) {}
    existing.push(serial);
    localStorage.setItem(key, JSON.stringify(existing));
    // Charger dans le runtime mais remplacer l'entrée runtime originale
    // pour éviter les doublons (on a poussé un preset runtime avant la persistance).
    const loaded = await loadPresetObjectIntoRuntime(serial, presets, trimPositions, deps && { dataURLToBlob: deps && deps.dataURLToBlob, createTrackedObjectUrl: deps && deps.createTrackedObjectUrl, getSampleById: deps && deps.getSampleById });
    try {
      if (runtimePreset) {
        // Remplacer la preset runtime originale à l'index idx par l'objet chargé
        // et supprimer l'entrée appendue par loadPresetObjectIntoRuntime.
        const appendedIndex = presets.length - 1;
        if (appendedIndex !== idx) {
          presets[idx] = loaded;
          try { presets.splice(appendedIndex, 1); } catch (e) {}
        } else {
          presets[idx] = loaded;
        }
      }
    } catch (e) { console.warn('Failed to replace runtime preset after save', e); }
    // Determine runtime index for the newly created user preset (or replacement)
    const returnedIndex = runtimePreset ? idx : (presets.indexOf(loaded) >= 0 ? presets.indexOf(loaded) : existing.length - 1);
    return { updated: false, index: returnedIndex, name: serial.name };
  } catch (e) { throw e; }
}

/**
 * Charge les presets utilisateurs depuis localStorage dans le runtime
 */
export async function loadUserPresetsFromLocalStorage(presets, trimPositions, deps) {
  const key = 'userPresets';
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(raw) || raw.length === 0) return;
    for (const sp of raw) {
      try { await loadPresetObjectIntoRuntime(sp, presets, trimPositions, deps); } catch (e) { console.warn('failed to load user preset', e); }
    }
  } catch (e) { console.warn('loadUserPresetsFromLocalStorage failed', e); }
}

/**
 * Import depuis un fichier .preset.json et charge dans le runtime (et charge le preset)
 */
export async function importPresetFromFile(file, presets, trimPositions, deps, loadPresetByIndex) {
  const text = await file.text();
  const obj = JSON.parse(text);
  if (!obj || !Array.isArray(obj.files)) throw new Error('Fichier preset invalide');
  await loadPresetObjectIntoRuntime(obj, presets, trimPositions, deps);
  if (typeof loadPresetByIndex === 'function') await loadPresetByIndex(presets.length - 1);
}

/**
 * Sauvegarde un preset sérialisé dans localStorage (clé `userPresets`)
 * et le charge immédiatement dans le runtime.
 * @param {Array} presets
 * @param {Map} trimPositions
 * @param {number} idx
 * @param {Object} deps - dépendances: { isObjectUrl, getUrlFromEntry, blobToDataURL, dataURLToBlob, createTrackedObjectUrl }
 */
export async function savePresetToLocalStorage(presets, trimPositions, idx, deps) {
  const key = 'userPresets';
  const serial = await serializePresetForExport(presets, trimPositions, idx, deps);
  try {
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(serial);
    localStorage.setItem(key, JSON.stringify(existing));
    // Charger immédiatement dans la runtime (fournir getSampleById si disponible)
    await loadPresetObjectIntoRuntime(serial, presets, trimPositions, { dataURLToBlob: deps && deps.dataURLToBlob, createTrackedObjectUrl: deps && deps.createTrackedObjectUrl, getSampleById: deps && deps.getSampleById });
  } catch (e) { throw e; }
}
