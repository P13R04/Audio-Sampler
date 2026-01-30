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
   - [Répartition du travail](#répartition-du-travail)
   - [Déploiement](#déploiement)
   - [Améliorations possibles](#améliorations-possibles)
   - [Utilisation d'IA dans le projet](#utilisation-dia-dans-le-projet)
   - [Remerciements](#remerciements)
   - [License](#license)

---

## Fonctionnalités

### Sampler Frontend (Web Component)

**Fonctionnalités de base :**
- API backend pour gérer les sons et presets
- Séparation interface et moteur audio (mode headless possible)
- Menu de presets dynamique
- Chargement et affectation des sons sur 16 pads
- Lecture du son au clic + affichage de la forme d'onde
- Découpage audio par pad (début/fin)

**Fonctionnalités avancées :**
- Catégories de presets
- Mapping clavier QWERTY/AZERTY
- Support des contrôleurs MIDI (Web MIDI API)
- Enregistrement micro (MediaRecorder API)
- Découpage automatique sur silence
- Création d'instruments pitchés
- Intégration Freesound.org (recherche et pré-écoute)
- Sauvegarde des presets sur le serveur
- Architecture Web Component réutilisable
- Effets audio (volume, panoramique, reverse, pitch)
- Système de thèmes (clair/sombre)

### Backend API (Node.js + Express)

**Principaux points d'accès :**
- Voir l'état du serveur
- Lister, créer, modifier et supprimer des presets
- Envoyer des fichiers audio
- Les fichiers sont validés et stockés côté serveur

### Angular Admin App

**Interface d'administration :**
- Liste des presets avec recherche et filtres
- Création de presets (upload de fichiers et sélection de samples)
- Édition rapide (renommer, réorganiser)
- Suppression avec confirmation
- Pré-écoute audio
- Design responsive

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

1. **Charger des sons :** Sélectionner des fichiers audio à affecter aux pads
2. **Jouer :** Cliquer sur un pad ou utiliser le clavier (Q/W/E/R...)
3. **MIDI :** Connecter un contrôleur MIDI (détection automatique)
4. **Enregistrer :** Utiliser le micro pour enregistrer un son
5. **Presets :** Charger ou sauvegarder des configurations depuis le menu
// Drag & drop non disponible actuellement

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

### Frontend (interface d'administration)

| Package | Version | Usage |
|---------|---------|-------|
| Angular | 21.1.0 | Framework |
| TypeScript | 5.9.2 | Langage |
| RxJS | 7.8.0 | Programmation réactive |
| Bootstrap | 5.3.8 | Système de grille |

**Mode :** Composants autonomes
**Outil de build :** Webpack (via Angular CLI)

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

**Testing & QA :**
- Tests manuels complets
- Vérification responsive
- Tests multi-navigateurs
- Optimisation des performances

---

## Déploiement

### 🌐 Live Demo

L'application est déployée et accessible aux adresses suivantes:

- **🎹 Sampler**: [https://audio-sampler-pads.vercel.app](https://audio-sampler-pads.vercel.app)
  - Interface principale du sampler avec contrôle clavier
  - Lecture de presets avec AZERTY/QWERTY
  
- **⚙️ Admin Panel**: [https://audio-sampler-admin-app.vercel.app](https://audio-sampler-admin-app.vercel.app)
  - Gestion des presets et samples
  - Upload de fichiers audio
  - Édition de la bibliothèque de sons
  
- **🔌 Backend API**: [https://audio-sampler-x9kz.onrender.com](https://audio-sampler-x9kz.onrender.com)
  - API REST pour presets et samples
  - Upload et stockage de fichiers
  - CORS configuré pour les frontends

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
   CORS_ORIGINS=https://audio-sampler-admin-app.vercel.app,https://audio-sampler-pads.vercel.app
   ```

5. **Vérifier:**
   ```bash
   curl https://audio-sampler-x9kz.onrender.com/api/health
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

3. **Environment Configuration:**
   - `src/environments/environment.prod.ts` contient l'URL du backend Render
   - Build automatique avec `angular.json` fileReplacements
   - Vercel auto-déploie à chaque push sur GitHub

### Sampler (Vercel)

Le sampler principal est déployé à la racine du projet:

```bash
cd /
vercel --prod
```

Configuration dans `vercel.json`:
- Rewrites pour SPA routing
- Cache-Control headers
- Fichiers statiques (HTML/CSS/JS)

---

## Remerciements


---

## Améliorations possibles

- Ajouter des paramètres et effets globaux ou par pad
- Boîte à rythme / séquenceur (enregistreur de séquences)
- Stocker les URLs des sons dans une base MongoDB
- Authentification et gestion des rôles (presets personnels/publics, modération, validation/suppression)
- Tri des presets par nom, catégorie, etc.
- Améliorer l'ergonomie du sampler (simplifier l'interface, réduire le nombre de boutons)
- Tests d'accessibilité sur différentes plateformes et navigateurs

---

## Utilisation d'IA dans le projet

Ce projet a bénéficié de l'aide de l'intelligence artificielle via GitHub Copilot (autocomplétion et mode agent).

Copilot a été utilisé pour :
- Déboguer et corriger des bugs complexes
- Automatiser la génération de styles CSS
- Résoudre des problèmes d'architecture
- Nettoyer le projet et organiser les fichiers
- Rédiger et améliorer la documentation

L'IA a permis de gagner du temps et d'améliorer la qualité du code et de la documentation.

---

## Remerciements

Merci à **Michel Buffa** pour l'encadrement, les retours et les ressources pédagogiques tout au long du projet.

---

## License

MIT

---

**License:** MIT

Last updated: January 30, 2026

---
