# 🎵 Audio Sampler

**Auteurs** : Pierre Constantin — Oihane Fabbrini

---

## Audit rapide — 19 novembre 2025

- État général : code stable, pas de vulnérabilités critiques détectées.
- Corrections appliquées :
    - Remplacement des usages `innerHTML` non sûrs (ex: `storage-manager`) par construction DOM sûre.
    - Centralisation du tracking des `blob:` URLs via `js/blob-utils.js` (création/revocation/revokeAll).
    - Adaptation du gestionnaire de modals pour monter les panneaux dans un `ShadowRoot` quand fourni, avec copie conservative des variables CSS (héritage visuel sans polluer le document global).
    - Ajustement thème `morning-light` (contraste texte) et divers commentaires/documentation en français.
    - Note d'amélioration ajoutée : `js/keyboard-manager.js` propose l'option future `evt.code`/`destroy()` comme amélioration non intrusive.
- Risques résiduels (mineurs) : UI (trim bars) et petites fuites visuelles possibles si le thème n'est pas appliqué au moment du montage — documenté et non bloquant.

Ces changements visent la maintenabilité et la sécurité client (prévenir XSS et fuites d'object URLs). Voir `README_TECHNIQUE.md` pour la documentation détaillée.


## 📋 Description

Sampler audio web interactif avec grille 4×4 de pads, enregistrement de samples, éditeur de waveform et architecture modulaire. Utilisable en mode standalone (page complète) ou en Web Component intégrable.

---

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+
- npm
- Navigateur moderne (Chrome/Edge/Firefox)

### Installation

**1. Lancer le serveur API** :
```bash
npm install
npm start
```
Le serveur écoute sur `http://localhost:3000`

**2. Ouvrir l'interface** :

**Option A** : Live Server (VS Code)
- Installer l'extension Live Server
- Clic droit sur `index.html` → "Open with Live Server"

**Option B** : Python
```bash
python3 -m http.server 8080
# Ouvrir http://localhost:8080
```

**Option C** : Mode Web Component
```bash
python3 -m http.server 8080
# Ouvrir http://localhost:8080/demo-integration.html
```

---

## ✨ Fonctionnalités principales

### Interface
- ✅ **Grille 4×4 de pads** (16 samples max par preset)
- ✅ **Mapping clavier** QWERTY/AZERTY
- ✅ **Waveform interactive** avec trim bars
- ✅ **Playhead animé** pendant la lecture
- ✅ **4 thèmes visuels** (purple-neon, midnight-blue, retro-sunset, forest-emerald)

### Presets
- ✅ **5 presets inclus** : 808, basic-kit, electronic, hip-hop, steveland-vinyl
- ✅ **Chargement dynamique** via API REST

### Enregistrement
- ✅ **Capture micro** (Web Audio + MediaRecorder)
- ✅ **Sauvegarde IndexedDB** (format WAV)
- ✅ **Créer instrument 16 notes** (pitch par demi-tons)
- ✅ **Split on silence** (découpage automatique)

---

## 🎮 Utilisation

### Jouer des samples
1. Sélectionner un preset
2. Cliquer sur un pad ou utiliser le clavier
3. Ajuster les trim bars pour sélectionner une portion

### Enregistrer un sample
1. Cliquer "+ Ajouter son"
2. Autoriser le micro
3. Enregistrer → Stop → Sauvegarder

### Créer un instrument
1. Enregistrer un sample
2. "Créer preset" → "Créer instrument 16 notes"
3. Le sample est pitché sur 16 demi-tons

---

## 🎯 Modes d'utilisation

### Mode Standalone
```html
<script type="module" src="js/main.js"></script>
```

### Mode Web Component
```html
<script type="module" src="js/sampler-component.js"></script>
<audio-sampler-app></audio-sampler-app>
```

**Pages de démonstration** :
- `index.html` - Interface complète
- `demo-integration.html` - Exemple d'intégration
- `test-webcomponent.html` - Tests interactifs

📖 **Guide complet** : [WEB_COMPONENT_GUIDE.md](WEB_COMPONENT_GUIDE.md)

---

## 📂 Structure du projet

```
Audio-Sampler/
├── index.html              # Interface principale
├── css/styles.css          # Styles et thèmes
├── js/
│   ├── main.js            # Orchestrateur (929 lignes)
│   ├── presets-manager.js # Gestion API
│   ├── theme-manager.js   # 4 thèmes visuels
│   ├── waveform-renderer.js # Rendu waveform
│   ├── keyboard-manager.js  # Layouts clavier
│   ├── instrument-creator.js # Instruments 16 notes
│   ├── recorder.mjs       # Enregistrement
│   └── audio-sampler.js   # Web Component
└── ExampleRESTEndpointCorrige/
    ├── index.mjs          # Serveur Express
    └── public/presets/    # Fichiers audio
```

**Architecture refactorisée** :
- **Avant** : 1878 lignes monolithiques
- **Après** : 929 lignes + 7 modules
- **Réduction** : **-50%** dans le fichier principal

📖 **Documentation technique complète** : [README_TECHNIQUE.md](README_TECHNIQUE.md)

---

## 🔌 API REST

| Endpoint | Description |
|----------|-------------|
| GET `/api/health` | État du serveur |
| GET `/api/presets` | Liste des presets |
| GET `/presets/<file>` | Fichier audio |

---

## 🎨 Personnalisation

### Ajouter un preset
```bash
mkdir ExampleRESTEndpointCorrige/public/presets/mon-preset
# Ajouter les fichiers .wav
```

### Changer un thème
Éditer `js/theme-manager.js`, section `themes`

---

## ⚠️ Problèmes connus

- Trim bars peuvent se chevaucher si déplacées rapidement
- Sample répété si touche clavier maintenue
- Ralentissement visuel avec beaucoup de samples simultanés

Voir [README_TECHNIQUE.md](README_TECHNIQUE.md) pour détails et solutions.

---

## 🔧 Points d'amélioration

### Court terme
- Corriger bugs trim bars et focus clavier
- Ajouter tests automatisés
- Extraire création de modaux

### Moyen terme
- Export/import presets JSON
- Undo/Redo pour les trims
- Gestion d'erreurs robuste

### Long terme
- Effets audio (reverb, delay, EQ)
- Séquenceur pour patterns
- Mode collaboratif (WebRTC)

---

## 📚 Documentation

- 📖 [README_TECHNIQUE.md](README_TECHNIQUE.md) - Architecture détaillée, API des modules
- 📖 [WEB_COMPONENT_GUIDE.md](WEB_COMPONENT_GUIDE.md) - Guide d'intégration web component
- 📖 [TEST_ENREGISTREMENT.md](TEST_ENREGISTREMENT.md) - Checklist tests enregistrement

---

## 🆘 Support

**Problèmes courants** :
- **API non accessible** : Vérifier que le serveur tourne sur port 3000
- **Enregistrement ne marche pas** : Autoriser le micro dans le navigateur
- **Erreur CORS** : Servir le front depuis le même origin que l'API

**DevTools** : Console → Network → vérifier les requêtes