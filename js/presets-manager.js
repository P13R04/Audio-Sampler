/* ---------------------------------------------------------------------------
  presets-manager.js
  Module dédié à la gestion des presets :
  - Récupération depuis l'API REST
  - Normalisation des formats de réponse
  - Gestion de l'interface select
  --------------------------------------------------------------------------- */

import { formatSampleNameFromUrl } from './utils.js';

/**
 * Récupère les presets depuis l'API
 * @param {string} url - URL de l'API des presets
 * @returns {Promise<Array>} - Données brutes des presets
 */
export async function fetchPresets(url) {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`HTTP ${res.status} en récupérant ${url}`);
  return res.json();
}

/**
 * Normalise la réponse du serveur vers:
 *    [{ name, files: [absoluteUrl, ...] }, ...]
 *
 * D'après ton "exemple REST" (script.js), le serveur renvoie un array de presets,
 * avec pour chaque preset:
 *   { name, type, samples: [{ name, url }, ...] }
 * et les fichiers audio sont servis sous /presets/<sample.url> sur le même host:port.
 * On doit donc construire: absoluteUrl = new URL(`presets/${sample.url}`, API_BASE).
 * 
 * @param {*} raw - Réponse brute de l'API
 * @param {string} apiBase - URL de base de l'API
 * @returns {Array} - Presets normalisés
 */
export function normalizePresets(raw, apiBase) {
  const makeAbsFromApi = (p) => new URL(p, apiBase).toString();

  // CAS attendu (array)
  if (Array.isArray(raw)) {
    return raw.map((preset, i) => {
      // format serveur: samples = [{name, url}, ...]
      let files = [];
      if (Array.isArray(preset.samples)) {
        files = preset.samples
          .map(s => {
            if (!s || !s.url) return null;
            // Enlever le './' au début si présent
            let url = s.url.replace(/^\.\//, '');
            return `presets/${url}`;
          })
          .filter(Boolean)
          .map(makeAbsFromApi); // -> absolu sur API_BASE
      } else if (Array.isArray(preset.files)) {
        // fallback: déjà des chemins (on les rend absolus par l'API)
        files = preset.files.map(f => {
          let url = String(f).replace(/^\.\//, '');
          return makeAbsFromApi(`presets/${url}`);
        });
      } else if (Array.isArray(preset.urls)) {
        files = preset.urls.map(u => {
          let url = String(u).replace(/^\.\//, '');
          return makeAbsFromApi(`presets/${url}`);
        });
      }

      return {
        name: preset.name || preset.title || `Preset ${i + 1}`,
        files
      };
    }).filter(p => p.files.length > 0);
  }

  // CAS { presets: [...] }
  if (raw && Array.isArray(raw.presets)) {
    return normalizePresets(raw.presets, apiBase);
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
  presetSelect.innerHTML = '';
  presets.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name || `Preset ${i + 1}`;
    presetSelect.appendChild(opt);
  });
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
