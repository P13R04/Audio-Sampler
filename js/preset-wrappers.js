/* preset-wrappers.js
   Petits wrappers sûrs et localisés pour les opérations sur les presets.
   Objectif : extraire du `main.js` la logique de sauvegarde/export/import
   et la gestion create/update sans modifier les signatures utilisées
   ailleurs dans l'application.

   Le module expose une factory `createPresetWrappers(deps)` qui retourne
   un objet contenant les fonctions suivantes (noms inchangés) :
     - exportPresetToFile
     - savePresetToLocalStorage
     - loadPresetObjectIntoRuntime
     - loadUserPresetsFromLocalStorage
     - importPresetFromFile
     - updateOrCreatePreset

   Les commentaires sont en français pour faciliter la maintenance.
*/

import {
  exportPresetToFile as pmExportPresetToFile,
  savePresetToLocalStorage as pmSavePresetToLocalStorage,
  loadPresetObjectIntoRuntime as pmLoadPresetObjectIntoRuntime,
  loadUserPresetsFromLocalStorage as pmLoadUserPresetsFromLocalStorage,
  importPresetFromFile as pmImportPresetFromFile,
  updateOrCreatePresetInLocalStorage as pmUpdateOrCreatePresetInLocalStorage
} from './presets-manager.js';

import {
  isObjectUrl,
  getUrlFromEntry,
  dataURLToBlob,
  createTrackedObjectUrl
} from './blob-utils.js';

import { extractFileName } from './presets-manager.js';
import { blobToDataURL } from './presets-manager.js';

/**
 * Crée les wrappers utilisés par `main.js` et l'UI.
 * @param {Object} deps - dépendances d'exécution
 * @param {Array} deps.presets - référence runtime des presets
 * @param {Map} deps.trimPositions - map runtime des trims
 * @param {Function} deps.getCurrentRoot - retourne le root DOM (document ou shadowRoot)
 * @param {Function} deps.loadPresetByIndex - fonction qui charge un preset par index
 * @param {Function} deps.fillPresetSelect - helper pour remplir le <select>
 * @param {HTMLSelectElement|null} deps.presetSelect - référence éventuelle au select (peut être null)
 */
