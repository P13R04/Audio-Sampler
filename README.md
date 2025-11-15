# Auteurs

Pierre Constantin
Oihane Fabbrini

# Sampler — Mode d'emploi (front & back)

Ce dépôt contient :
- Un petit serveur Node/Express (dossier `ExampleRESTEndpointCorrige`) qui fournit une API REST minimale et sert des fichiers audio.
- Une interface cliente (front) autonome en `index.html`, `js/`, `css/` qui consomme l'API et permet de jouer/éditer des samples.

## Prérequis

- Node.js 18+ recommandé (Node 20+ si possible)
- npm
- Un navigateur moderne (Chrome/Edge/Firefox)

## Démarrer le serveur API

Depuis la racine du projet :

```sh
npm install
npm start
```

Le serveur démarre par défaut sur :

- http://localhost:3000

Endpoints utiles :

- Santé: GET http://localhost:3000/api/health
- Presets (liste JSON): GET http://localhost:3000/api/presets
- Fichiers audio statiques (ex.) : http://localhost:3000/presets/nom.wav

Le dossier public servi par le serveur est `ExampleRESTEndpointCorrige/public/` — vous pouvez y copier le front (index.html + js + css) pour tout servir depuis le même origin.

## Ouvrir l'interface cliente (front)

Deux options :

1. Ouvrir `index.html` directement depuis l'éditeur (avec Live Server ou équivalent).
   - Installer l'extension Live Server (VS Code) et "Open with Live Server" sur `index.html`.
   - L'UI attend que l'API soit disponible à `http://localhost:3000`. Si vous servez le front depuis un autre origin, vérifiez la variable `API_BASE` dans `js/main.js`.

2. Copier le front dans le dossier public du serveur :

```sh
cp -r index.html css js ExampleRESTEndpointCorrige/public/
# Puis lancer le serveur :
npm start
```

## Raccourci : commandes utiles

```sh
# depuis la racine
npm install
npm start    # démarre l'API + serveur statique

# depuis ExampleRESTEndpointCorrige si vous préférez
cd ExampleRESTEndpointCorrige
npm install
npm start
```

## Fonctionnalités côté client (résumé)

- Grille 4×4 de pads (remplie bas→haut, gauche→droite)
- Mapping clavier QWERTY/AZERTY (sélecteur dans la topbar)
- Waveform affichée lorsqu'on joue un pad, avec trimbars gauche/droite pour sélectionner un segment
- Playhead (curseur de lecture) animé pendant la lecture
- Bouton Stop à droite de la waveform
- Affichage Start / End / Duration et nom du sample (Play n°X — SampleName)
- Les trims sont mémorisés en mémoire (par URL) pendant la session

## Où regarder le code (points d'entrée importants)

- `index.html` — markup principal, topbar, conteneur `#buttonsContainer` (grille des pads)
- `css/styles.css` — styles et thème (violet / cyan)
- `js/main.js` — logique principale :
  - récupération des presets (`fetchPresets`) et normalisation
  - génération dynamique des boutons/pads
  - mapping clavier et gestion des interactions
  - création/destruction de `AudioContext` et orchestration de la lecture
  - création de la waveform et RAF loop pour l'overlay
- `js/soundutils.js` — utilitaires de chargement et lecture (loadAndDecodeSound, playSound)
- `js/trimbarsdrawer.js` — dessin et interaction des trimbars (drag/drop)
- `js/utils.js` — helpers (formatage temps, conversion pixel→seconde, nettoyage noms)

## Enregistrement et Web Component (nouveau)

J'ai ajouté un proof-of-concept pour l'enregistrement et une transformation partielle de l'UI en Web Component :

- Nouveaux fichiers :
  - `js/recorder.mjs` : module d'enregistrement (MediaRecorder), décodage en `AudioBuffer`, normalisation, conversion WAV et stockage minimal dans `IndexedDB`.
  - `js/audio-sampler.js` : Web Component minimal `<audio-sampler>` (POC) avec UI Record / Stop / Play / Save. Ce composant utilise `Recorder` et stocke les samples sauvegardés dans IndexedDB.

But : fournir une base propre pour étendre vers 16 slots, presets exportables, et le mode instrument.

Utilisation rapide (développeur)

1. Servir le projet via un serveur statique (nécessaire pour importer des modules et accéder au micro). Exemple rapide :

```bash
# depuis la racine du projet
# si vous avez Python 3 installé :
python3 -m http.server 8000
# ou, si vous préférez node :
npx http-server -p 8000
```

2. Ouvrir `http://localhost:8000/` dans un navigateur moderne.

3. Inclure le composant dans une page HTML (exemple simple) :

```html
<script type="module" src="js/audio-sampler.js"></script>
<audio-sampler></audio-sampler>
```

