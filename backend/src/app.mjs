// src/app.mjs - Serveur API REST pour Audio Sampler
//
// API REST complète pour gérer les presets audio:
// - CRUD complet (Create, Read, Update, Delete)
// - Upload de fichiers multipart avec multer
// - Validation des données
// - Gestion des erreurs
// - CORS configuré pour développement/production

import express from "express";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import path from "path";
import cors from "cors";
import multer from "multer";
import Busboy from "busboy";

import { config } from "./config.mjs";
import {
  slugify,
  safePresetPath,
  resolvePresetPath,
  fileExists,
  readJSON,
  writeJSON,
  listPresetFiles,
  validatePreset,
  validateAudioFile,
  ensureDir,
  deleteFile,
  deleteDir,
  renameFile,
} from "./utils.mjs";

// ========== CONFIGURATION EXPRESS ==========

export const app = express();

// Middleware parsing JSON (limite 2MB pour éviter DoS)
app.use(express.json({ limit: "2mb" }));

// Middleware pour parser form-data AVANT multer
app.use(express.urlencoded({ limit: "2mb", extended: true }));

// Middleware CORS
app.use(
  cors({
    origin: (origin, cb) => {
      const isAllowed = config.cors.validateOrigin(origin);
      if (!isAllowed) {
        return cb(new Error("Not allowed by CORS"));
      }
      cb(null, true);
    },
    credentials: true,
  })
);

// Servir les fichiers statiques (HTML, CSS, JS, audio)
// Les fichiers dans public/ seront accessibles à la racine
// Ex: public/index.html → http://localhost:3000/index.html
// Ex: public/presets/808/kick.wav → http://localhost:3000/presets/808/kick.wav
app.use(express.static(config.paths.public));

// Logging middleware (simple)
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// ========== CONFIGURATION MULTER (UPLOAD) ==========

// Storage pour multer: enregistre les fichiers dans public/presets/<folder>/
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    // Le nom du dossier peut être passé en param ou dans le body
    const folder = req.params.folder || req.body.folder || "uploads";
    const slug = slugify(folder);
    const destDir = path.join(config.paths.data, slug);

    // Créer le dossier si nécessaire
    await ensureDir(destDir);
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // Garder le nom original (ou slugifier si souhaité)
    cb(null, file.originalname);
  },
});

// Configuration multer
const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter: (req, file, cb) => {
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      return cb(new Error(validation.error));
    }
    cb(null, true);
  },
});

// ========== ROUTES API ==========

/**
 * POST /api/samples - Upload d'un sample individuel
 * Body (multipart/form-data):
 *   - name: string (nom du sample)
 *   - file: File (fichier audio)
 */
app.post('/api/samples', async (req, res, next) => {
  const uploadDir = config.paths.data;
  const fields = {};
  let uploadedFile = null;

  const bb = Busboy({ headers: req.headers });

  bb.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on('file', async (fieldname, file, info) => {
    if (fieldname !== 'file') {
      file.resume();
      return;
    }

    const sampleName = fields.name || path.parse(info.filename).name;
    const slug = slugify(sampleName);
    const destDir = path.join(uploadDir, slug);

    await ensureDir(destDir);

    const filename = path.basename(info.filename);
    const filepath = path.join(destDir, filename);

    // Validation
    const validation = validateAudioFile({
      originalname: info.filename,
      mimetype: info.mimeType,
    });

    if (!validation.valid) {
      file.resume();
      return;
    }

    const writeStream = createWriteStream(filepath);
    file.pipe(writeStream);

    uploadedFile = {
      originalname: filename,
      filename: filename,
      mimetype: info.mimeType,
      size: 0,
      slug: slug,
    };

    let fileSize = 0;
    file.on('data', (chunk) => {
      fileSize += chunk.length;
    });

    await new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        uploadedFile.size = fileSize;
        resolve();
      });
      writeStream.on('error', reject);
      file.on('error', reject);
    });
  });

  bb.on('close', async () => {
    try {
      if (!uploadedFile) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
      }

      const sampleName = fields.name || path.parse(uploadedFile.originalname).name;
      const slug = uploadedFile.slug;

      // Créer un preset simple avec un seul sample
      const preset = {
        name: sampleName,
        type: 'Sample',
        samples: [{
          url: `./${slug}/${uploadedFile.originalname}`,
          name: sampleName
        }],
        isFactoryPresets: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const presetPath = safePresetPath(slug);
      await writeJSON(presetPath, preset);

      res.status(201).json({
        message: 'Sample uploadé avec succès',
        preset,
        file: {
          originalName: uploadedFile.originalname,
          storedName: uploadedFile.filename,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
          url: `/presets/${slug}/${uploadedFile.filename}`
        }
      });
    } catch (err) {
      res.status(500).json({
        error: 'Erreur lors de la création du sample',
        details: err.message
      });
    }
  });

  bb.on('error', (err) => {
    res.status(400).json({
      error: 'Erreur lors du parsing',
      details: err.message
    });
  });

  req.pipe(bb);
});

