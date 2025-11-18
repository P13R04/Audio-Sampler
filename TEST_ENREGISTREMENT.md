# 🧪 Guide de test - Enregistrement et création de presets

## ✅ Checklist complète de test du Web Component

### 1. Tests de base (déjà fonctionnels)

- [ ] ✅ Les presets se chargent
- [ ] ✅ Les pads jouent des sons
- [ ] ✅ Le clavier fonctionne (QWERTY/AZERTY)
- [ ] ✅ La waveform s'affiche
- [ ] ✅ Le playhead se déplace
- [ ] ✅ Les trim bars fonctionnent
- [ ] ✅ Les thèmes changent

### 2. Tests du composant d'enregistrement 🎙️

#### A. Interface visible
- [ ] ✅ Bouton "🎙️ Enregistrer" visible
- [ ] ✅ Bouton "⏹️ Stop" visible
- [ ] ✅ Bouton "▶️ Lecture" visible
- [ ] ✅ Bouton "💾 Sauvegarder" visible
- [ ] ✅ Canvas waveform vide au départ

#### B. Workflow d'enregistrement
1. **Cliquer sur "Enregistrer"**
   - [ ] Permission micro demandée (si première fois)
   - [ ] Message "Enregistrement… (max 30s)" s'affiche
   - [ ] Bouton "Enregistrer" désactivé
   - [ ] Bouton "Stop" activé

2. **Faire du bruit dans le micro** (parler, taper, siffler...)
   - [ ] Enregistrement en cours

3. **Cliquer sur "Stop"**
   - [ ] Message "Enregistrement prêt — durée approximative : Xs"
   - [ ] Waveform dessinée sur le canvas
   - [ ] Bouton "Lecture" activé
   - [ ] Bouton "Sauvegarder" activé

4. **Cliquer sur "Lecture"**
   - [ ] Son joué dans les haut-parleurs
   - [ ] Message "Lecture…" puis "Lecture terminée"

5. **Cliquer sur "Sauvegarder"**
   - [ ] Popup demandant le nom du sample
   - [ ] Entrer un nom (ex: "test-1")
   - [ ] Message "Sample sauvegardé (id X)"

### 3. Tests des boutons "Ajouter un son" et "Créer preset" 🎛️

#### A. Bouton "Ajouter un son..."
- [ ] ✅ Bouton visible sous la topbar
- [ ] ✅ Clic ouvre un menu modal
- [ ] ✅ Options visibles :
  - [ ] "Importer fichier audio"
  - [ ] "Samples sauvegardés"
  - [ ] "Créer instrument 16 notes"
  - [ ] "Split on silence"
  - [ ] "Fermer"

#### B. Bouton "Créer preset..."
- [ ] ✅ Bouton visible sous la topbar
- [ ] ✅ Clic ouvre un menu modal
- [ ] ✅ Options visibles :
  - [ ] "Créer preset vide"
  - [ ] "Créer depuis samples"
  - [ ] "Split on silence"
  - [ ] "Créer instrument 16 notes"
  - [ ] "Fermer"

### 4. Tests des workflows complets 🔄

#### Workflow 1 : Enregistrer → Sauvegarder → Utiliser
1. [ ] Enregistrer un son (ex: clap)
2. [ ] Sauvegarder le son (nom: "clap-test")
3. [ ] Cliquer "Ajouter un son" → "Samples sauvegardés"
4. [ ] Sélectionner "clap-test" → "Ajouter au preset"
5. [ ] Vérifier qu'un nouveau pad apparaît avec le son
6. [ ] Cliquer sur le pad → le son joue

#### Workflow 2 : Créer instrument depuis enregistrement
1. [ ] Enregistrer une note de musique (ex: chanter une note)
2. [ ] Stop (ne pas sauvegarder)
3. [ ] Cliquer "Créer preset" → "Créer instrument 16 notes"
4. [ ] Entrer un nom (ex: "voix-instrument")
5. [ ] Vérifier que 16 pads sont créés
6. [ ] Jouer les pads → chaque pad joue la note à une hauteur différente

#### Workflow 3 : Split on silence
1. [ ] Enregistrer plusieurs claps séparés par des silences
2. [ ] Stop (ne pas sauvegarder)
3. [ ] Cliquer "Créer preset" → "Split on silence"
4. [ ] Entrer un nom (ex: "claps-splits")
5. [ ] Vérifier que plusieurs pads sont créés (un par clap)
6. [ ] Jouer les pads → chaque clap joue séparément

#### Workflow 4 : Importer fichier audio
1. [ ] Cliquer "Ajouter un son" → "Importer fichier audio"
2. [ ] Sélectionner un fichier .wav ou .mp3
3. [ ] Vérifier qu'un nouveau pad apparaît
4. [ ] Jouer le pad → le fichier importé joue