Comportement du POC

- Cliquer sur `Enregistrer` lance la demande d'autorisation micro (si non déjà accordée) puis enregistre (max 30s par défaut).
- `Stop` arrête l'enregistrement, décode et normalise le sample puis affiche la waveform.
- `Lecture` joue le dernier sample enregistré.
- `Sauvegarder` stocke le blob dans `IndexedDB` (base `audio-sampler`, store `samples`) et retourne un `id` numérique.

Notes techniques et limitations

- Le pitch (mode instrument) n'est pas encore implémenté dans ce POC. Pour changer la hauteur d'un sample, il est possible d'utiliser `AudioBufferSourceNode.playbackRate` (attention : cela change aussi la durée).
- Le format enregistré dépend du `MediaRecorder` du navigateur (souvent `webm/opus`). Le module fournit `audioBufferToWavBlob()` pour convertir en WAV PCM16 si vous voulez exporter un WAV.
- Les enregistrements sont normalisés automatiquement pour assurer un niveau cohérent.
- Stockage : `IndexedDB` est utilisé (clé auto-incrémentée). Vous pouvez voir les entrées via DevTools → Application → IndexedDB → `audio-sampler`.

Notes sur les dernières modifications

- Les enregistrements sauvegardés sont maintenant stockés en WAV généré à partir de l'`AudioBuffer` trimé (le silence initial est supprimé). Cela évite d'avoir des blancs au début des samples sauvegardés.
- Un bouton `Créer preset...` a été ajouté à la barre d'outils : il permet de créer un preset vide ou via trois workflows :
  1. Assembler des sons existants (sélectionner jusqu'à 16 samples sauvegardés, ou inclure le dernier enregistrement non sauvegardé).
  2. Enregistrer puis scinder le fichier par silences pour générer jusqu'à 16 sons (split-on-silence).
  3. Créer un instrument 16 notes depuis le dernier enregistrement (pitch par demi-tons via `playbackRate`).

Exemples d'API / snippets

-- Récupérer le composant et changer la durée max avant enregistrement :

```js
const comp = document.querySelector('audio-sampler');
// modifier la durée max (en secondes)
comp.recorder.maxDuration = 20;
```

-- Sauvegarder via l'API du composant (renvoie l'id IndexedDB)

```js
await comp.saveLast('nom-de-mon-sample');
```

-- Exporter le dernier sample en WAV (exemple) :

```js
const buffer = comp.lastAudioBuffer; // AudioBuffer
const wavBlob = comp.recorder.audioBufferToWavBlob(buffer);
// puis créer un lien pour le télécharger
const url = URL.createObjectURL(wavBlob);
const a = document.createElement('a');
a.href = url; a.download = 'sample.wav'; a.click();
```

Tests manuels recommandés

- Ouvrir la page contenant `<audio-sampler>` et vérifier : permission micro demandée, enregistrement possible, lecture du sample.
- Vérifier que la waveform s'affiche après arrêt.
- Sauvegarder un sample puis inspecter IndexedDB dans les DevTools pour confirmer la présence du blob et des métadonnées.
- Tester des durées > 30s (le POC stoppe automatiquement après la durée configurée). Changer `comp.recorder.maxDuration` pour tester d'autres valeurs.

Prochaines étapes suggérées

- Étendre le Web Component pour gérer 16 slots et le mode instrument.
- Ajouter UI pour lister/charger/supprimer les samples depuis IndexedDB.
- Ajouter tests automatisés pour la conversion Blob→AudioBuffer et la sauvegarde IndexedDB.
```markdown
# Auteurs
  
Pierre Constantin
Oihane Fabbrini

# Sampler — Mode d'emploi (front & back)

Ce dépôt contient :
- Un petit serveur Node/Express (dossier `ExampleRESTEndpointCorrige`) qui fournit une API REST minimale et sert des fichiers audio.
- Une interface cliente (front) autonome en `index.html`, `js/`, `css/` qui consomme l'API et permet de jouer/éditer des samples.

Ce fichier `README_client.md` est une version augmentée et orientée côté client du README principal.

## Prérequis

- Node.js 18+ recommandé (Node 20+ si possible)
- npm
- Un navigateur moderne (Chrome/Edge/Firefox)

## Démarrer le serveur API

Depuis la racine du dossier :

```sh
npm install
npm start
```

Le serveur démarre par défaut sur :

- http://localhost:3000

Endpoints utiles :

- Santé: GET http://localhost:3000/api/health
- Presets (liste JSON): GET http://localhost:3000/api/presets
- Fichiers audio statiques (ex.) : http://localhost:3000/presets/nom.wav

Le dossier public servi par le serveur est `ExampleRESTEndpointCorrige/public/` — vous pouvez y copier le front (index.html + js + css) pour tout servir depuis le même origin.

## Ouvrir l'interface cliente (front)

Deux options :

1. Ouvrir `index.html` directement depuis l'éditeur (avec Live Server ou équivalent).
   - Installer l'extension Live Server (VS Code) et "Open with Live Server" sur `index.html`.
   - L'UI attend que l'API soit disponible à `http://localhost:3000`. Si vous servez le front depuis un autre origin, vérifiez la variable `API_BASE` dans `js/main.js`.

