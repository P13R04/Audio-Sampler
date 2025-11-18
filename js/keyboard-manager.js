/* ---------------------------------------------------------------------------
  keyboard-manager.js
  Module dédié à la gestion du clavier :
  - Gère les layouts QWERTY et AZERTY
  - Mapping des touches vers les pads de sampler (16 touches)
  - Mise à jour dynamique des labels de touches sur les pads
  - Prévention des conflits avec les champs de saisie
--------------------------------------------------------------------------- */

/**
 * Configuration des layouts clavier
 * Mapping: touches du clavier vers les 16 pads du sampler
 * Ordre: de bas en haut, de gauche à droite (4 lignes × 4 colonnes)
 * QWERTY: z,x,c,v / a,s,d,f / q,w,e,r / 1,2,3,4
 * AZERTY: w,x,c,v / q,s,d,f / a,z,e,r / &,é,",’ (codes clavier 1,2,3,4)
 */
// Touches physiques pour QWERTY et AZERTY
export const PAD_KEYS_QWERTY = ['z','x','c','v','a','s','d','f','q','w','e','r','1','2','3','4'];
export const PAD_KEYS_AZERTY = ['w','x','c','v','q','s','d','f','a','z','e','r','&','é','"',"'"];

// Labels affichés sur les pads (toujours 1,2,3,4 pour la ligne supérieure)
export const PAD_LABELS_QWERTY = ['z','x','c','v','a','s','d','f','q','w','e','r','1','2','3','4'];
export const PAD_LABELS_AZERTY = ['w','x','c','v','q','s','d','f','a','z','e','r','1','2','3','4'];

/* ---------------------------------------------------------------------------
  NOTE D'AMÉLIORATION (futur) :
  - Comportement actuel : on utilise `evt.key` (après toLowerCase) pour mapper
    les pressions clavier vers les pads. C'est simple et fonctionne bien pour
    la plupart des cas, mais `evt.key` peut varier selon la locale et le
    navigateur pour certains caractères (ex: AZERTY, touches numériques/symboles).

  - Proposition : utiliser `evt.code` pour un mapping basé sur la touche
    physique (ex: 'KeyQ', 'Digit1'). `evt.code` est stable entre layouts
    physiques et garantit qu'une même touche physique déclenche le même pad
    indépendamment de la disposition de caractères. Attention : `evt.code`
    ne couvre pas toujours les périphériques mobiles ou les claviers non
    standards.

  - Autre amélioration : ajouter une méthode `destroy()` qui appelle
    `unbindKeyboard()` et supprime/ nettoie toute référence interne (listeners
    de `layoutSelect`, etc.). Cela faciliterait le cycle de vie lorsque le
    composant parent est démonté.

  - Décision actuelle : conserver l'implémentation basée sur `evt.key` pour
    rétrocompatibilité. Les changements suggérés peuvent être implémentés plus
    tard en tant qu'option de configuration (ex: `usePhysicalKeys: true`).
--------------------------------------------------------------------------- */

/**
 * Classe pour gérer le clavier et le mapping vers les pads
 * Supporte les layouts QWERTY et AZERTY avec conversion automatique
 */
export class KeyboardManager {
  /**
   * Constructeur du gestionnaire de clavier
   * @param {string} layout - Layout initial ('qwerty' ou 'azerty')
   */
  constructor(layout = 'azerty') {
    this.currentLayout = layout;
    this.PAD_KEYS = layout === 'azerty' ? [...PAD_KEYS_AZERTY] : [...PAD_KEYS_QWERTY];
    this.PAD_LABELS = layout === 'azerty' ? [...PAD_LABELS_AZERTY] : [...PAD_LABELS_QWERTY];
    // Map: touche clavier -> index du pad
    this.keyToPadIndex = new Map();
    // Fonctions de lecture pour chaque pad
    this.padPlayFns = [];
    this.keyboardBound = false;
    this.audioContext = null;
    this.audioContextResumed = false;
  }

  /**
   * Change le layout du clavier et met à jour les mappings
   * Réactive le contexte audio si nécessaire après le changement
   * @param {string} layout - 'qwerty' ou 'azerty'
   */
  setLayout(layout) {
    this.currentLayout = layout;
    this.PAD_KEYS = layout === 'azerty' ? [...PAD_KEYS_AZERTY] : [...PAD_KEYS_QWERTY];
    this.PAD_LABELS = layout === 'azerty' ? [...PAD_LABELS_AZERTY] : [...PAD_LABELS_QWERTY];
    
    // Réactivation du contexte audio si suspendu
    if (this.audioContext && this.audioContextResumed && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(e => console.warn('Resume failed:', e));
    }
  }