### 5. Tests avancés 🚀

#### A. Vérifier IndexedDB
1. [ ] Ouvrir DevTools → Application → IndexedDB
2. [ ] Vérifier que la base "audio-sampler" existe
3. [ ] Vérifier que le store "samples" contient les samples sauvegardés
4. [ ] Cliquer sur un sample → voir le blob et les métadonnées

#### B. Vérifier les événements
1. [ ] Ouvrir DevTools → Console
2. [ ] Enregistrer un son → vérifier les logs
3. [ ] Vérifier les événements : `recordingstart`, `recordingstop`, `sampleadded`

#### C. Tester les thèmes avec l'enregistreur
1. [ ] Enregistrer un son
2. [ ] Changer de thème (ex: Midnight Blue)
3. [ ] Vérifier que la waveform de l'enregistreur change de couleur
4. [ ] Essayer les 4 thèmes

### 6. Tests de comparaison 📊

#### A. Standalone vs Web Component
1. [ ] Ouvrir `index.html` (standalone)
2. [ ] Enregistrer un son → sauvegarder
3. [ ] Ouvrir `test-webcomponent.html` (web component)
4. [ ] Vérifier que le sample sauvegardé est accessible (IndexedDB partagé)
5. [ ] Enregistrer un autre son dans le web component
6. [ ] Retourner sur `index.html` → vérifier que les deux samples sont là

### 7. Tests d'intégration 🔗

#### A. Test dans demo-integration.html
1. [ ] Ouvrir `demo-integration.html`
2. [ ] Vérifier que le sampler est intégré dans la page stylée
3. [ ] Tester toutes les fonctionnalités (enregistrement, lecture, presets)
4. [ ] Vérifier que l'isolation Shadow DOM fonctionne

## 🐛 Problèmes connus et solutions

### Problème : Permission micro refusée
**Symptôme :** Erreur "Permission denied" au clic sur Enregistrer  
**Solution :** 
1. Vérifier les paramètres du navigateur (Préférences → Confidentialité → Microphone)
2. Autoriser le site à accéder au micro
3. Recharger la page

### Problème : Pas de son enregistré
**Symptôme :** Waveform plate ou vide après Stop  
**Solution :**
1. Vérifier que le micro fonctionne (tester dans une autre app)
2. Parler plus fort ou se rapprocher du micro
3. Vérifier les niveaux audio dans les paramètres système

### Problème : Boutons "Ajouter un son" / "Créer preset" manquants
**Symptôme :** Boutons non visibles dans le web component  
**Solution :**
1. Ouvrir DevTools → Console
2. Vérifier les erreurs JavaScript
3. Vérifier que `currentRoot` est bien défini
4. Tester dans `index.html` pour comparer

### Problème : Sample sauvegardé non trouvé
**Symptôme :** Erreur lors de l'ajout d'un sample sauvegardé au preset  
**Solution :**
1. Ouvrir DevTools → Application → IndexedDB → audio-sampler
2. Vérifier que le sample existe
3. Noter l'ID et vérifier qu'il correspond
4. Vider IndexedDB et réessayer

## 📝 Notes pour les développeurs

### Différences standalone vs web component

| Aspect | Standalone (index.html) | Web Component |
|--------|------------------------|---------------|
| DOM | `document` | `shadowRoot` |
| Styles | Globaux | Encapsulés |
| Composant audio-sampler | `document.querySelector('audio-sampler')` | `currentRoot.querySelector('audio-sampler')` |
| IndexedDB | Partagé | Partagé (même origine) |
| Events | `window` | `window` (global) |

### Variables critiques
- `currentRoot` : Stocke le root actif (document ou shadowRoot)
- Utilisée pour trouver `<audio-sampler>` dans les deux modes
- Définie au début de `startSampler(root)`

### Événements personnalisés
- `sampleadded` : Émis quand un sample est sauvegardé
- `recordingstart` : Émis au début de l'enregistrement
- `recordingstop` : Émis à la fin de l'enregistrement
- `playstart` : Émis au début de la lecture
- `playend` : Émis à la fin de la lecture

## ✅ Résultat attendu

À la fin des tests, vous devriez avoir :
- ✅ Enregistré au moins 3 samples différents
- ✅ Créé un instrument 16 notes
- ✅ Utilisé le split on silence
- ✅ Importé un fichier audio externe
- ✅ Vérifié que tout fonctionne dans les deux modes
- ✅ Confirmé que les samples sont sauvegardés dans IndexedDB
- ✅ Testé les 4 thèmes avec l'enregistreur

**Temps estimé :** 15-20 minutes pour tous les tests

**Dernière mise à jour :** 17 novembre 2025
