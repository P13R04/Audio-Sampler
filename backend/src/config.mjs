// src/config.mjs - Configuration centralisée du serveur
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// Charger les variables d'environnement depuis .env
dotenv.config();

// Résolution des chemins pour ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration du serveur
 */
export const config = {
  // Port du serveur
  port: parseInt(process.env.PORT || "3000", 10),

  // Environnement
  env: process.env.NODE_ENV || "development",
  isDevelopment: process.env.NODE_ENV !== "production",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",

  // Chemins des fichiers
  paths: {
    // Dossier public (fichiers statiques)
    public: process.env.PUBLIC_DIR
      ? path.resolve(process.env.PUBLIC_DIR)
      : path.resolve(__dirname, "../public"),

    // Dossier des presets (JSON + fichiers audio)
    data: process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.resolve(__dirname, "../public/presets"),
  },

  // CORS
  cors: {
    // En développement: autoriser localhost
    // En production: utiliser CORS_ORIGINS depuis .env
    origins: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",")
      : [],
    
    // Fonction pour valider l'origin
    validateOrigin: (origin) => {
      // Pas d'origin = requête non-browser (curl, Postman, etc.)
      if (!origin) return true;

      // En développement: autoriser localhost et 127.0.0.1
      if (process.env.NODE_ENV !== "production") {
        return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
      }

      // En production: vérifier liste CORS_ORIGINS
      const allowedOrigins = process.env.CORS_ORIGINS?.split(",") || [];
      return allowedOrigins.includes(origin);
    },
  },

  // Upload de fichiers
  upload: {
    // Taille max par fichier (en bytes)
    maxFileSize: (parseInt(process.env.MAX_FILE_SIZE, 10) || 10) * 1024 * 1024, // 10MB par défaut
    
    // Extensions autorisées
    allowedExtensions: [".wav", ".mp3", ".ogg", ".m4a", ".flac"],
    
    // Types MIME autorisés
    allowedMimeTypes: [
      "audio/wav",
      "audio/wave",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/ogg",
      "audio/x-m4a",
      "audio/flac",
    ],
  },

  // Base de données (optionnel - pour future migration MongoDB)
  database: {
    url: process.env.DB_URL || null,
    name: process.env.DB_NAME || "audio-sampler",
    useDatabase: Boolean(process.env.DB_URL),
  },
};

export default config;
