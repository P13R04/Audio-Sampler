/**
 * constants.js
 * 
 * Constantes globales de configuration du sampler audio.
 * Centralisation des valeurs magic numbers et URLs pour faciliter la maintenance.
 */

// ====== CONFIGURATION API ======
/**
 * URL de base de l'API REST
 * @type {string}
 */
export const API_BASE = 'http://localhost:3000';

/**
 * Endpoint complet pour récupérer les presets
 * @type {string}
 */
export const PRESETS_URL = `${API_BASE}/api/presets`;

// ====== CONFIGURATION GRILLE DE PADS ======
/**
 * Nombre de lignes dans la grille de pads
 * @type {number}
 */
export const GRID_ROWS = 4;

/**
 * Nombre de colonnes dans la grille de pads
 * @type {number}
 */
export const GRID_COLS = 4;

/**
 * Nombre maximum de samples par preset (16 pads)
 * @type {number}
 */
export const MAX_SAMPLES_PER_PRESET = GRID_ROWS * GRID_COLS;

// ====== CONFIGURATION MIDI ======
/**
 * Note MIDI de base pour le premier pad (C1 = 36)
 * @type {number}
 */
export const MIDI_BASE_NOTE = 36;

/**
 * Nombre de pads MIDI à mapper
 * @type {number}
 */
export const MIDI_PAD_COUNT = 16;

// ====== CONFIGURATION CLAVIER ======
/**
 * Layout clavier par défaut
 * @type {string}
 */
export const DEFAULT_KEYBOARD_LAYOUT = 'azerty';

// ====== CONFIGURATION STOCKAGE ======
/**
 * Clé localStorage pour les presets utilisateur
 * @type {string}
 */
export const LOCALSTORAGE_USER_PRESETS_KEY = 'userPresets';

// ====== CONFIGURATION AUDIO ======
/**
 * Limite de concurrence pour le chargement des samples
 * (nombre de samples décodés en parallèle)
 * @type {number}
 */
export const DEFAULT_PRESET_CONCURRENCY = 4;

/**
 * Délai avant révocation des Object URLs (ms)
 * @type {number}
 */
export const OBJECT_URL_REVOKE_DELAY = 5000;
