// src/utils.mjs - Fonctions utilitaires pour manipulation fichiers et validation
import fs from "fs/promises";
import path from "path";
import { config } from "./config.mjs";

/**
 * Convertit une chaîne en slug (URL-friendly)
 * Exemples:
 *   "My Preset!" → "my-preset"
 *   "808 Drums (factory)" → "808-drums-factory"
 * 
 * @param {string} str - Chaîne à slugifier
 * @returns {string} Slug
 */
export function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Supprimer caractères spéciaux
    .replace(/[\s_-]+/g, "-")  // Remplacer espaces/underscores par tirets
    .replace(/^-+|-+$/g, "");  // Supprimer tirets début/fin
}

/**
 * Construit le chemin sécurisé vers un fichier preset JSON
 * Accepte soit le nom complet (avec .json) soit juste le nom/slug
 * 
 * @param {string} name - Nom ou slug du preset
 * @returns {string} Chemin absolu vers le fichier JSON
 */
export function safePresetPath(name) {
  const rawName = name.endsWith(".json") ? name.slice(0, -5) : name;
  const slug = slugify(rawName);
  const basename = `${slug}.json`;
  // Normaliser pour éviter path traversal attacks (../, etc.)
  const normalized = path.normalize(basename).replace(/^(\.\.[/\\])+/, "");
  return path.join(config.paths.data, normalized);
}

function rawPresetPath(name) {
  const basename = name.endsWith(".json") ? name : `${name}.json`;
  const normalized = path.normalize(basename).replace(/^(\.\.[/\\])+/, "");
  return path.join(config.paths.data, normalized);
}

/**
 * Résout le chemin d'un preset existant en supportant les noms legacy
 * (fichiers JSON avec espaces/caractères spéciaux)
 *
 * @param {string} name - Nom ou slug du preset
 * @returns {Promise<{path: string, exists: boolean, usedSlug: boolean}>}
 */
export async function resolvePresetPath(name) {
  const slugPath = safePresetPath(name);
  if (await fileExists(slugPath)) {
    return { path: slugPath, exists: true, usedSlug: true };
  }

  const legacyPath = rawPresetPath(name);
  if (await fileExists(legacyPath)) {
    return { path: legacyPath, exists: true, usedSlug: false };
  }

  return { path: slugPath, exists: false, usedSlug: true };
}

/**
 * Vérifie si un fichier existe
 * 
 * @param {string} filePath - Chemin du fichier
 * @returns {Promise<boolean>}
 */
export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lit et parse un fichier JSON
 * Retourne null si le fichier n'existe pas ou est invalide
 * 
 * @param {string} filePath - Chemin du fichier JSON
 * @returns {Promise<Object|null>}
 */
export async function readJSON(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Erreur lecture JSON ${filePath}:`, err.message);
    return null;
  }
}

/**
 * Écrit un objet dans un fichier JSON (avec indentation)
 * 
 * @param {string} filePath - Chemin du fichier
 * @param {Object} data - Données à écrire
 * @returns {Promise<void>}
 */
export async function writeJSON(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Liste tous les fichiers .json dans le dossier des presets
 * 
 * @returns {Promise<string[]>} Liste des noms de fichiers (avec .json)
 */
export async function listPresetFiles() {
  try {
    const files = await fs.readdir(config.paths.data);
    return files.filter((f) => f.endsWith(".json"));
  } catch (err) {
    console.warn("Erreur listage presets:", err.message);
    return [];
  }
}

/**
 * Valide la structure d'un objet preset
 * Un preset valide doit avoir:
 * - name (string non vide)
 * - samples (array, peut être vide)
 * 
 * @param {Object} preset - Objet preset à valider
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePreset(preset) {
  const errors = [];

  if (!preset || typeof preset !== "object") {
    errors.push("Preset doit être un objet");
    return { valid: false, errors };
  }

  // Nom requis
  if (!preset.name || typeof preset.name !== "string" || !preset.name.trim()) {
    errors.push("Le champ 'name' est requis et doit être non vide");
  }

  // Samples doit être un array (peut être vide)
  if (!Array.isArray(preset.samples)) {
    errors.push("Le champ 'samples' doit être un tableau");
  }

  // Valider chaque sample s'il y en a
  if (Array.isArray(preset.samples)) {
    preset.samples.forEach((sample, index) => {
      if (!sample || typeof sample !== "object") {
        errors.push(`Sample ${index}: doit être un objet`);
        return;
      }
      if (!sample.url || typeof sample.url !== "string") {
        errors.push(`Sample ${index}: 'url' est requis`);
      }
      if (sample.name && typeof sample.name !== "string") {
        errors.push(`Sample ${index}: 'name' doit être une chaîne`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Valide qu'un fichier uploadé est un fichier audio acceptable
 * 
 * @param {Object} file - Objet fichier multer
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateAudioFile(file) {
  if (!file) {
    return { valid: false, error: "Aucun fichier fourni" };
  }

  // Vérifier extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.upload.allowedExtensions.includes(ext)) {
    return {
      valid: false,
      error: `Extension ${ext} non autorisée. Extensions acceptées: ${config.upload.allowedExtensions.join(", ")}`,
    };
  }

  // Vérifier MIME type
  if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `Type MIME ${file.mimetype} non autorisé`,
    };
  }

  // Vérifier taille
  if (file.size > config.upload.maxFileSize) {
    const maxMB = config.upload.maxFileSize / 1024 / 1024;
    return {
      valid: false,
      error: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum: ${maxMB}MB`,
    };
  }

  return { valid: true, error: null };
}

/**
 * Crée un dossier de manière récursive (comme mkdir -p)
 * 
 * @param {string} dirPath - Chemin du dossier à créer
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Supprime un fichier (ignore si n'existe pas)
 * 
 * @param {string} filePath - Chemin du fichier
 * @returns {Promise<void>}
 */
export async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`Erreur suppression ${filePath}:`, err.message);
    }
  }
}

/**
 * Supprime un dossier et son contenu récursivement
 * 
 * @param {string} dirPath - Chemin du dossier
 * @returns {Promise<void>}
 */
export async function deleteDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`Erreur suppression dossier ${dirPath}:`, err.message);
  }
}

/**
 * Renomme un fichier ou dossier
 * 
 * @param {string} oldPath - Ancien chemin
 * @param {string} newPath - Nouveau chemin
 * @returns {Promise<void>}
 */
export async function renameFile(oldPath, newPath) {
  await fs.rename(oldPath, newPath);
}
