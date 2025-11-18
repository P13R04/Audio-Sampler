# 📚 Audio Sampler - Documentation Technique

**Auteurs**: Pierre Constantin — Oihane Fabbrini

---

## 📂 Architecture détaillée du projet

### Structure refactorisée (modulaire)

```
Audio-Sampler/
├── index.html              # Interface principale
├── demo-integration.html   # Exemple intégration web component
├── test-webcomponent.html  # Tests interactifs du composant
├── css/
│   └── styles.css          # Styles et thèmes (4 thèmes disponibles)
├── js/
│   ├── main.js             # 🎯 Orchestrateur principal (929 lignes)
│   │
│   ├── ── Modules utilitaires ──
│   ├── presets-manager.js      # Gestion API presets (fetch, normalisation)
│   ├── theme-manager.js        # 4 thèmes visuels (purple-neon, midnight-blue, etc.)
│   ├── ui-helpers.js           # Helpers UI (status, erreurs, mise à jour affichage)
│   ├── keyboard-manager.js     # Layouts clavier QWERTY/AZERTY + binding
│   ├── waveform-renderer.js    # Rendu waveform + trim bars + playhead animé
│   ├── instrument-creator.js   # Création instruments 16 notes + split on silence
│   │
│   ├── ── Utilitaires de base ──
│   ├── soundutils.js           # loadAndDecodeSound(), playSound()
│   ├── trimbarsdrawer.js       # Classe TrimbarsDrawer (drag & drop)
│   ├── utils.js                # formatTime(), pixelToSeconds(), etc.
│   ├── recorder.mjs            # Enregistrement micro + IndexedDB
│   ├── audio-sampler.js        # Web Component <audio-sampler> (enregistrement)
│   └── sampler-component.js    # Web Component <audio-sampler-app> (wrapper complet)
│
└── ExampleRESTEndpointCorrige/
    ├── index.mjs           # Serveur Express
    ├── public/
    │   ├── presets/        # Fichiers audio statiques
    │   │   ├── 808/
    │   │   ├── hip-hop/
    │   │   ├── electronic/
    │   │   └── ...
    │   └── index.html      # (optionnel, copie du front)
    └── tests/              # Tests API
```

### Métriques de qualité du code