2. Copier le front dans le dossier public du serveur :

```sh
cp index.html -r css js ExampleRESTEndpointCorrige/public/
# Puis lancer le serveur :
npm start
# Ouvrir http://localhost:3000/ (ou /index.html selon la config)
```

La méthode 2 évite les problèmes CORS et garantit que les chemins relatifs des presets fonctionnent.

## Raccourci : commandes utiles

```sh
# depuis la racine
npm install
npm start    # démarre l'API + serveur statique

# depuis ExampleRESTEndpointCorrige si vous préférez
cd ExampleRESTEndpointCorrige
npm install
npm start
```

## Fonctionnalités côté client (résumé)

- Grille 4×4 de pads (remplie bas→haut, gauche→droite)
- Mapping clavier QWERTY/AZERTY (sélecteur dans la topbar)
- Waveform affichée lorsqu'on joue un pad, avec trimbars gauche/droite pour sélectionner un segment
- Playhead (curseur de lecture) animé pendant la lecture
- Bouton Stop à droite de la waveform
- Affichage Start / End / Duration et nom du sample (Play n°X — SampleName)
- Les trims sont mémorisés en mémoire (par URL) pendant la session

## Où regarder le code (points d'entrée importants)

- `index.html` — markup principal, topbar, conteneur `#buttonsContainer` (grille des pads)
- `css/styles.css` — styles et thème (violet / cyan)
- `js/main.js` — logique principale :
  - récupération des presets (`fetchPresets`) et normalisation
  - génération dynamique des boutons/pads
  - mapping clavier et gestion des interactions
  - création/destruction de `AudioContext` et orchestration de la lecture
  - création de la waveform et RAF loop pour l'overlay
- `js/soundutils.js` — utilitaires de chargement et lecture (loadAndDecodeSound, playSound)
- `js/trimbarsdrawer.js` — dessin et interaction des trimbars (drag/drop)
- `js/utils.js` — helpers (formatage temps, conversion pixel→seconde, nettoyage noms)

## Configuration rapide

- Modifier l'URL de l'API : ouvrez `js/main.js` et adaptez `API_BASE` en haut du fichier.
- Ajouter/mettre à jour des presets/audio : placez vos fichiers audio dans `ExampleRESTEndpointCorrige/public/presets/` (ou dans le dossier que le serveur sert) et mettez à jour la source des presets si nécessaire.

## Conseils pour contributeurs

- Si vous modifiez les couleurs ou tailles, envisagez d'extraire des variables CSS (`:root { --accent-violet: #a78bfa; }`) pour faciliter la maintenance.
- Pour ajouter un nouveau preset sur le serveur :
  1. Déposez les fichiers audio dans `ExampleRESTEndpointCorrige/public/presets/<preset-folder>/`
  2. Mettez à jour la route / source de `api/presets` si vous n'utilisez pas la réponse fournie.
- Pour tester des modifications JS/CSS rapidement, servez `index.html` via Live Server et rechargez le navigateur.

## Débogage rapide

- Erreurs de lecture audio : vérifier la console du navigateur et l'état de `AudioContext` (suspendu/resumed). L'UI tente de `ctx.resume()` au besoin.
- Problèmes CORS : servez le front depuis le même origin que le serveur (méthode 2 ci-dessus).

## Fichier de référence (rapide)

- Presets/API : `ExampleRESTEndpointCorrige/index.mjs`
- Dossier de presets statiques : `ExampleRESTEndpointCorrige/public/presets/`

## Améliorations futures (TODO)

- Mettre les couleurs en variables CSS pour gérer le thème et pouvoir le modifier / police / effets visuels de la waveform ou des boutons
- Tester / débugger les interactions avec le sampler et proposer des fix.

- Liste de problèmes mineurs connus actuellement :
    > Trimbar qui peut dépasser l'autre trimbar si déplacée trop vite
    > Sample joué à répétition frénétiquement si joué au clavier et que la touche reste enfoncée
    > Lenteur de l'effet visuel autour du bouton quand beaucoup de samples joués en peu de temps / affichage partiel
    > Bouton qui reste selectionné après le chargement d'un nouveau preset(il faut cliquer ailleurs pour que les touches du clavier soient reconnues), ce problème a déjà été rencontré et corrigé avec le changement de layout du clavier