// ====== API SERVICE ======
// Service centralisé pour toutes les communications avec le backend
// Remplace IndexedDB et localStorage pour la gestion des presets

// Configuration de l'API
const API_CONFIG = {
  // URL de base de l'API (ajuster selon environnement)
  baseUrl: 'https://audio-sampler-x9kz.onrender.com/api',
  
  // Timeout par défaut pour les requêtes (ms)
  timeout: 30000,
  
  // Nombre de tentatives en cas d'échec
  retries: 2,
  
  // Délai entre tentatives (ms)
  retryDelay: 1000,
};

/**
 * Classe pour gérer les erreurs API avec informations structurées
 */
export class ApiError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.response = response;
  }
}

/**
 * Effectue une requête fetch avec timeout et gestion d'erreurs
 * @param {string} url - URL complète
 * @param {Object} options - Options fetch
 * @param {number} retries - Nombre de tentatives restantes
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, retries = API_CONFIG.retries) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    
    // Retry logic pour erreurs réseau
    if (retries > 0 && (err.name === 'AbortError' || err.message.includes('network'))) {
      console.warn(`Retry ${API_CONFIG.retries - retries + 1}/${API_CONFIG.retries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, API_CONFIG.retryDelay));
      return fetchWithTimeout(url, options, retries - 1);
    }
    
    throw err;
  }
}

/**
 * Récupère tous les presets depuis le backend
 * @param {Object} filters - Filtres optionnels
 * @param {string} filters.type - Type de preset (drums, piano, etc.)
 * @param {string} filters.query - Recherche textuelle
 * @param {boolean} filters.factory - Filtrer presets factory
 * @returns {Promise<Array>} Liste des presets
 */
export async function fetchPresets(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.type) params.append('type', filters.type);
  if (filters.query) params.append('q', filters.query);
  if (filters.factory !== undefined) params.append('factory', String(filters.factory));
  
  const url = `${API_CONFIG.baseUrl}/presets${params.toString() ? '?' + params.toString() : ''}`;
  
  try {
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('fetchPresets error:', err);
    throw err;
  }
}

/**
 * Récupère un preset spécifique par nom/slug
 * @param {string} name - Nom ou slug du preset
 * @returns {Promise<Object>} Preset
 */
export async function fetchPreset(name) {
  const url = `${API_CONFIG.baseUrl}/presets/${encodeURIComponent(name)}`;
  
  try {
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new ApiError(`Preset "${name}" not found`, 404);
      }
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('fetchPreset error:', err);
    throw err;
  }
}

/**
 * Crée un nouveau preset (JSON uniquement)
 * @param {Object} preset - Données du preset
 * @param {string} preset.name - Nom (requis)
 * @param {string} preset.type - Type (optionnel)
 * @param {Array} preset.samples - Samples [{url, name}]
 * @returns {Promise<Object>} Preset créé avec métadonnées
 */
export async function createPreset(preset) {
  const url = `${API_CONFIG.baseUrl}/presets`;
  
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('createPreset error:', err);
    throw err;
  }
}

/**
 * Met à jour un preset existant (remplacement complet)
 * @param {string} name - Nom du preset à mettre à jour
 * @param {Object} preset - Nouvelles données
 * @returns {Promise<Object>}
 */
export async function updatePreset(name, preset) {
  const url = `${API_CONFIG.baseUrl}/presets/${encodeURIComponent(name)}`;
  
  try {
    const response = await fetchWithTimeout(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preset),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('updatePreset error:', err);
    throw err;
  }
}

/**
 * Mise à jour partielle d'un preset (ex: renommer)
 * @param {string} name - Nom actuel
 * @param {Object} updates - Champs à mettre à jour
 * @returns {Promise<Object>}
 */
export async function patchPreset(name, updates) {
  const url = `${API_CONFIG.baseUrl}/presets/${encodeURIComponent(name)}`;
  
  try {
    const response = await fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('patchPreset error:', err);
    throw err;
  }
}

/**
 * Renomme un preset (raccourci pour patchPreset)
 * @param {string} oldName - Nom actuel
 * @param {string} newName - Nouveau nom
 * @returns {Promise<Object>}
 */
export async function renamePreset(oldName, newName) {
  return patchPreset(oldName, { name: newName });
}

/**
 * Supprime un preset
 * @param {string} name - Nom du preset
 * @returns {Promise<Object>}
 */
