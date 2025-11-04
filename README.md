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