/**
 * Health check - pour vérifier que le serveur fonctionne
 * GET /api/health
 */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: config.env,
    uptime: process.uptime(),
  });
});

/**
 * Liste tous les presets avec filtres optionnels
 * GET /api/presets?q=kick&type=drums&factory=true
 * 
 * Query params:
 * - q: Recherche textuelle (dans nom et samples)
 * - type: Filtre par type (drums, piano, etc.)
 * - factory: true/false pour filtrer presets factory
 */
app.get("/api/presets", async (req, res, next) => {
  try {
    const { q, type, factory } = req.query;

    // Lire tous les fichiers JSON
    const files = await listPresetFiles();

    // Charger tous les presets en parallèle
    let presets = await Promise.all(
      files.map((filename) => readJSON(path.join(config.paths.data, filename)))
    );

    // Filtrer les null (fichiers invalides)
    presets = presets.filter((p) => p !== null);

    // Appliquer filtres

    // Filtre par type
    if (type) {
      const typeFilter = String(type).toLowerCase();
      presets = presets.filter(
        (p) => p.type && p.type.toLowerCase() === typeFilter
      );
    }

    // Filtre factory
    if (factory !== undefined) {
      const wantFactory = String(factory) === "true";
      presets = presets.filter((p) => Boolean(p.isFactoryPresets) === wantFactory);
    }

    // Recherche textuelle
    if (q) {
      const needle = String(q).toLowerCase();
      presets = presets.filter((p) => {
        // Rechercher dans le nom
        const inName = p.name && p.name.toLowerCase().includes(needle);

        // Rechercher dans les samples
        const inSamples =
          Array.isArray(p.samples) &&
          p.samples.some(
            (s) =>
              s &&
              (s.name?.toLowerCase().includes(needle) ||
                s.url?.toLowerCase().includes(needle))
          );

        return inName || inSamples;
      });
    }

    res.json(presets);
  } catch (err) {
    next(err);
  }
});

/**
 * Récupère un preset spécifique par nom ou slug
 * GET /api/presets/:name
 * 
 * Exemples:
 * - /api/presets/808
 * - /api/presets/basic-kit
 * - /api/presets/Hip%20Hop.json (avec ou sans .json)
 */
app.get("/api/presets/:name", async (req, res, next) => {
  try {
    const resolved = await resolvePresetPath(req.params.name);

    if (!resolved.exists) {
      return res.status(404).json({
        error: "Preset not found",
        name: req.params.name,
      });
    }

    const preset = await readJSON(resolved.path);

    if (!preset) {
      return res.status(500).json({
        error: "Failed to read preset",
        name: req.params.name,
      });
    }

    res.json(preset);
  } catch (err) {
    next(err);
  }
});

/**
 * Crée un nouveau preset
 * POST /api/presets
 * 
 * Body JSON:
 * {
 *   "name": "My New Preset",
 *   "type": "drums",
 *   "samples": [
 *     { "url": "/presets/my-preset/kick.wav", "name": "Kick" }
 *   ],
 *   "isFactoryPresets": false
 * }
 * 
 * Ou multipart/form-data pour upload avec fichiers (voir route upload séparée)
 */