  /**
   * Met à jour les labels de touches sur les pads existants
   * @param {HTMLElement} buttonsContainer - Conteneur des boutons
   */
  updatePadKeyLabels(buttonsContainer) {
    // Reconstruit le mapping clavier avec les nouvelles touches
    this.keyToPadIndex.clear();
    
    // Parcourt TOUS les enfants (boutons + empty) pour avoir le bon padIndex
    const children = Array.from(buttonsContainer.children);
    const rows = 4, cols = 4;
    children.forEach((child, domIndex) => {
      if (child.tagName === 'BUTTON') {
        // Convert DOM index (top-to-bottom row-major) to logical padIndex
        // where padIndex 0 = bottom-left. DOM rows count from top.
        const rowTop = Math.floor(domIndex / cols);
        const col = domIndex % cols;
        const rowFromBottom = rows - 1 - rowTop;
        const padIndex = rowFromBottom * cols + col;

        const keyLabel = child.querySelector('.pad-key');
        if (keyLabel && padIndex < this.PAD_LABELS.length) {
          keyLabel.textContent = this.PAD_LABELS[padIndex].toUpperCase();
        }
        // Map key -> DOM index so keydown triggers padPlayFns[domIndex]
        const key = this.PAD_KEYS[padIndex];
        if (key && domIndex < this.padPlayFns.length && this.padPlayFns[domIndex]) {
          this.keyToPadIndex.set(key, domIndex);
        }
      }
    });
    
    // updated key mapping
  }

  /**
   * Attache les écouteurs d'événements clavier
   * Gère la conversion AZERTY des chiffres et évite les conflits avec les inputs
   */
  bindKeyboard() {
    if (this.keyboardBound) return;

    // Stocke le handler pour pouvoir le retirer lors de l'unbind
    this._keyDownHandler = (evt) => {
      let k = (evt.key || '').toLowerCase();
      if (!k) return;

      // Conversion des touches numériques AZERTY vers leurs symboles
      if (this.currentLayout === 'azerty') {
        if (k === '1') k = '&';
        else if (k === '2') k = 'é';
        else if (k === '3') k = '"';
        else if (k === '4') k = "'";
      }

      const idx = this.keyToPadIndex.get(k);
      if (idx === undefined) return;

      // Ignore les touches si on est dans un champ de saisie
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;

      const fn = this.padPlayFns[idx];
      if (typeof fn === 'function') {
        evt.preventDefault();
        fn();
      }
    };

    window.addEventListener('keydown', this._keyDownHandler);

    this.keyboardBound = true;
  }

  /**
   * Retire les écouteurs clavier et les handlers associés
   * Idempotent — peut être appelé plusieurs fois sans effet secondaire.
   */
  unbindKeyboard() {
    if (!this.keyboardBound) return;
    try {
      if (this._keyDownHandler) {
        window.removeEventListener('keydown', this._keyDownHandler);
        this._keyDownHandler = null;
      }
    } catch (e) {
      console.warn('unbindKeyboard failed', e);
    }
    // Si un select de layout avait été configuré, retirer son handler
    try {
      if (this._layoutSelectEl && this._layoutSelectHandler) {
        this._layoutSelectEl.removeEventListener('change', this._layoutSelectHandler);
        this._layoutSelectEl = null;
        this._layoutSelectHandler = null;
      }
    } catch (e) {
      // noop
    }
    this.keyboardBound = false;
  }

  /**
   * Configure le select de layout
   * @param {HTMLSelectElement} layoutSelect - Élément select
   * @param {HTMLElement} buttonsContainer - Conteneur des boutons
   */
  setupLayoutSelect(layoutSelect, buttonsContainer) {
    if (!layoutSelect) return;
    // Stocke l'élément et le handler pour permettre la suppression ultérieure
    this._layoutSelectEl = layoutSelect;
    this._layoutSelectHandler = () => {
      this.setLayout(layoutSelect.value);
      this.updatePadKeyLabels(buttonsContainer);
      layoutSelect.blur();
    };
    layoutSelect.addEventListener('change', this._layoutSelectHandler);
  }
}
