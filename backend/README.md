# Audio Sampler Backend

Backend Node.js/Express pour l'application Audio Sampler. Fournit une API REST complète pour la gestion des presets audio avec support de l'upload de fichiers.

## 🚀 Fonctionnalités

- ✅ **API REST CRUD** complète pour les presets
- ✅ **Upload de fichiers** multipart (multer)
- ✅ **Validation** des données et fichiers
- ✅ **Filtres de recherche** (par nom, type, factory)
- ✅ **Tests automatisés** (Node.js test runner)
- ✅ **CORS** configuré pour développement/production
- ✅ **Hot reload** en développement (--watch)
- ✅ **Prêt pour le cloud** (MongoDB, Render.com)

## 📋 Prérequis

- Node.js >= 18.0.0
- npm ou yarn

## 🛠️ Installation

```bash
# Depuis le dossier backend/
npm install

# Copier le fichier d'environnement
cp .env.example .env

# (Optionnel) Modifier .env selon vos besoins
```

## 🏃 Lancement

### Développement (avec hot reload)
```bash
npm run dev
```

Le serveur démarre sur `http://localhost:3000`

### Production
```bash
npm start
```

### Tests
```bash
# Lancer tous les tests
npm test

# Tests en mode watch
npm run test:watch
```

## 📡 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Routes

#### Health Check
```http
GET /api/health
```
Vérifie que le serveur fonctionne.

**Réponse:**
```json
{
  "ok": true,
  "timestamp": "2026-01-20T10:30:00.000Z",
  "env": "development",
  "uptime": 123.45
}
```

---

#### Liste des Presets
```http
GET /api/presets
```

**Query Parameters:**
- `q` (string): Recherche textuelle dans nom et samples
- `type` (string): Filtre par type (drums, piano, etc.)
- `factory` (boolean): Filtre presets factory (true/false)

**Exemples:**
```bash
# Tous les presets
curl http://localhost:3000/api/presets

# Recherche "kick"
curl http://localhost:3000/api/presets?q=kick

# Seulement type drums
curl http://localhost:3000/api/presets?type=drums

# Presets factory uniquement
curl http://localhost:3000/api/presets?factory=true
```

**Réponse:**
```json
[
  {
    "name": "808 Drums",
    "type": "drums",
    "samples": [
      {
        "name": "Kick",
        "url": "/presets/808/kick.wav",
        "index": 0
      }
    ],
    "isFactoryPresets": true,
    "createdAt": "2026-01-20T10:00:00.000Z",
    "updatedAt": "2026-01-20T10:00:00.000Z"
  }
]
```

---

#### Récupérer un Preset
```http
GET /api/presets/:name
```

**Paramètres:**
- `name`: Nom ou slug du preset (avec ou sans .json)

**Exemples:**
```bash
curl http://localhost:3000/api/presets/808
curl http://localhost:3000/api/presets/basic-kit
```

**Réponse 200:**
```json
{
  "name": "808 Drums",
  "type": "drums",
  "samples": [...]
}
```

**Réponse 404:**
```json
{
  "error": "Preset not found",
  "name": "non-existent"
}
```

---

#### Créer un Preset
```http
POST /api/presets
Content-Type: application/json
```

**Body:**
```json
{
  "name": "My New Preset",
  "type": "drums",
  "samples": [
    {
      "name": "Kick",
      "url": "/presets/my-preset/kick.wav"
    },
    {
      "name": "Snare",
      "url": "/presets/my-preset/snare.wav"
    }
  ],
  "isFactoryPresets": false
}
```

**Réponse 201:**
```json
{
  "message": "Preset created successfully",
  "preset": { ... },
  "slug": "my-new-preset"
}
```

**Réponse 400:** Données invalides
**Réponse 409:** Preset existe déjà

---

#### Mettre à Jour un Preset (complet)
```http
PUT /api/presets/:name
Content-Type: application/json
```

Remplace entièrement le preset.

---

#### Mettre à Jour un Preset (partiel)
```http
PATCH /api/presets/:name
Content-Type: application/json
```

**Body (exemple - renommer):**
```json
{
  "name": "New Name"
}
```

**Réponse 200:**
```json
{
  "message": "Preset renamed successfully",
  "preset": { ... },
  "oldSlug": "old-name",
  "newSlug": "new-name"
}
```

Le fichier JSON et le dossier de samples sont automatiquement renommés.

---

#### Supprimer un Preset
```http
DELETE /api/presets/:name
```

Supprime le fichier JSON et le dossier de samples associé.

**Réponse 200:**
```json
{
  "message": "Preset deleted successfully",
  "name": "Deleted Preset"
}
```

---

#### Upload de Fichiers Audio
```http
POST /api/presets/:folder/upload
Content-Type: multipart/form-data
```

Upload des fichiers audio dans un dossier de preset.

**Form Data:**
- `files`: Un ou plusieurs fichiers audio (max 20)

**Exemple avec JavaScript:**
```javascript
const formData = new FormData();
formData.append('files', file1);
formData.append('files', file2);

fetch('/api/presets/my-preset/upload', {
  method: 'POST',
  body: formData
});
```

**Réponse 201:**
```json
{
  "message": "Files uploaded successfully",
  "count": 2,
  "files": [
    {
      "filename": "kick.wav",
      "originalName": "kick.wav",
      "size": 123456,
      "mimetype": "audio/wav",
      "url": "/presets/my-preset/kick.wav"
    }
  ],
  "folder": "my-preset"
}
```

---

#### Créer un Preset avec Upload
```http
POST /api/presets/create-with-files
Content-Type: multipart/form-data
```

