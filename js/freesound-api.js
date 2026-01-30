/**
 * Freesound API Integration for Audio Sampler
 * Provides methods to search and download sounds from Freesound
 */

// Freesound API configuration
const FREESOUND_API_BASE = 'https://freesound.org/api/v2';
let FREESOUND_API_KEY = ''; // Will be set by user

/**
 * Set the API key for Freesound access
 * Get a free API key from: https://freesound.org/api/apply/
 */
export function setFreesoundApiKey(apiKey) {
  FREESOUND_API_KEY = apiKey;
  localStorage.setItem('freesound_api_key', apiKey);
}

/**
 * Load saved API key from localStorage
 */
export function loadFreesoundApiKey() {
  const saved = localStorage.getItem('freesound_api_key');
  if (saved) {
    FREESOUND_API_KEY = saved;
    return saved;
  }
  return null;
}

/**
 * Search for sounds on Freesound
 * @param {string} query - Search query (e.g., "drum", "bell")
 * @param {number} limit - Number of results to return (default: 20)
 * @param {string} filter - Filter options (e.g., "duration:[0 TO 5]")
 * @returns {Promise<Array>} Array of sound objects
 */
export async function searchFreesounds(query, limit = 20, filter = '') {
  if (!FREESOUND_API_KEY) {
    throw new Error('Freesound API key not set. Please configure it in settings.');
  }

  const params = new URLSearchParams({
    query,
    limit,
    fields: 'id,name,url,duration,previews,download,username,license',
    token: FREESOUND_API_KEY
  });

  if (filter) {
    params.append('filter', filter);
  }

  try {
    const response = await fetch(`${FREESOUND_API_BASE}/search/text/?${params}`);
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key. Get one at: https://freesound.org/api/apply/');
      }
      throw new Error(`API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Freesound search error:', error);
    throw error;
  }
}

/**
 * Download a sound preview from Freesound
 * @param {Object} sound - Sound object from search results
 * @param {string} quality - Preview quality: 'preview-hq-mp3' or 'preview-lq-mp3'
 * @returns {Promise<Blob>} Audio blob
 */
export async function downloadFreesoundPreview(sound, quality = 'preview-hq-mp3') {
  if (!sound.previews || !sound.previews[quality]) {
    throw new Error(`Preview not available for ${sound.name}`);
  }

  try {
    const response = await fetch(sound.previews[quality]);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    return await response.blob();
  } catch (error) {
    console.error(`Error downloading preview for "${sound.name}":`, error);
    throw error;
  }
}

/**
 * Get sound details
 * @param {number} soundId - Freesound sound ID
 * @returns {Promise<Object>} Detailed sound information
 */
export async function getFreesoundDetails(soundId) {
  if (!FREESOUND_API_KEY) {
    throw new Error('Freesound API key not set.');
  }

  try {
    const response = await fetch(
      `${FREESOUND_API_BASE}/sounds/${soundId}/?token=${FREESOUND_API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch sound details: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching sound details:', error);
    throw error;
  }
}

/**
 * Create a blob-safe name for Freesound preview
 * @param {Object} sound - Sound object
 * @returns {string} Safe filename
 */
export function getFreesoundFileName(sound) {
  const safe = sound.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  return `freesound-${sound.id}-${safe}.mp3`;
}

/**
 * Create a sample name for the sampler
 * @param {Object} sound - Sound object
 * @returns {string} Sample name for UI
 */
export function getFreesoundSampleName(sound) {
  return `${sound.name.substring(0, 30)} (${sound.username})`;
}