app.post("/api/presets", async (req, res, next) => {
  try {
    const preset = req.body || {};

    // Validation
    const validation = validatePreset(preset);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid preset data",
        details: validation.errors,
      });
    }

    // Générer le slug pour le nom du fichier
    const existing = await resolvePresetPath(preset.name);
    if (existing.exists) {
      return res.status(409).json({
        error: "Preset already exists",
        name: preset.name,
        slug: slugify(preset.name),
      });
    }

    const slug = slugify(preset.name);
    const filePath = safePresetPath(slug);

    // Ajouter métadonnées
    const presetToSave = {
      ...preset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Sauvegarder
    await writeJSON(filePath, presetToSave);

    res.status(201).json({
      message: "Preset created successfully",
      preset: presetToSave,
      slug,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Met à jour un preset existant (remplacement complet)
 * PUT /api/presets/:name
 * 
 * Body: même structure que POST
 */
app.put("/api/presets/:name", async (req, res, next) => {
  try {
    const resolved = await resolvePresetPath(req.params.name);

    if (!resolved.exists) {
      return res.status(404).json({
        error: "Preset not found",
        name: req.params.name,
      });
    }

    const preset = req.body || {};

    // Validation
    const validation = validatePreset(preset);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid preset data",
        details: validation.errors,
      });
    }

    // Lire le preset existant pour préserver certaines données
    const existing = await readJSON(resolved.path);

    // Mise à jour
    const presetToSave = {
      ...preset,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await writeJSON(resolved.path, presetToSave);

    res.json({
      message: "Preset updated successfully",
      preset: presetToSave,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Mise à jour partielle d'un preset (ex: renommer)
 * PATCH /api/presets/:name
 * 
 * Body:
 * { "name": "New Name" }
 * ou
 * { "type": "piano" }
 */
app.patch("/api/presets/:name", async (req, res, next) => {
  try {
    const resolved = await resolvePresetPath(req.params.name);
    const oldFilePath = resolved.path;

    if (!resolved.exists) {
      return res.status(404).json({
        error: "Preset not found",
        name: req.params.name,
      });
    }

    const preset = await readJSON(oldFilePath);
    const updates = req.body || {};

    // Appliquer les mises à jour
    const updatedPreset = {
      ...preset,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validation du preset mis à jour
    const validation = validatePreset(updatedPreset);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid preset data after update",
        details: validation.errors,
      });
    }

    // Si le nom a changé, renommer le fichier
    if (updates.name && updates.name !== preset.name) {
      const newSlug = slugify(updates.name);
      const newFilePath = safePresetPath(newSlug);

      // Vérifier que le nouveau nom n'existe pas déjà
      if (await fileExists(newFilePath)) {
        return res.status(409).json({
          error: "A preset with this name already exists",
          name: updates.name,
        });
      }

      // Sauvegarder avec le nouveau nom
      await writeJSON(newFilePath, updatedPreset);

      // Supprimer l'ancien fichier
      await deleteFile(oldFilePath);

      // Si un dossier de samples existe, le renommer aussi
      const oldFolder = path.join(
        config.paths.data,
        slugify(preset.name)
      );
      const newFolder = path.join(config.paths.data, newSlug);

      if (await fileExists(oldFolder)) {
        await renameFile(oldFolder, newFolder);

        // Mettre à jour les URLs des samples dans le preset
        if (Array.isArray(updatedPreset.samples)) {
          updatedPreset.samples = updatedPreset.samples.map((sample) => {
            if (sample.url) {
              sample.url = sample.url.replace(
                `/presets/${slugify(preset.name)}/`,
                `/presets/${newSlug}/`
              );
            }
            return sample;
          });
          await writeJSON(newFilePath, updatedPreset);
        }
      }

      return res.json({
        message: "Preset renamed successfully",
        preset: updatedPreset,
        oldSlug: slugify(preset.name),
        newSlug,
      });
    }

    // Sinon, simple mise à jour
    await writeJSON(oldFilePath, updatedPreset);

    res.json({
      message: "Preset updated successfully",
      preset: updatedPreset,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Supprime un preset (fichier JSON + dossier de samples)
 * DELETE /api/presets/:name
 */
app.delete("/api/presets/:name", async (req, res, next) => {
  try {
    const resolved = await resolvePresetPath(req.params.name);
    const filePath = resolved.path;

    if (!resolved.exists) {
      return res.status(404).json({
        error: "Preset not found",
        name: req.params.name,
      });
    }

    const preset = await readJSON(filePath);

    // Supprimer le fichier JSON
    await deleteFile(filePath);

    // Supprimer le dossier de samples s'il existe
    const folder = path.join(config.paths.data, slugify(preset.name));
    if (await fileExists(folder)) {
      await deleteDir(folder);
    }

    res.json({
      message: "Preset deleted successfully",
      name: preset.name,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Upload de fichiers audio pour un preset
 * POST /api/presets/:folder/upload
 * 
 * Content-Type: multipart/form-data
 * Accepte plusieurs fichiers avec le champ "files"
 * 
 * Exemple avec fetch:
 * const formData = new FormData();
 * formData.append('files', file1);
 * formData.append('files', file2);
 * fetch('/api/presets/my-preset/upload', { method: 'POST', body: formData })
 */
app.post(
  "/api/presets/:folder/upload",
  upload.array("files", 20), // Max 20 fichiers
  async (req, res, next) => {
    try {
      const folder = slugify(req.params.folder);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          error: "No files uploaded",
        });
      }

      // Construire la liste des fichiers uploadés avec leurs URLs
      const uploadedFiles = req.files.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        url: `/presets/${folder}/${file.filename}`,
      }));

      res.status(201).json({
        message: "Files uploaded successfully",
        count: uploadedFiles.length,
        files: uploadedFiles,
        folder,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Crée un preset complet avec upload de fichiers
 * POST /api/presets/create-with-files
 * 
 * Content-Type: multipart/form-data
 * Champs:
 * - name: Nom du preset
 * - type: Type (optionnel)
 * - files: Fichiers audio (multiple)
 */
app.post(
  "/api/presets/create-with-files",
  async (req, res, next) => {
    const uploadDir = config.paths.data;
    const fields = {};
    const files = [];
    let presetSlug = "";

    // Créer busboy parser
    const bb = Busboy({ headers: req.headers });

    // Gérer les fields texte
    bb.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    // Gérer les fichiers uploadés
    bb.on('file', async (fieldname, file, info) => {
      if (fieldname !== 'files') {
        file.resume();
        return;
      }

      // Utiliser le preset name pour créer le folder
      const slug = presetSlug || fields.name;
      if (!slug || !slug.trim()) {
        file.resume();
        return;
      }

      const destDir = path.join(uploadDir, slugify(slug));

      // Créer le dossier
      await ensureDir(destDir);

      const filename = path.basename(info.filename);
      const filepath = path.join(destDir, filename);

      // Valider le fichier audio
      const validation = validateAudioFile({
        originalname: info.filename,
        mimetype: info.mimeType,
      });

      if (!validation.valid) {
        file.resume();
        return;
      }

      // Sauvegarder le fichier
      const writeStream = createWriteStream(filepath);

      file.pipe(writeStream);

      files.push({
        name: path.parse(filename).name,
        filename: filename,
        slug: slugify(slug),
      });

      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        file.on('error', reject);
      });
    });

    // Gérer la fin du parsing
    bb.on('close', async () => {
      try {
        const { name, type, isFactoryPresets } = fields;

        // Validation
        if (!name || !name.trim()) {
          return res.status(400).json({
            error: "Preset name is required",
          });
        }

        if (files.length === 0) {
          return res.status(400).json({
            error: "At least one audio file is required",
          });
        }

        presetSlug = slugify(name);
        const presetPath = safePresetPath(presetSlug);

        // Vérifier si existe déjà
        if (await fileExists(presetPath)) {
          return res.status(409).json({
            error: "Preset already exists",
            name,
            slug: presetSlug,
          });
        }

        // Construire les samples
        const samples = files.map((f, index) => ({
          name: f.name,
          url: `./${f.slug}/${f.filename}`,
          index,
        }));

        // Créer le preset
        const preset = {
          name,
          type: type || "custom",
          samples,
          isFactoryPresets: isFactoryPresets === "true",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Sauvegarder le JSON
        await writeJSON(presetPath, preset);

        res.status(201).json({
          message: "Preset created successfully with files",
          preset,
          filesCount: files.length,
        });
      } catch (err) {
        res.status(500).json({
          error: "Error creating preset",
          details: err.message,
        });
      }
    });

    bb.on('error', (err) => {
      res.status(400).json({
        error: "Error parsing request",
        details: err.message,
      });
    });

    // Pipe request to busboy
    req.pipe(bb);
  }
);

// ========== GESTION DES ERREURS ==========

/**
 * Middleware pour gérer les erreurs multer (upload)
 */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        maxSize: `${config.upload.maxFileSize / 1024 / 1024}MB`,
      });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "Too many files",
      });
    }
    return res.status(400).json({
      error: "Upload error",
      message: err.message,
    });
  }
  next(err);
});

/**
 * Middleware général pour les erreurs
 */
app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Erreur déjà envoyée
  if (res.headersSent) {
    return next(err);
  }

  // Erreur générique
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    ...(config.isDevelopment && { stack: err.stack }),
  });
});

/**
 * Route 404 pour les chemins non trouvés
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
  });
});

// ========== INITIALISATION ==========

/**
 * Initialise le serveur (crée les dossiers nécessaires)
 */
export async function initializeServer() {
  try {
    // Créer les dossiers s'ils n'existent pas
    await ensureDir(config.paths.public);
    await ensureDir(config.paths.data);

    console.log("✓ Server initialized");
    console.log(`  Public dir: ${config.paths.public}`);
    console.log(`  Data dir: ${config.paths.data}`);
  } catch (err) {
    console.error("Failed to initialize server:", err);
    throw err;
  }
}

export default app;
