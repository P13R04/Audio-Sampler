# Audio Sampler

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/Angular-21.x-red.svg)](https://angular.io/)

Sampler audio web professionnel avec interface Web Component, backend REST API et application d'administration Angular. Projet M1 Informatique 2025-2026.

**Auteurs:** Pierre Constantin, Oihane Fabbrini

---

## Table des Matières

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Technologies](#technologies)
- [Tests](#tests)
- [Répartition du Travail](#répartition-du-travail)
- [Déploiement](#déploiement)
- [Remerciements](#remerciements)

---

## Fonctionnalités

### Sampler Frontend (Web Component)

**Fonctionnalités de base:**
- Backend REST API avec CRUD complet
- Séparation GUI/Moteur audio (mode headless possible)
- Menu presets dynamique
- Chargement sons et affectation aux 8 pads
- Barre de progression animée
- Lecture son au clic + affichage waveform Canvas
- Trimming audio par pad (start/end)

**Fonctionnalités avancées:**
- Catégories de presets
- Mapping clavier QWERTY/AZERTY
- Support contrôleurs MIDI hardware (Web MIDI API)
- Enregistrement microphone avec MediaRecorder API
- Auto-split audio sur silence détecté
- Création instruments pitchés
- Intégration Freesound.org (recherche et préview)
- Sauvegarde presets serveur (multipart upload)
- Architecture Web Component réutilisable
- Effets audio (volume, pan, reverse, pitch)
- Système de thèmes (dark/light)
- Raccourcis clavier

### Backend API (Node.js + Express)

**Endpoints REST:**
```
GET    /api/health                    Health check
GET    /api/presets                   Lister tous les presets
GET    /api/presets/:name             Détail d'un preset
POST   /api/presets                   Créer preset (metadata)
POST   /api/presets/create-with-files Créer preset + upload fichiers
POST   /api/samples                   Upload sample standalone
PATCH  /api/presets/:name             Renommer/mettre à jour partiel
DELETE /api/presets/:name             Supprimer preset
```

**Caractéristiques:**
- Upload multipart avec Busboy (max 16 fichiers)
- Validation fichiers audio (format, taille)
- Slugification sécurisée des noms
- Support legacy pour noms avec espaces/caractères spéciaux
- CORS configuré
- Gestion complète des erreurs
- Tests automatisés (20/20 passing)

### Angular Admin App

**Pages et fonctionnalités:**
- Liste presets avec recherche et filtres
- Création preset (upload fichiers + sélection samples backend)
- Édition inline (rename, reorder samples)
- Suppression avec confirmation
- Préview audio HTML5
- Design system SCSS responsive
- Validation Reactive Forms
- TypeScript strict mode

---

## Architecture

### Séparation GUI/Engine

Le code du sampler respecte une séparation claire entre logique audio et présentation:

**Engine (soundutils.js):** Logique pure audio
- Pas de dépendances DOM
- Gestion Web Audio API
- Playback, effects, analysis
- Mode headless utilisable

**GUI (audio-sampler.js):** Contrôle interface
- Manipulation DOM et événements
- Mise à jour visuelle
- Coordination avec engine

Cette architecture permet de réutiliser l'engine dans différents contextes (Web Component, Angular, API, etc.).

### Structure Projet

```
Audio-Sampler/
├── backend/                      REST API Node.js/Express
│   ├── src/
│   │   ├── app.mjs              Routes et middleware
│   │   ├── config.mjs           Configuration centralisée
│   │   └── utils.mjs            Fonctions utilitaires
│   ├── tests/                   Tests Mocha/Chai
│   └── public/presets/          Stockage presets/samples
│
├── sampler-admin/               Angular admin app
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/            Services et modèles
│   │   │   ├── features/        Composants métier
│   │   │   └── shared/          Composants partagés
│   │   └── styles.scss          Design system
│   └── dist/                    Build production
│
├── js/                          Sampler frontend
│   ├── main.js                  Entry point
│   ├── audio-sampler.js         GUI controller
│   ├── soundutils.js            Audio engine
│   ├── midi-manager.js          Web MIDI API
│   ├── recorder.mjs             MediaRecorder
│   ├── preset-loader.js         Gestion presets
│   └── [autres modules]
│
├── css/                         Styles sampler
├── index.html                   Page sampler
└── package.json                 Scripts root
```

---

## Installation

### Prérequis

- Node.js 22.x ou supérieur
- npm 10.x ou supérieur
- Modern browser (Chrome, Firefox, Safari, Edge)

### Backend

```bash
cd backend
npm install
```

Créer un fichier `.env` (optionnel):
```
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:4200
MAX_FILE_SIZE=10
```

Variables d'environnement disponibles:
- `PORT`: Port serveur (défaut: 3000)
- `NODE_ENV`: `development` ou `production` (défaut: development)
- `CORS_ORIGINS`: Liste URLs autorisées (virgule-séparée)
- `MAX_FILE_SIZE`: Taille max fichiers en MB (défaut: 10)
- `PUBLIC_DIR`: Chemin dossier public (défaut: ./public)
- `DATA_DIR`: Chemin dossier presets (défaut: ./public/presets)

Démarrer:
```bash
npm start
```

Le serveur écoutera sur `http://localhost:3000`

### Angular Admin

```bash
cd sampler-admin
npm install
ng serve
```

Accès: `http://localhost:4200`

Pour la production:
```bash
ng build --configuration production
```

Le build sera dans `dist/sampler-admin/`

### Sampler Frontend

Ouvrir `index.html` dans un navigateur (servir via HTTP pour éviter les restrictions CORS).

Pour développement avec serveur local:
```bash
cd /
python3 -m http.server 8000
# Puis ouvrir http://localhost:8000/index.html
```

---

## Utilisation

### Sampler

1. **Charger samples:** Drag & drop fichiers audio sur pads ou utiliser le sélecteur fichier
2. **Jouer:** Clic souris sur pad ou clavier (Q/W/E/R/etc.)
3. **MIDI:** Connecter contrôleur MIDI (auto-détecte)
4. **Enregistrer:** Microphone → bouton Record → save WAV
5. **Preset:** Charger/sauvegarder depuis menu

### Admin Angular

1. **Liste presets:** `/presets` - voir tous les presets
2. **Créer preset:** `/presets/new` - formulaire complet
3. **Éditer:** Clic preset → inline editing
4. **Rechercher:** Barre de recherche avec filtres
5. **Supprimer:** Bouton delete (confirmation requise)

---

## Technologies

### Backend

| Package | Version | Usage |
|---------|---------|-------|
| Express | 4.18.2 | Web framework |
| Busboy | 1.4.2 | Multipart form data |
| Dotenv | 16.3.1 | Configuration |
| Slugify | 1.6.6 | URL-safe naming |

**Node.js:** 22.19.0  
**Runtime:** ESM modules (.mjs)

### Frontend Angular

| Package | Version | Usage |
|---------|---------|-------|
| Angular | 21.1.0 | Framework |
| TypeScript | 5.9.2 | Language |
| RxJS | 7.8.0 | Reactive |
| Bootstrap | 5.3.8 | Grid system |

**Mode:** Standalone components  
**Build tool:** Webpack (via Angular CLI)

### Frontend Sampler

| API | Purpose |
|-----|---------|
| Web Audio API | Audio processing |
| Web MIDI API | Hardware controllers |
| MediaRecorder API | Microphone recording |
| Canvas 2D | Waveform rendering |
| Web Components | Reusable UI |

---

## Tests

### Backend (Mocha + Chai)

```bash
cd backend
npm test
```

Résultats:
- 20 tests au total
- Coverage: ~80%
- Tous passants

Tests couvrent:
- Health checks
- CRUD operations (GET/POST/PUT/PATCH/DELETE)
- File upload (single, multiple, validation)
- Error handling

### Frontend

Tests manuels via navigateur:
1. Charger presets ✓
2. Upload fichiers ✓
3. Jouer samples ✓
4. Trimming audio ✓
5. Enregistrement micro ✓
6. MIDI detection ✓
7. Responsive design ✓
8. Dark/Light theme ✓

---

## Répartition du Travail

### Pierre Constantin

**Backend & Infrastructure:**
- Architecture REST API (Express + Busboy)
- Implémentation CRUD endpoints
- Validation fichiers audio
- Tests automatisés (Mocha/Chai)
- Configuration et déploiement (Render.com)
- Gestion variables d'environnement

**Frontend Features:**
- Web MIDI API integration
- MediaRecorder et audio split
- Trim audio avec waveform rendering
- Preset loader et manager
- API service (sampler)

**Documentation:**
- README technique
- Setup instructions
- Deployment guides

### Oihane Fabbrini

**Design System & UI:**
- SCSS design system (variables, mixins, breakpoints)
- Responsive layout (mobile/tablet/desktop)
- Component styles et animations
- Theme switcher (dark/light)

**Angular Admin App:**
- Standalone components architecture
- Preset list component avec filtres
- Preset create form (upload + backend samples)
- Preset detail et edit
- HttpClient services
- Reactive Forms validation

**Frontend Core:**
- Sampler GUI controller
- Event handling et interactions
- Keyboard support (QWERTY mapping)
- Modal system et toast notifications
- Freesound API integration (UI)
- Audio effects UI controls

**Testing & QA:**
- Tests manuels complets
- Responsive design verification
- Cross-browser testing
- Performance optimization

---

## Déploiement

### Backend (Render.com)

1. **Créer Web Service:**
   - GitHub repository
   - Branch: `main`
   - Root: `backend`

2. **Build Command:** `npm install`

3. **Start Command:** `node index.mjs`

4. **Environment Variables:**
   ```
   PORT=3000
   NODE_ENV=production
   CORS_ORIGINS=https://your-angular-app.vercel.app
   ```

5. **Vérifier:**
   ```bash
   curl https://your-backend.onrender.com/api/health
   ```

### Angular (Vercel)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Deploy:**
   ```bash
   cd sampler-admin
   vercel --prod
   ```

3. **Update Backend URL:**
   - Éditer `src/environments/environment.prod.ts`
   - Set `apiUrl` to Render backend URL
   - Rebuild: `npm run build && vercel --prod`

### Sampler (optionnel)

Peut être déployé sur:
- GitHub Pages
- Vercel
- Netlify
- Hosted statiquement sur serveur backend

---

## Remerciements

Merci à **Michel Buffa** pour l'encadrement, les retours et les ressources pédagogiques fournis tout au long du projet.

---

**License:** MIT

Last updated: January 30, 2026