export async function deletePreset(name) {
  const url = `${API_CONFIG.baseUrl}/presets/${encodeURIComponent(name)}`;
  
  try {
    const response = await fetchWithTimeout(url, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('deletePreset error:', err);
    throw err;
  }
}

/**
 * Upload de fichiers audio pour un preset existant
 * @param {string} folder - Nom du dossier/preset
 * @param {FileList|Array<File>} files - Fichiers à uploader
 * @param {Function} onProgress - Callback progression (optionnel)
 * @returns {Promise<Object>}
 */
/**
 * Upload d'un sample individuel
 * @param {string} name - Nom du sample
 * @param {File|Blob} file - Fichier audio
 * @returns {Promise<Object>}
 */
export async function uploadSample(name, file) {
  const url = `${API_CONFIG.baseUrl}/samples`;
  
  const formData = new FormData();
  formData.append('name', name);
  
  // Si c'est un Blob, le convertir en File
  if (file instanceof Blob && !(file instanceof File)) {
    file = new File([file], name + '.wav', { type: 'audio/wav' });
  }
  formData.append('file', file);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('uploadSample error:', err);
    throw err;
  }
}

export async function uploadFiles(folder, files, onProgress) {
  const url = `${API_CONFIG.baseUrl}/presets/${encodeURIComponent(folder)}/upload`;
  
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }
  
  try {
    // Note: pas de timeout pour les uploads (peuvent être longs)
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }
    
    return await response.json();
  } catch (err) {
    console.error('uploadFiles error:', err);
    throw err;
  }
}

/**
 * Crée un preset complet avec upload de fichiers en 2 étapes (upload puis create)
 * @param {string} name - Nom du preset
 * @param {Object} options - Options
 * @param {string} options.type - Type du preset
 * @param {boolean} options.isFactoryPresets - Est un preset factory
 * @param {FileList|Array<File>} files - Fichiers audio
 * @param {Function} onProgress - Callback progression (optionnel)
 * @returns {Promise<Object>}
 */
export async function createPresetWithFiles(name, options = {}, files, onProgress) {
  try {
    if (onProgress) {
      onProgress({ loaded: 0, total: 100, phase: 'uploading' });
    }

    const formData = new FormData();
    formData.append('name', name);
    if (options && options.type) formData.append('type', options.type);
    if (typeof options.isFactoryPresets !== 'undefined') {
      formData.append('isFactoryPresets', String(options.isFactoryPresets));
    }
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    const url = `${API_CONFIG.baseUrl}/presets/create-with-files`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new ApiError(error.error || `HTTP ${response.status}`, response.status, error);
    }

    if (onProgress) {
      onProgress({ loaded: 100, total: 100, phase: 'complete' });
    }

    return await response.json();
  } catch (err) {
    console.error('createPresetWithFiles error:', err);
    throw err;
  }
}

/**
 * Obtient l'URL complète d'un fichier audio depuis le backend
 * @param {string} relativePath - Chemin relatif (ex: "presets/808/kick.wav")
 * @returns {string} URL complète
 */
export function getAudioUrl(relativePath) {
  // Enlever le préfixe 'presets/' s'il existe déjà
  const cleanPath = relativePath.replace(/^\.?\/?(presets\/)?/, '');
  
  // Construire l'URL complète (les fichiers sont servis en statique)
  const baseUrl = API_CONFIG.baseUrl.replace('/api', '');
  return `${baseUrl}/presets/${cleanPath}`;
}

/**
 * Health check de l'API
 * @returns {Promise<Object>}
 */
export async function healthCheck() {
  const url = `${API_CONFIG.baseUrl}/health`;
  
  try {
    const response = await fetchWithTimeout(url);
    
    if (!response.ok) {
      throw new ApiError('Health check failed', response.status);
    }
    
    return await response.json();
  } catch (err) {
    console.error('healthCheck error:', err);
    throw err;
  }
}

/**
 * Configure l'URL de base de l'API (utile pour prod)
 * @param {string} baseUrl - Nouvelle URL de base
 */
export function setApiBaseUrl(baseUrl) {
  API_CONFIG.baseUrl = baseUrl.replace(/\/$/, '') + '/api';
}

/**
 * Obtient la configuration actuelle de l'API
 * @returns {Object}
 */
export function getApiConfig() {
  return { ...API_CONFIG };
}

// Export de la configuration pour permettre modifications externes si nécessaire
export { API_CONFIG };