export function createPresetWrappers({ presets, trimPositions, getCurrentRoot, loadPresetByIndex, fillPresetSelect, presetSelect } = {}) {

  // Télécharge un preset sérialisé en .preset.json (délégué à presets-manager)
  function exportPresetToFile(idx) {
    return pmExportPresetToFile(presets, trimPositions, idx, { isObjectUrl, getUrlFromEntry, blobToDataURL });
  }

  // Sauvegarde un preset dans localStorage (userPresets) et le charge dans le runtime
  async function savePresetToLocalStorage(idx) {
    const root = (typeof getCurrentRoot === 'function') ? getCurrentRoot() : document;
    const audioSamplerComp = root && root.querySelector ? root.querySelector('audio-sampler') : null;
    const getSampleById = (id) => (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.getSample === 'function') ? audioSamplerComp.recorder.getSample(id) : Promise.resolve(null);
    await pmSavePresetToLocalStorage(presets, trimPositions, idx, { dataURLToBlob, createTrackedObjectUrl, isObjectUrl, getUrlFromEntry, blobToDataURL, getSampleById });
    if (presetSelect && typeof fillPresetSelect === 'function') fillPresetSelect(presetSelect, presets);
    try {
      const newIndex = presets.length - 1;
      if (typeof loadPresetByIndex === 'function') await loadPresetByIndex(newIndex);
      if (presetSelect) presetSelect.value = String(newIndex);
    } catch (e) { console.warn('Failed to auto-load saved preset', e); }
  }

  // Charge un preset sérialisé dans le runtime
  async function loadPresetObjectIntoRuntime(serial) {
    const root = (typeof getCurrentRoot === 'function') ? getCurrentRoot() : document;
    const audioSamplerComp = root && root.querySelector ? root.querySelector('audio-sampler') : null;
    const getSampleById = (id) => (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.getSample === 'function') ? audioSamplerComp.recorder.getSample(id) : Promise.resolve(null);
    return pmLoadPresetObjectIntoRuntime(serial, presets, trimPositions, { dataURLToBlob, createTrackedObjectUrl, getSampleById });
  }

  // Charge les presets utilisateurs depuis localStorage
  async function loadUserPresetsFromLocalStorage() {
    const root = (typeof getCurrentRoot === 'function') ? getCurrentRoot() : document;
    const audioSamplerComp = root && root.querySelector ? root.querySelector('audio-sampler') : null;
    const getSampleById = (id) => (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.getSample === 'function') ? audioSamplerComp.recorder.getSample(id) : Promise.resolve(null);
    await pmLoadUserPresetsFromLocalStorage(presets, trimPositions, { dataURLToBlob, createTrackedObjectUrl, getSampleById });
    if (presetSelect && typeof fillPresetSelect === 'function') fillPresetSelect(presetSelect, presets);
  }

  // Import depuis un fichier .preset.json
  async function importPresetFromFile(file) {
    return pmImportPresetFromFile(file, presets, trimPositions, { dataURLToBlob, createTrackedObjectUrl }, loadPresetByIndex);
  }

  // Met à jour ou crée le preset courant : persiste d'abord les blob: URLs
  // dans IndexedDB via le recorder (si présent), puis délègue la sérialisation
  // et l'écriture dans localStorage au helper de presets-manager.
  async function updateOrCreatePreset(idx, newName) {
    idx = (typeof idx === 'number') ? idx : (presetSelect ? Number(presetSelect.value) || 0 : 0);
    const p = presets[idx];
    if (!p) throw new Error('Preset introuvable');
    const root = (typeof getCurrentRoot === 'function') ? getCurrentRoot() : document;
    const audioSamplerComp = root && root.querySelector ? root.querySelector('audio-sampler') : null;

    // Parcours des fichiers du preset pour persister les blob: URLs locales
    for (let i = 0; i < (p.files || []).length; i++) {
      const f = p.files[i];
      // If this entry already references a saved sample, skip re-saving it.
      if (f && typeof f._sampleId !== 'undefined' && f._sampleId !== null) continue;
      const url = (typeof f === 'string') ? f : (f && f.url);
      if (!url) continue;
      try {
        if (isObjectUrl(url)) {
          // Récupère le blob depuis l'URL et l'enregistre via recorder.saveSample
          const resp = await fetch(url);
          const blob = await resp.blob();
          if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
            const id = await audioSamplerComp.recorder.saveSample(blob, { name: f.name || extractFileName(url) });
            const newUrl = createTrackedObjectUrl(blob);
            p.files[i] = Object.assign({}, f, { url: newUrl, _sampleId: id });
            try { if (trimPositions.has(url)) { const t = trimPositions.get(url); trimPositions.set(newUrl, t); trimPositions.delete(url); } } catch (e) {}
          }
        } else if (String(url).startsWith('data:')) {
          // Convertit data: en Blob puis enregistre
          try {
            const blob = dataURLToBlob(url);
            if (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.saveSample === 'function') {
              const id = await audioSamplerComp.recorder.saveSample(blob, { name: f.name || 'imported' });
              const newUrl = createTrackedObjectUrl(blob);
              p.files[i] = Object.assign({}, f, { url: newUrl, _sampleId: id });
              try { if (trimPositions.has(url)) { const t = trimPositions.get(url); trimPositions.set(newUrl, t); trimPositions.delete(url); } } catch (e) {}
            }
          } catch (e) { console.warn('dataURL->blob persist failed', e); }
        }
      } catch (e) { console.warn('Failed to persist sample for preset update', e); }
    }

    // Debug: list what we will serialize (urls/sampleIds) to help diagnose races
    try {
      const dump = (p.files || []).map(f => ({ url: (f && f.url) || null, sampleId: (f && f._sampleId) || null }));
      console.debug('[updateOrCreatePreset] about to serialize preset index=', idx, 'name=', p.name, 'files=', dump);
    } catch (e) {}

    // Délégation à presets-manager pour sérialiser et stocker en localStorage
    // IMPORTANT: fournir les dépendances attendues par `serializePresetForExport`
    // afin que les object URLs soient converties en `data:` lors de la sérialisation.
    const getSampleById = (id) => (audioSamplerComp && audioSamplerComp.recorder && typeof audioSamplerComp.recorder.getSample === 'function') ? audioSamplerComp.recorder.getSample(id) : Promise.resolve(null);
    const res = await pmUpdateOrCreatePresetInLocalStorage(presets, trimPositions, idx, {
      isObjectUrl,
      getUrlFromEntry,
      blobToDataURL,
      dataURLToBlob,
      createTrackedObjectUrl,
      getSampleById
    }, newName);
    try { console.debug('[updateOrCreatePreset wrapper] persistence result', res, 'requested idx=', idx); } catch (e) {}
    try {
      // Mark the runtime preset returned by the persistence helper as from-user
      if (res && typeof res.index === 'number') {
        if (presets[res.index]) presets[res.index]._fromUser = true;
      } else if (presets[idx]) {
        presets[idx]._fromUser = true;
      }
    } catch (e) {}
    try {
      if (res && typeof res.index === 'number') {
        if (typeof loadPresetByIndex === 'function') await loadPresetByIndex(res.index);
        if (presetSelect && typeof fillPresetSelect === 'function') fillPresetSelect(presetSelect, presets);
        try { if (presetSelect) presetSelect.value = String(res.index); } catch (e) {}
      }
    } catch (e) { console.warn('Failed to load preset after update/create', e); }
    return res;
  }

  return {
    exportPresetToFile,
    savePresetToLocalStorage,
    loadPresetObjectIntoRuntime,
    loadUserPresetsFromLocalStorage,
    importPresetFromFile,
    updateOrCreatePreset
  };

}
