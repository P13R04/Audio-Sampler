# 🎯 Guide Web Component - Audio Sampler

## 📋 Table des matières

1. [Architecture actuelle](#architecture-actuelle)
2. [Tests et validation](#tests-et-validation)
3. [Stratégie d'ajout de fonctionnalités](#stratégie-dajout-de-fonctionnalités)
4. [Bonnes pratiques](#bonnes-pratiques)
5. [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture actuelle

### Deux modes de fonctionnement

Le projet Audio Sampler supporte **deux modes** :

#### 1. Mode Standalone (index.html)
```html
<!-- index.html -->
<script type="module" src="js/main.js"></script>
<!-- Le sampler s'initialise automatiquement -->
```

**Comportement :**
- `main.js` détecte qu'il n'est PAS dans un web component (`!window.__AUDIO_SAMPLER_EMBEDDED__`)
- Auto-initialisation avec `startSampler(document)` au chargement de la page
- Le sampler utilise le DOM principal directement

#### 2. Mode Web Component (<audio-sampler-app>)
```html
<!-- test-webcomponent.html ou toute page externe -->
<script type="module" src="js/sampler-component.js"></script>
<audio-sampler-app></audio-sampler-app>
```

**Comportement :**
1. Le web component crée un **Shadow DOM** isolé
2. Il définit `window.__AUDIO_SAMPLER_EMBEDDED__ = true`
3. Il construit la structure HTML nécessaire dans le shadow root
4. Il importe `main.js` dynamiquement
5. Il appelle `startSampler(shadowRoot)` avec son shadow root

### Fichiers concernés

```
js/
├── main.js                  # ⭐ Logique principale (fonctionne avec document OU shadowRoot)
├── sampler-component.js     # 🎯 Web Component <audio-sampler-app> (sampler complet)
├── audio-sampler.js         # 🎙️ Web Component <audio-sampler> (enregistrement seul)
└── [autres modules...]      # Modules utilitaires utilisés par main.js
```

### Détail du mécanisme

**sampler-component.js :**
```javascript
class AudioSamplerApp extends HTMLElement {
  connectedCallback() {
    // 1. Empêche l'auto-initialisation
    window.__AUDIO_SAMPLER_EMBEDDED__ = true;
    
    // 2. Crée le Shadow DOM avec la structure HTML
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="css/styles.css">
      <div id="topbar">...</div>
      <div id="buttonsContainer"></div>
      ...
    `;
    
    // 3. Importe main.js et démarre le sampler
    import('./main.js').then((mod) => {
      mod.startSampler(this.shadowRoot); // ← Passe le shadowRoot
    });
  }
}
```

**main.js :**
```javascript
export async function startSampler(root = document, options = {}) {
  // Helper pour chercher les éléments dans le root fourni
  const $id = (id) => (root instanceof Document 
    ? root.getElementById(id) 
    : root.querySelector('#' + id));
  
  // Récupère les éléments UI depuis le root (document OU shadowRoot)
  presetSelect = $id('presetSelect');
  buttonsContainer = $id('buttonsContainer');
  // ...
}

// Auto-démarrage SEULEMENT si pas en mode web component
if (!window.__AUDIO_SAMPLER_EMBEDDED__) {
  startSampler(document);
}
```

---

## 🧪 Tests et validation

### 1. Tester le mode standalone

```bash
# Terminal 1 : Lancer l'API
npm start

# Terminal 2 : Lancer le serveur HTTP
python3 -m http.server 8080

# Navigateur : Ouvrir
http://localhost:8080/index.html
```

**Vérifications :**
- ✅ Les presets se chargent
- ✅ Les pads sont cliquables et jouent des sons
- ✅ Le clavier fonctionne (touches affichées)
- ✅ La waveform s'affiche et le playhead se déplace
- ✅ Les thèmes changent
- ✅ Console : "🚀 Auto-starting sampler..."

### 2. Tester le mode web component

```bash
# Mêmes serveurs que ci-dessus

# Navigateur : Ouvrir
http://localhost:8080/test-webcomponent.html
```

**Vérifications :**
- ✅ Cliquer "Tester l'API" → succès
- ✅ Cliquer "Tester les modules" → tous verts
- ✅ Le composant affiche la même interface que index.html
- ✅ Cliquer "Tester l'API du composant" → tous les éléments trouvés
- ✅ Les pads fonctionnent comme en mode standalone
- ✅ Console : PAS de "🚀 Auto-starting sampler" (car `__AUDIO_SAMPLER_EMBEDDED__`)

### 3. Page de test interactive

Le fichier `test-webcomponent.html` fournit :
- 🔧 Tests automatiques de l'API et des modules
- 🎛️ Instance du web component
- 🧪 Checklist interactive des fonctionnalités
- 📊 Comparaison avec index.html
- 📝 Logs en temps réel

**Pour l'utiliser :**
```bash
open http://localhost:8080/test-webcomponent.html
```

### 4. Tester dans une page externe

Créer un fichier `demo-integration.html` :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <title>Démo d'intégration</title>
</head>
<body>
  <h1>Mon site avec le sampler intégré</h1>
  <p>Contenu de ma page...</p>
  
  <!-- Intégration du sampler -->
  <audio-sampler-app></audio-sampler-app>
  
  <script type="module" src="js/sampler-component.js"></script>
</body>
</html>
```

---

## 🚀 Stratégie d'ajout de fonctionnalités

### Règle d'or

**Pour qu'une fonctionnalité fonctionne dans les DEUX modes, elle doit :**

1. ✅ **Être implémentée dans `main.js`** (ou un module importé par main.js)
2. ✅ **Utiliser le paramètre `root`** au lieu de `document` directement
3. ✅ **Utiliser `$id()` ou `root.querySelector()`** pour récupérer les éléments
4. ✅ **Être testée dans les deux modes**

### Exemple : Ajouter un bouton "Export preset"

#### ❌ MAUVAISE approche (ne marche qu'en standalone)

```javascript
// Dans main.js
function addExportButton() {
  const topbar = document.getElementById('topbar'); // ← BUG : hardcodé
  const btn = document.createElement('button');
  btn.textContent = 'Exporter';
  topbar.appendChild(btn);
}
```

**Problème :** En mode web component, `document.getElementById('topbar')` retourne `null` car la topbar est dans le Shadow DOM.

#### ✅ BONNE approche (marche partout)

```javascript
// Dans main.js, à l'intérieur de startSampler()
export async function startSampler(root = document, options = {}) {
  const $id = (id) => (root instanceof Document 
    ? root.getElementById(id) 
    : root.querySelector('#' + id));
  
  // ... code existant ...
  
  function addExportButton() {
    const topbar = $id('topbar'); // ← CORRECT : utilise le root
    if (!topbar) return;
    
    const btn = document.createElement('button');
    btn.textContent = 'Exporter';
    btn.classList.add('control-btn');
    btn.addEventListener('click', () => {
      exportCurrentPreset(presets[currentPresetIndex]);
    });
    topbar.appendChild(btn);
  }
  
  addExportButton();
}
```

### Checklist pour une nouvelle fonctionnalité

- [ ] La fonction est définie dans `main.js` ou un module importé
- [ ] Aucun appel direct à `document.getElementById()` / `document.querySelector()`
- [ ] Utilisation de `$id()` ou `root.querySelector()` à la place
- [ ] Si création d'éléments DOM : utilisation de `document.createElement()` (OK)
- [ ] Si ajout au DOM : utilisation d'un élément récupéré via `$id()`
- [ ] Testée dans `index.html` (mode standalone)
- [ ] Testée dans `test-webcomponent.html` (mode web component)
- [ ] Logs console vérifiés dans les deux modes

### Exemples de modifications communes

#### 1. Ajouter un élément UI

```javascript
// À l'intérieur de startSampler()
const container = $id('buttonsContainer');
const newDiv = document.createElement('div');
newDiv.textContent = 'Nouvel élément';
container.appendChild(newDiv); // ✅ OK
```

#### 2. Écouter un événement global

```javascript
// Si besoin d'écouter sur window
window.addEventListener('keydown', (e) => {
  // ✅ OK : window est global dans les deux modes
});

// Si besoin d'écouter sur document
// ❌ PAS BON : document.addEventListener()
// ✅ BON :
root.addEventListener('click', (e) => { /* ... */ });
// OU si root est shadowRoot, écouter sur ses éléments enfants
```

#### 3. Modifier les styles

```javascript
// ❌ PAS BON
document.documentElement.style.setProperty('--color', '#fff');

// ✅ BON
const targetRoot = (root instanceof Document) ? root.documentElement : root.host;
targetRoot.style.setProperty('--color', '#fff');
```

**Note :** Les CSS variables sont déjà gérées par `theme-manager.js` qui utilise `targetRoot`.

#### 4. Accéder à un module externe

```javascript
// ✅ OK : Les imports fonctionnent dans les deux modes
import { myFunction } from './my-module.js';

// Utilisation normale
myFunction();
```

### Structure d'un nouveau module

Si tu crées un nouveau module `js/my-feature.js` :

```javascript
/* ---------------------------------------------------------------------------
  my-feature.js
  Description du module
  --------------------------------------------------------------------------- */

/**
 * Fonction qui nécessite des éléments DOM
 * @param {Object} context - Contexte contenant les éléments et états
 */
export function myFeature(context) {
  const { root, presets, showStatus } = context;
  
  // Helper pour récupérer des éléments
  const $id = (id) => (root instanceof Document 
    ? root.getElementById(id) 
    : root.querySelector('#' + id));
  
  const container = $id('buttonsContainer');
  if (!container) return;
  
  // Ta logique ici...
  showStatus('Feature activée !');
}
```

**Utilisation dans main.js :**

```javascript
import { myFeature } from './my-feature.js';

export async function startSampler(root = document, options = {}) {
  // ...
  
  myFeature({ 
    root, 
    presets, 
    showStatus,
    // autres dépendances...
  });
}
```

---

## 📚 Bonnes pratiques

### 1. Toujours passer le contexte

Au lieu de variables globales, passe un objet de contexte :

```javascript
// ❌ Moins bien
function myFunc() {
  const el = document.getElementById('foo'); // Hardcodé
  doSomething(presets); // Variable globale
}

// ✅ Mieux
function myFunc(context) {
  const { root, presets } = context;
  const $id = (id) => root instanceof Document 
    ? root.getElementById(id) 
    : root.querySelector('#' + id);
  const el = $id('foo');
  doSomething(presets);
}
```

### 2. Tester régulièrement les deux modes

Après chaque modification importante :

```bash
# Test standalone
open http://localhost:8080/index.html

# Test web component
open http://localhost:8080/test-webcomponent.html
```

### 3. Utiliser les DevTools pour déboguer

**En mode web component :**
1. Ouvrir les DevTools
2. Onglet "Elements"
3. Chercher `<audio-sampler-app>`
4. Cliquer sur "#shadow-root (open)"
5. Inspecter la structure interne

**Console logs :**
```javascript
// Pour différencier les modes
console.log('Mode:', window.__AUDIO_SAMPLER_EMBEDDED__ ? 'Web Component' : 'Standalone');
```

### 4. Gérer les ressources externes

**CSS :**
```html
<!-- Dans sampler-component.js -->
this.shadowRoot.innerHTML = `
  <link rel="stylesheet" href="css/styles.css">
  <!-- Les styles sont chargés dans le Shadow DOM -->
`;
```

**Images/Audio :**
```javascript
// ✅ OK : Les chemins relatifs fonctionnent
const url = 'presets/808/Kick.wav';
fetch(url); // Marche dans les deux modes
```

### 5. Documentation du code

Documente les fonctions qui dépendent du root :

```javascript
/**
 * Charge un preset
 * @param {number} idx - Index du preset
 * @note Cette fonction utilise le root défini dans startSampler()
 * @note Compatible mode standalone et web component
 */
async function loadPresetByIndex(idx) {
  // ...
}
```

---

## 🐛 Troubleshooting

### Problème 1 : "Element not found" en mode web component

**Symptôme :**
```javascript
const el = document.getElementById('topbar');
console.log(el); // null en mode web component
```

**Cause :** L'élément est dans le Shadow DOM, pas dans `document`.

**Solution :**
```javascript
const el = $id('topbar'); // Utilise le helper qui connaît le root
```

### Problème 2 : Styles CSS non appliqués

**Symptôme :** En mode web component, les styles globaux ne s'appliquent pas.

**Cause :** Le Shadow DOM est isolé.

**Solution :** Importer les styles dans le shadow root :
```javascript
this.shadowRoot.innerHTML = `
  <link rel="stylesheet" href="css/styles.css">
  ...
`;
```

### Problème 3 : Événements clavier ne fonctionnent pas

**Symptôme :** Les touches du clavier ne déclenchent pas les pads en mode web component.

**Cause :** Les événements clavier sur `window` fonctionnent, mais vérifier que `keyboardManager` est bien initialisé.

**Solution :** Le code actuel écoute sur `window`, donc ça devrait marcher. Vérifier la console pour des erreurs.

### Problème 4 : Deux instances du sampler se lancent

**Symptôme :** En mode web component, le sampler se lance deux fois.

**Cause :** Le flag `__AUDIO_SAMPLER_EMBEDDED__` n'est pas défini assez tôt.

**Solution :** Dans `sampler-component.js`, définir le flag **avant** d'importer main.js :
```javascript
connectedCallback() {
  window.__AUDIO_SAMPLER_EMBEDDED__ = true; // ← Avant import
  import('./main.js').then(/* ... */);
}
```

### Problème 5 : API CORS en mode web component

**Symptôme :** Erreurs CORS lors du fetch des presets.

**Cause :** Même origine requise ou mauvaise config serveur.

**Solution :**
1. Servir la page de test depuis le même serveur que l'API
2. Ou configurer CORS dans `ExampleRESTEndpointCorrige/index.mjs` (déjà fait normalement)

### Problème 6 : Variables CSS ne se propagent pas

**Symptôme :** Les thèmes ne changent pas les couleurs en mode web component.

**Cause :** Les CSS variables doivent être définies sur le host du shadow root.

**Solution :** Le `theme-manager.js` gère déjà ça :
```javascript
const targetRoot = (root instanceof Document) 
  ? root.documentElement 
  : root.host; // ← Applique sur le host du shadow
```

---

## 🎓 Résumé

### Pour que tout fonctionne dans les deux modes :

1. ✅ **Coder dans `main.js`** ou ses modules
2. ✅ **Utiliser `root` au lieu de `document`**
3. ✅ **Utiliser `$id()` pour récupérer les éléments**
4. ✅ **Tester les deux modes** (`index.html` + `test-webcomponent.html`)
5. ✅ **Importer `css/styles.css`** dans le shadow root
6. ✅ **Passer le contexte** aux fonctions (root, presets, etc.)

### Architecture finale

```
Mode Standalone              Mode Web Component
─────────────────           ──────────────────────────
index.html                   test-webcomponent.html
  │                            │
  ├─ main.js (auto-init)       ├─ sampler-component.js
  │   └─ startSampler(          │   └─ Shadow DOM
  │      document)              │       └─ main.js (import)
  │                              │           └─ startSampler(
  ├─ audio-sampler.js            │              shadowRoot)
  └─ modules                     │
                                 └─ audio-sampler.js
```

### Commandes utiles

```bash
# Lancer l'API
npm start

# Serveur HTTP (choisir l'un des deux)
python3 -m http.server 8080
# OU
npx http-server -p 8080

# Tester mode standalone
open http://localhost:8080/index.html

# Tester web component
open http://localhost:8080/test-webcomponent.html
```

---

**Dernière mise à jour :** 17 novembre 2025  
**Version :** Refactored (v2.0)