Crée un preset complet avec upload de fichiers en une seule requête.

**Form Data:**
- `name` (required): Nom du preset
- `type` (optional): Type (drums, piano, etc.)
- `isFactoryPresets` (optional): "true" ou "false"
- `files` (required): Fichiers audio (max 20)

**Exemple:**
```javascript
const formData = new FormData();
formData.append('name', 'My Uploaded Preset');
formData.append('type', 'drums');
formData.append('files', kickFile);
formData.append('files', snareFile);

fetch('/api/presets/create-with-files', {
  method: 'POST',
  body: formData
});
```

**Réponse 201:**
```json
{
  "message": "Preset created successfully with files",
  "preset": {
    "name": "My Uploaded Preset",
    "type": "drums",
    "samples": [
      { "name": "kick", "url": "/presets/my-uploaded-preset/kick.wav", "index": 0 },
      { "name": "snare", "url": "/presets/my-uploaded-preset/snare.wav", "index": 1 }
    ],
    "isFactoryPresets": false,
    "createdAt": "...",
    "updatedAt": "..."
  },
  "filesCount": 2
}
```

---

## 📁 Structure des Fichiers

```
backend/
├── src/
│   ├── app.mjs           # Application Express + routes
│   ├── config.mjs        # Configuration centralisée
│   └── utils.mjs         # Fonctions utilitaires
├── public/               # Fichiers statiques
│   └── presets/          # Dossier des presets
│       ├── 808.json
│       ├── 808/          # Samples du preset 808
│       │   ├── kick.wav
│       │   └── snare.wav
│       └── basic-kit.json
├── tests/
│   ├── 01-health.test.mjs
│   ├── 02-crud.test.mjs
│   └── 03-upload.test.mjs
├── index.mjs             # Point d'entrée
├── package.json
├── .env                  # Configuration locale (gitignored)
└── .env.example          # Template de configuration
```

## ⚙️ Configuration (.env)

```bash
# Port du serveur
PORT=3000

# Chemins (optionnels - valeurs par défaut fonctionnent)
PUBLIC_DIR=./public
DATA_DIR=./public/presets

# Environnement
NODE_ENV=development

# CORS (production)
CORS_ORIGINS=https://mon-domaine.com,https://www.mon-domaine.com

# Limite upload (MB)
MAX_FILE_SIZE=10

# Base de données (optionnel - pour future migration)
# DB_URL=mongodb+srv://user:pass@cluster.mongodb.net/audio-sampler
# DB_NAME=audio-sampler
```

## 🧪 Tests

Les tests utilisent le test runner intégré de Node.js (>= 18).

```bash
# Tous les tests
npm test

# Watch mode
npm run test:watch

# Test spécifique
node --test tests/01-health.test.mjs
```

**⚠️ Important:** Le serveur doit tourner pendant les tests:
```bash
# Terminal 1
npm run dev

# Terminal 2
npm test
```

## 🔒 Sécurité

- ✅ Validation des uploads (extensions, MIME types, taille)
- ✅ Protection path traversal (normalize paths)
- ✅ CORS configuré selon environnement
- ✅ Limite taille body JSON (2MB)
- ✅ Limite nombre fichiers upload (20)
- ✅ Limite taille fichiers (10MB par défaut)

## 🚀 Déploiement

### Render.com (Recommandé)

1. Créer un compte sur [render.com](https://render.com)
2. Créer un nouveau Web Service
3. Connecter votre repo GitHub
4. Configuration:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node 18+
5. Variables d'environnement:
   ```
   NODE_ENV=production
   PORT=10000
   CORS_ORIGINS=https://votre-frontend.netlify.app
   ```

### Autres plateformes

- **Heroku:** Procfile inclus
- **Railway:** Configuration auto-détectée
- **Fly.io:** flyctl launch

## 🗄️ Migration MongoDB (Optionnel)

Pour utiliser MongoDB Atlas au lieu du filesystem:

1. Créer un cluster sur [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Obtenir l'URL de connexion
3. Ajouter dans `.env`:
   ```bash
   DB_URL=mongodb+srv://user:password@cluster.mongodb.net/audio-sampler
   DB_NAME=audio-sampler
   ```
4. Créer `src/database.mjs` (à implémenter)
5. Adapter les routes pour utiliser MongoDB

## 📝 TODO / Améliorations Futures

- [ ] Implémenter MongoDB comme storage optionnel
- [ ] Ajouter pagination pour liste presets
- [ ] Implémenter authentification (JWT)
- [ ] Ajouter rate limiting
- [ ] Swagger/OpenAPI documentation
- [ ] Compression des responses (gzip)
- [ ] Caching (Redis optionnel)
- [ ] Webhooks pour notifications
- [ ] Support AWS S3 pour fichiers audio
- [ ] CI/CD avec GitHub Actions

## 🤝 Contribution

Ce projet fait partie d'un exercice académique M1 Info 2025-2026.

**Membres de l'équipe:**
- [Nom 1] - [Responsabilités]
- [Nom 2] - [Responsabilités]

**Utilisation de l'IA:**
- Structure backend générée avec assistance GitHub Copilot
- Routes CRUD inspirées de ExampleRESTEndpointCorrige
- Tests automatisés créés avec assistance IA

## 📄 Licence

MIT

## 🆘 Support

En cas de problème:
1. Vérifier que Node.js >= 18 est installé
2. Vérifier que les dépendances sont installées (`npm install`)
3. Vérifier que le port 3000 est libre
4. Consulter les logs du serveur
5. Lancer les tests pour diagnostiquer

---

**🎵 Happy coding!**
