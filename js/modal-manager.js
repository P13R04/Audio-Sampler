// modal-manager.js
// Fournit une racine globale pour les modales et des helpers pour
// attacher / retirer des panneaux modaux. Permet de gérer l'insertion
// dans le document ou dans un ShadowRoot (web component) tout en
// conservant un comportement prévisible pour le stacking et les styles.

const MODAL_ROOT_ID = 'app-modals-root';

function ensureRoot() {
  if (typeof document === 'undefined') return null;
  let root = document.getElementById(MODAL_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ROOT_ID;
    root.className = 'app-modals-root';
    // Styles de base pour que la racine couvre l'écran et n'intercepte
    // pas les événements pointer par défaut. Le fichier CSS principal
    // peut affiner l'apparence via la classe `.app-modals-root`.
    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.left = '0';
    root.style.width = '100%';
    root.style.height = '100%';
    root.style.pointerEvents = 'none';
    root.style.zIndex = '99990';
    document.body.appendChild(root);
  }
  return root;
}

let idCounter = 1;
// Map qui mémorise où chaque modal a été montée (clé: id de modal -> mount)
const _modalMounts = new Map();

function appendModal(panel, options = {}) {
  // `options.root` peut être fourni par l'appelant (par ex. un ShadowRoot)
  // afin d'insérer la modal dans l'arbre DOM approprié et de lui permettre
  // d'hériter des styles du composant hôte.
  const mount = options.root || null;
  let target = null;

  if (mount) {
    try {
    // Si `mount` est un Document, insérer la modal dans la racine
    // dédiée au document pour centraliser le stacking et la gestion
    // des pointer-events.
      if (mount instanceof Document) {
        target = ensureRoot();
      }
      // Si `mount` est un ShadowRoot (possède une propriété `host`), on
      // attache la modal directement au ShadowRoot pour qu'elle hérite
      // des variables CSS et du style local du composant.
      else if (mount && mount.host) {
        try {
          // Plutôt que de créer une racine `.app-modals-root` dans le
          // ShadowRoot (ce qui peut modifier la manière dont les variables
          // CSS se propagent), on attache le panneau directement au
          // ShadowRoot pour garantir l'héritage des variables du host.
          target = mount; // mount is the ShadowRoot
        } catch (e) {
          // If anything fails, fallback to the global root
          target = ensureRoot();
        }
      }
      // If mount is a plain Element with appendChild, use it
      else if (typeof mount.appendChild === 'function') {
        target = mount;
      }
    } catch (e) {
      target = null;
    }
  }

  if (!target) {
    target = ensureRoot();
    if (!target) throw new Error('No available modal mount point');
  }

  // Permet à l'appelant de fournir un `id`; sinon on en génère un.
  const id = options.id || panel.id || (`modal-${idCounter++}`);
  panel.id = id;
  // Activer les pointer-events pour le panneau (la racine reste
  // non-interactive sauf ses enfants) afin que les boutons soient cliquables.
  panel.style.pointerEvents = panel.style.pointerEvents || 'auto';
  // Si on monte dans un ShadowRoot, copier la couleur calculée du host
  // et une sélection de variables CSS pour que les en-têtes de modale
  // et le texte reprennent le thème du composant. On garde la logique
  // minimale pour éviter des effets de bord.
  try {
    if (mount && mount.host && typeof getComputedStyle === 'function') {
      const host = mount.host;
      const hostStyle = getComputedStyle(host);
      const hostColor = hostStyle.color;
      const varsToCopy = [
        '--topbar-text','--topbar-bg','--topbar-border','--btn-text','--btn-subtext',
        '--btn-bg-top','--btn-bg-bottom','--btn-border-start','--btn-border-hover','--btn-radius','--btn-shadow',
        '--btn-key-bg','--wave-fill','--wave-stroke','--wave-bg','--wave-grad-1','--wave-grad-2','--wave-grad-3','--waveform-border',
        '--pad-empty-border','--pad-empty-bg','--trim-color','--trim-bg','--subtitle-color','--bg-grad-1','--bg-grad-2',
        '--bg-radial-1','--bg-radial-2','--bg-radial-3','--bg-vignette','--glow-color-1','--glow-color-2','--glow-border'
      ];

      if (hostColor) panel.style.color = hostColor;
      for (const v of varsToCopy) {
        try {
          const val = hostStyle.getPropertyValue(v);
          if (val && val.trim()) panel.style.setProperty(v, val.trim());
        } catch (e) {
          // Si la lecture d'une variable échoue, on l'ignore et on
          // continue; c'est une opération auxiliaire non critique.
        }
      }
    }
  } catch (e) {
    // Ne pas interrompre le montage si la lecture des styles échoue.
  }
  target.appendChild(panel);
  try { _modalMounts.set(id, target); } catch (e) {}
  return panel;
}

function removeModal(idOrPanel) {
  let el = null;
  // If passed an Element directly, remove it
  if (idOrPanel instanceof Element) {
    try {
      const mount = _modalMounts.get(idOrPanel.id);
      if (mount && mount.contains && mount.contains(idOrPanel)) {
        idOrPanel.remove();
        _modalMounts.delete(idOrPanel.id);
        return true;
      }
      idOrPanel.remove();
      _modalMounts.delete(idOrPanel.id);
      return true;
    } catch (e) {
      return false;
    }
  
  }

  // If a string id is provided, try to find it where it was mounted
  if (typeof idOrPanel === 'string') {
    const id = idOrPanel;
    // On vérifie d'abord la racine globale dans le document
    const docRoot = document.getElementById(MODAL_ROOT_ID);
    if (docRoot) {
      const elDoc = docRoot.querySelector('#' + CSS.escape(id));
      if (elDoc) { try { elDoc.remove(); _modalMounts.delete(id); return true; } catch (e) { return false; } }
    }
    // Ensuite, on regarde la référence conservée lors de l'appel à appendModal
    const mount = _modalMounts.get(id);
    if (mount) {
      try {
        // if mount is a ShadowRoot or element, query within it
        let found = null;
        if (typeof mount.querySelector === 'function') found = mount.querySelector('#' + CSS.escape(id));
        else if (typeof mount.getElementById === 'function') found = mount.getElementById(id);
        if (found) {
          found.remove();
          _modalMounts.delete(id);
          return true;
        }
      } catch (e) { /* ignore */ }
    }
    return false;
  }
  return false;
}

function getModalRoot() { return document.getElementById(MODAL_ROOT_ID) || null; }

export default { appendModal, removeModal, getModalRoot };