- **Avant refactoring** : `main.js` monolithique de 1878 lignes
- **Après refactoring** : `main.js` de 929 lignes + 7 modules dédiés
- **Réduction** : **-50%** de code dans le fichier principal
- **Score maintenabilité** : **7/10** (bon, avec marge d'amélioration)
- **Dead code supprimé** : 302 lignes (samples-manager.js non utilisé)

---

## 🧩 Modules JavaScript (documentation complète)

### `presets-manager.js` (113 lignes)

**Responsabilité** : Gestion des presets (API, normalisation, UI)

**Fonctions principales** :
- `fetchPresets(url)` : Récupération API avec gestion d'erreurs
- `normalizePresets(raw, apiBase)` : Normalisation des URLs relatives/absolues
- `fillPresetSelect(select, presets)` : Remplissage dropdown avec gestion CORS
- `extractFileName(url)` : Extraction nom de fichier depuis URL
- `blobToDataURL(blob)` : Conversion Blob → Data URL

**Dépendances** : Aucune

**Utilisé par** : `main.js`

---

### `theme-manager.js` (170 lignes)

**Responsabilité** : Gestion des thèmes visuels

**Thèmes disponibles** :
1. `purple-neon` (défaut) - Violet néon avec cyan
2. `midnight-blue` - Bleu nuit avec orange
3. `retro-sunset` - Rose/orange rétro
4. `forest-emerald` - Vert émeraude

**Fonctions principales** :
- `applyTheme(name, root, context)` : Application thème avec CSS variables
- `setupThemeSelect(select, root, options, context)` : Configuration UI thème
- Événement `sampler-theme-changed` : Émis lors du changement de thème

**Variables CSS gérées** :
```css
--bg-color, --secondary-bg, --accent-color, --text-color,
--button-bg, --button-hover, --waveform-color, --grid-color,
--playhead-color, --trim-color
```

**Dépendances** : `waveform-renderer.js` (redessine waveform lors du changement)

**Utilisé par** : `main.js`

---

### `storage-manager.js` (228 lignes)

**Responsabilité** : Gestion du stockage IndexedDB (nettoyage, monitoring, quotas)

**Fonctions principales** :
- `getStorageStats()` : Récupère statistiques d'utilisation (MB, quota, %)
- `cleanupSamples(recorder, options)` : Nettoie samples selon critères
- `checkStorageWarning(threshold)` : Vérifie seuil d'avertissement
- `openCleanupDialog(recorder, root, onComplete)` : Dialogue modal de nettoyage

**Options de nettoyage** :
```javascript
// Supprimer samples de plus de 30 jours
cleanupSamples(recorder, { olderThanDays: 30 })

// Supprimer samples de plus de 90 jours
cleanupSamples(recorder, { olderThanDays: 90 })

// Supprimer TOUS les samples (dangereux)
cleanupSamples(recorder, { all: true })
```

**Retour** :
```javascript
{
  deleted: 5,        // Nombre de samples supprimés
  freed: 12.3        // MB libérés
}
```

**UI** : Dialogue modal avec 3 options de nettoyage + stats d'utilisation

**Dépendances** : Aucune (utilise navigator.storage API native)

**Utilisé par** : `main.js`, `audio-sampler.js`

---

### `ui-helpers.js` (107 lignes)

**Responsabilité** : Helpers d'interface utilisateur

**Fonctions principales** :
- `showStatus(statusEl, msg)` : Affichage messages de statut
- `showError(errorEl, statusEl, msg)` : Gestion et affichage d'erreurs
- `resetButtons(container)` : Nettoyage de la grille de pads
- `updateTimeInfo(...)` : Mise à jour des informations temporelles (Start/End/Duration)
- `updateSampleName(...)` : Mise à jour du nom du sample affiché
- `stopCurrentPlayback(source)` : Arrêt de la lecture en cours

**Dépendances** : `utils.js` (formatTime)

**Utilisé par** : `main.js`

---

### `keyboard-manager.js` (130 lignes)

**Responsabilité** : Gestion des layouts clavier et mapping touches→pads

**Classe principale** : `KeyboardManager`

**Layouts supportés** :
- `QWERTY` : ASDFGHJK / QWERTYU
- `AZERTY` : QSDFGHJK / AZERTYUIO

**Méthodes publiques** :
- `constructor(layout)` : Initialisation avec layout
- `setLayout(layout)` : Changement de layout
- `bindKeyboard()` : Liaison événements clavier
- `updatePadKeyLabels(container)` : Mise à jour labels visuels des pads
- `setupLayoutSelect(select, container)` : Configuration dropdown de layout

**État interne** :
- `padCallbacks` : Map pad index → fonction de lecture
- `audioContext`, `audioContextResumed` : Contexte Web Audio

**Dépendances** : Aucune

**Utilisé par** : `main.js`

---

### `waveform-renderer.js` (413 lignes)

**Responsabilité** : Rendu waveform, trim bars, playhead animé

**Fonctions principales** :
- `createWaveformUI(container, stopFn)` : Création UI complète (canvas, overlay, contrôles)
- `drawWaveform(buffer, canvas)` : Rendu waveform avec gradient CSS custom properties
- `createAnimateOverlay(state)` : Loop RAF pour playhead animé
- `setupOverlayMouseEvents(canvas, trimbarsDrawer, mousePos, state)` : Gestion interactions souris
- `showWaveformForSound(buffer, url, padIndex, sampleName, state)` : Affichage waveform pour un sample

**Structure de données** : `waveformState`
```javascript
{
  waveformCanvas, overlayCanvas, trimbarsDrawer,
  leftTrimLabel, rightTrimLabel, timeInfoEl, sampleNameEl,
  currentShownBuffer, currentShownUrl, currentShownPadIndex, currentShownSampleName,
  currentSource, playStartCtxTime, playStartSec, playEndSec,
  ctx, trimPositions, mousePos,
  updateTimeInfo, updateSampleName
}
```

**Optimisations** :
- Device Pixel Ratio pour rendu haute résolution
- RAF loop pour playhead fluide (60fps)
- Gradient CSS pour thèmes dynamiques

**Dépendances** : `trimbarsdrawer.js`, `utils.js`

**Utilisé par** : `main.js`, `theme-manager.js`

---

### `instrument-creator.js` (307 lignes)

**Responsabilité** : Création d'instruments et découpage audio

**Fonctions principales** :
- `createInstrumentFromBufferUrl(url, name, params)` : Instrument 16 notes depuis URL
- `createInstrumentFromSavedSample(id, params)` : Instrument depuis IndexedDB
- `createInstrumentFromAudioBuffer(buffer, name, params)` : Instrument depuis AudioBuffer
- `createPresetFromBufferSegments(buffer, name, params)` : Split on silence
- `createPresetFromSavedSampleSegments(id, params)` : Split depuis IndexedDB
- `splitBufferOnSilence(buffer, threshold, minDuration, ctx)` : Algorithme de découpage
- `trimLeadingSilence(buffer, threshold, ctx)` : Suppression silence initial

**Algorithme de pitch** :
```javascript
playbackRate = 2^(semitones/12)
// Exemple: +12 semitones = octave supérieure (rate 2.0)
```

**Algorithme split on silence** :
1. Détection amplitude < threshold
2. Groupement silences consécutifs
3. Extraction segments entre silences
4. Filtrage segments trop courts (< minDuration)

**Paramètres** : `getInstrumentCreatorParams()` depuis `main.js`
```javascript
{
  ctx, audioSamplerComp, trimPositions, presets,
  fillPresetSelect, presetSelect, loadPresetByIndex,
  showStatus, showError
}
```

**Dépendances** : `soundutils.js`

**Utilisé par** : `main.js`

---

### `soundutils.js` (67 lignes)

**Responsabilité** : Utilitaires audio (chargement, lecture)

**Fonctions principales** :
- `loadAndDecodeSound(ctx, url)` : Fetch + decode AudioBuffer
- `playSound(ctx, buffer, start, end)` : Lecture avec trim (start/end en secondes)

**Gestion d'erreurs** :
- Retry automatique (1 tentative)
- Messages d'erreur détaillés
- Gestion CORS

**Dépendances** : Aucune

**Utilisé par** : `main.js`, `instrument-creator.js`

---

### `trimbarsdrawer.js` (194 lignes)

**Responsabilité** : Dessin et interaction des trim bars

**Classe principale** : `TrimbarsDrawer`

**Méthodes publiques** :
- `setPositions(left, right)` : Définir positions (0-1)
- `getPositions()` : Récupérer positions { left, right }
- `draw()` : Redessiner les barres
- `hitTest(x, y)` : Test collision souris
- `startDrag(which)` : Démarrer drag
- `updateDrag(x)` : Mettre à jour position pendant drag
- `endDrag()` : Terminer drag

**Événements émis** :
- `trimchanged` : Émis lors du changement de position

**Rendu** :
- Barres verticales colorées (CSS custom property `--trim-color`)
- Zones de grip (rectangles en haut/bas)
- Anti-aliasing via device pixel ratio

**Dépendances** : Aucune

**Utilisé par** : `waveform-renderer.js`

---

### `utils.js` (94 lignes)

**Responsabilité** : Utilitaires génériques

**Fonctions principales** :
- `pixelToSeconds(x, canvasWidth, duration)` : Conversion pixel → secondes
- `formatTime(seconds)` : Format "MM:SS.mmm"
- `formatSampleNameFromUrl(url)` : Nettoyage nom de fichier

**Dépendances** : Aucune

**Utilisé par** : `main.js`, `waveform-renderer.js`, `ui-helpers.js`

---

### `recorder.mjs` (POC - 387 lignes)

**Responsabilité** : Enregistrement micro + sauvegarde IndexedDB

**Classe principale** : `Recorder`

**Fonctionnalités** :
- Enregistrement via MediaRecorder
- Décodage Blob → AudioBuffer
- Normalisation audio (peak normalization)
- Conversion AudioBuffer → WAV PCM16
- Stockage IndexedDB (DB: `audio-sampler`, Store: `samples`)

**Méthodes publiques** :
- `start()` : Démarrer enregistrement
- `stop()` : Arrêter et récupérer AudioBuffer
- `saveSample(blob, metadata)` : Sauvegarder dans IndexedDB
- `getSample(id)` : Récupérer depuis IndexedDB
- `getAllSamples()` : Lister tous les samples
- `deleteSample(id)` : Supprimer un sample
- `audioBufferToWavBlob(buffer)` : Conversion WAV

**Format WAV généré** :
- PCM 16-bit signed
- Sample rate: celui de l'AudioBuffer
- Mono ou Stereo selon le nombre de canaux

**Dépendances** : Aucune (utilise APIs natives)

**Utilisé par** : `audio-sampler.js`, `main.js`

---

### `audio-sampler.js` (Web Component - 199 lignes)

**Responsabilité** : Composant d'enregistrement UI

**Custom Element** : `<audio-sampler>`

**Structure** : Shadow DOM avec 4 boutons + canvas waveform

**Propriétés publiques** :
- `recorder` : Instance Recorder
- `lastAudioBuffer` : Dernier buffer enregistré
- `lastBlob` : Dernier blob enregistré
- `bufferSource` : Source en cours de lecture

**Événements émis** :
- `sampleadded` : { id, name } - Sample sauvegardé
- `recordingstart` : Début enregistrement
- `recordingstop` : Fin enregistrement

**Méthodes publiques** :
- `saveLast(name)` : Sauvegarder dernier enregistrement

**Thème** : Écoute l'événement `sampler-theme-changed` pour redessiner

**Dépendances** : `recorder.mjs`

**Utilisé par** : `sampler-component.js`, `main.js`

---

### `sampler-component.js` (Web Component - 75 lignes)

**Responsabilité** : Wrapper complet du sampler en web component

**Custom Element** : `<audio-sampler-app>`

**Structure** : Shadow DOM contenant toute l'interface (topbar + enregistreur + pads)

**Fonctionnement** :
1. Attend que `audio-sampler` soit défini
2. Crée le Shadow DOM avec structure HTML
3. Crée dynamiquement `<audio-sampler>`
4. Importe et lance `startSampler(shadowRoot)`

**Variable globale** : `window.__AUDIO_SAMPLER_EMBEDDED__ = true`

**Dépendances** : `audio-sampler.js`, `main.js`

**Utilisé par** : `demo-integration.html`, `test-webcomponent.html`

---

## 🔄 Flux de données et interactions

### Chargement d'un preset

```
User selects preset
  ↓
main.js: loadPresetByIndex()
  ↓
presets-manager.js: fetchPresets() [if not cached]
  ↓
soundutils.js: loadAndDecodeSound() × 16 (parallel)
  ↓
main.js: Create pad buttons
  ↓
keyboard-manager.js: updatePadKeyLabels()
  ↓
UI updated
```

### Lecture d'un sample

```
User clicks pad / presses key
  ↓
keyboard-manager.js: triggers padCallback
  ↓
main.js: playSound()
  ↓
waveform-renderer.js: showWaveformForSound()
  ↓
waveform-renderer.js: drawWaveform() + animateOverlay()
  ↓
soundutils.js: playSound(ctx, buffer, start, end)
  ↓
Audio plays + playhead animates
```

### Enregistrement d'un sample

```
User clicks Record
  ↓
audio-sampler.js: recorder.start()
  ↓
MediaRecorder API: captures audio
  ↓
User clicks Stop
  ↓
recorder.mjs: stop() → decode → normalize
  ↓
audio-sampler.js: lastAudioBuffer set
  ↓
audio-sampler.js: renders waveform
  ↓
User clicks Save
  ↓
recorder.mjs: audioBufferToWavBlob() → saveSample()
  ↓
IndexedDB: sample stored
  ↓
Event 'sampleadded' emitted
  ↓
main.js: adds to current preset
```

---

## 🎨 Système de thèmes

### Architecture

Les thèmes sont définis dans `theme-manager.js` sous forme d'objets JavaScript :

```javascript
export const themes = {
  'purple-neon': {
    '--bg-color': '#0f0f23',
    '--accent-color': '#a78bfa',
    // ... 10 variables CSS
  }
};
```

### Application

1. `applyTheme()` applique les variables CSS au `:root` (ou shadowRoot)
2. Tous les composants utilisent `var(--accent-color)` etc.
3. Changement de thème → redessine waveform avec nouvelles couleurs

### Ajouter un nouveau thème

```javascript
// Dans theme-manager.js
themes['mon-theme'] = {
  '--bg-color': '#1a1a2e',
  '--accent-color': '#ff6b6b',
  // ... autres variables
};
```

Pas besoin de modifier le CSS - tout est dynamique !

---

## 🔌 API REST (serveur)

### Configuration

Fichier : `ExampleRESTEndpointCorrige/index.mjs`

Port : 3000 (configurable via `process.env.PORT`)

### Endpoints

| Méthode | Endpoint | Description | Retour |
|---------|----------|-------------|--------|
| GET | `/api/health` | État du serveur | `{ status: "ok" }` |
| GET | `/api/presets` | Liste des presets | Array de presets JSON |
| GET | `/presets/<file>` | Fichier audio statique | Audio stream |

### Structure preset JSON

```json
{
  "id": "808",
  "name": "808 Drum Kit",
  "sounds": [
    { "name": "Kick", "url": "808/Kick.wav" },
    { "name": "Snare", "url": "808/Snare.wav" }
  ]
}
```

### CORS

Headers configurés :
```javascript
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
```

---

## 🧪 Tests

### Tests API

Fichiers : `ExampleRESTEndpointCorrige/tests/*.test.mjs`

```bash
cd ExampleRESTEndpointCorrige
npm test
```

Tests couverts :
- Health endpoint
- Presets endpoint
- CRUD operations

### Tests manuels (checklist)

**Presets** :
- [ ] Charger chaque des 5 presets
- [ ] Vérifier les 16 pads de chaque preset
- [ ] Tester avec pads vides (< 16 samples)

**Clavier** :
- [ ] Layout QWERTY : tester toutes les touches
- [ ] Layout AZERTY : tester toutes les touches
- [ ] Changement de layout en cours de lecture

**Waveform** :
- [ ] Affichage après clic sur pad
- [ ] Trim bars drag & drop
- [ ] Playhead animation fluide
- [ ] Infos temporelles correctes

**Thèmes** :
- [ ] Appliquer les 4 thèmes
- [ ] Vérifier redessine waveform
- [ ] Vérifier couleurs UI cohérentes

**Enregistrement** :
- [ ] Permission micro demandée
- [ ] Enregistrement → Stop → Play
- [ ] Sauvegarder → vérifier IndexedDB
- [ ] Ajouter au preset courant

**Web Component** :
- [ ] Chargement dans demo-integration.html
- [ ] Isolation Shadow DOM (pas de conflits CSS)
- [ ] Toutes fonctionnalités opérationnelles

---

## ⚠️ Problèmes connus et limitations

### Bugs mineurs

1. **Trim bars** : Peuvent se chevaucher si déplacées trop rapidement
   - Cause : Pas de contrainte stricte left < right pendant le drag
   - Fix suggéré : Ajouter clamp dans `TrimbarsDrawer.updateDrag()`

2. **Répétition clavier** : Sample rejoué en boucle si touche maintenue
   - Cause : Événement `keydown` répété par l'OS
   - Fix suggéré : Détecter `event.repeat` et ignorer

3. **Performance visuelle** : Ralentissement avec beaucoup de samples simultanés
   - Cause : RAF loop + nombreuses sources audio
   - Fix suggéré : Throttling ou pool d'objets

4. **Focus bouton** : Reste sélectionné après changement de preset
   - Cause : `document.activeElement` non réinitialisé
   - Fix suggéré : `button.blur()` après `loadPresetByIndex()`

### Limitations architecturales

1. **Variables globales** : `currentRoot`, `ctx`, `presets` dans `main.js`
   - Impact : Rend tests unitaires difficiles
   - Fix suggéré : Wrapper dans classe `SamplerApp`

2. **État distribué** : Waveform, trim, playback dans objets séparés
   - Impact : Synchronisation manuelle nécessaire
   - Fix suggéré : Store centralisé (type Redux)

3. **Pas de tests automatisés** pour les modules
   - Impact : Régressions non détectées
   - Fix suggéré : Jest + tests unitaires

4. **IndexedDB sans migration** : Schéma figé
   - Impact : Changements de structure difficiles
   - Fix suggéré : Système de versioning

---

## 🔧 Guide de maintenance

### Ajouter un nouveau preset (serveur)

1. Créer dossier dans `ExampleRESTEndpointCorrige/public/presets/` :
   ```bash
   mkdir -p ExampleRESTEndpointCorrige/public/presets/mon-preset
   ```

2. Ajouter fichiers audio (.wav recommandé)

3. Mettre à jour la source des presets (si liste statique)

### Ajouter un module

1. Créer fichier dans `js/mon-module.js`
2. Exporter fonctions/classes avec `export`
3. Importer dans `main.js` : `import { maFonction } from './mon-module.js';`
4. Documenter dans ce README technique

### Modifier le nombre de pads

**Attention** : Impact sur plusieurs fichiers

1. `main.js` : `loadPresetByIndex()` → changer boucle 16
2. `keyboard-manager.js` : Modifier layouts QWERTY/AZERTY
3. `css/styles.css` : Adapter grille `.button-grid`

### Ajouter un endpoint API

Fichier : `ExampleRESTEndpointCorrige/index.mjs`

```javascript
app.get('/api/mon-endpoint', (req, res) => {
  res.json({ data: 'value' });
});
```

### Déboguer Shadow DOM

Problème : Sélecteurs ne trouvent pas les éléments

**Solution** : Utiliser `currentRoot` au lieu de `document`

```javascript
// ❌ Ne fonctionne pas dans Shadow DOM
document.querySelector('#monElement')

// ✅ Fonctionne partout
currentRoot.querySelector('#monElement')
```

---

## 📊 Métriques de performance

### Temps de chargement typiques

- API `/api/presets` : ~50ms (localhost)
- Décodage 1 sample (1s audio) : ~20ms
- Décodage preset complet (16 samples) : ~300ms (parallèle)
- Rendu waveform : ~5ms (canvas 800x200)
- RAF loop (playhead) : ~0.5ms par frame

### Mémoire

- 1 AudioBuffer (44100Hz, 1s, mono) : ~176 KB
- Preset complet (16 samples, 1s chaque) : ~2.8 MB
- IndexedDB (10 samples sauvegardés) : ~5 MB

### Optimisations possibles

1. **Lazy loading** : Charger samples à la demande
2. **Audio sprites** : Combiner samples en un seul fichier
3. **Web Workers** : Décodage audio en background
4. **OffscreenCanvas** : Waveform dans worker

---

## 🚀 Roadmap technique

### Court terme (1-2 semaines)

- [ ] Extraire création modaux dans `ModalManager`
- [ ] Wraper état global dans classe `SamplerApp`
- [ ] Ajouter tests Jest pour modules
- [ ] Corriger bugs trim bars et focus

### Moyen terme (1 mois)

- [ ] Système de plugins pour effets audio
- [ ] Export/import presets JSON
- [ ] Undo/Redo avec Command pattern
- [ ] Migration IndexedDB avec versioning

### Long terme (3+ mois)

- [ ] Séquenceur pattern-based
- [ ] Mode collaboratif (WebRTC)
- [ ] PWA avec offline support
- [ ] Audio Worklet pour effets custom

---

## 📖 Références techniques

### APIs Web utilisées

- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [Custom Elements](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements)

### Bibliothèques

- [Express.js](https://expressjs.com/) - Serveur HTTP
- [CORS](https://www.npmjs.com/package/cors) - Middleware CORS

### Patterns architecturaux

- **Module Pattern** : Isolation du code en modules ES6
- **Observer Pattern** : Événements DOM et CustomEvents
- **Component Pattern** : Web Components réutilisables
- **State Object Pattern** : `waveformState` centralisé

---

## 🔐 Sécurité

### Considérations actuelles

⚠️ **Prototype pédagogique** : Pas de production sans audit de sécurité

**Vulnérabilités potentielles** :
1. CORS ouvert (`*`) - Acceptable en dev, à restreindre en prod
2. Pas de validation des fichiers audio uploadés
3. IndexedDB accessible depuis DevTools
4. Pas de rate limiting sur l'API

**Recommandations pour production** :
- [ ] Whitelist CORS origins
- [ ] Validation MIME types et taille fichiers
- [ ] Chiffrement IndexedDB si données sensibles
- [ ] Rate limiting (ex: `express-rate-limit`)
- [ ] CSP headers
- [ ] Input sanitization

---

## 📄 Licence et contributions

Prototype pédagogique. Code fourni "tel quel" avec des zones à améliorer.

**Contributions bienvenues** :
- Bug fixes
- Nouveaux modules
- Tests automatisés
- Documentation

**Process de contribution** :
1. Fork le repo
2. Créer branche feature (`git checkout -b feature/ma-feature`)
3. Commit avec messages clairs
4. Push et créer Pull Request

---

**Version** : Refactored (Novembre 2025)  
**Mainteneurs** : Pierre Constantin, Oihane Fabbrini  
**Score qualité** : 7/10 (maintenable, avec marge d'amélioration)
