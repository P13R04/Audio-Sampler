/* ---------------------------------------------------------------------------
  theme-manager.js
  Module de gestion des thèmes visuels :
  - Définit les thèmes disponibles (purple-neon, morning-light, retro-sunset, forest-emerald)
  - Applique les variables CSS correspondantes
  - Émet un événement global lors du changement de thème
  --------------------------------------------------------------------------- */

/**
 * Thèmes prédéfinis avec leurs variables CSS
 */
export const themes = {
  'purple-neon': {
    '--btn-border-start': 'rgba(167,139,250,0.45)',
    '--btn-border-hover': 'rgba(147,197,253,0.9)',
    '--btn-bg-top': '#111827',
    '--btn-bg-bottom': '#0f172a',
    '--btn-text': '#ffffff',
    '--btn-subtext': '#a78bfa',
    '--btn-key-bg': 'rgba(15,23,42,0.8)',
    '--wave-fill': '#0b1220',
    '--wave-stroke': 'rgba(167,139,250,0.98)',
    '--wave-bg': 'linear-gradient(90deg, rgba(167,139,250,0.06), rgba(103,232,249,0.06))',
    '--wave-grad-1': 'rgba(167, 139, 250, 0.98)',
    '--wave-grad-2': 'rgba(147, 197, 253, 0.98)',
    '--wave-grad-3': 'rgba(103, 232, 249, 0.98)',
    '--subtitle-color': '#c7b3ff',
    '--topbar-text': '#e5e7eb',
    '--topbar-bg': 'rgba(26, 21, 37, 0.4)',
    '--topbar-border': 'rgba(167,139,250,0.4)',
    '--pad-empty-border': 'rgba(167,139,250,0.25)',
    '--pad-empty-bg': 'linear-gradient(180deg, rgba(17,24,39,0.6), rgba(15,23,42,0.6))',
    '--waveform-border': 'rgba(167,139,250,0.3)',
    '--bg-grad-1': '#0a0a0f',
    '--bg-grad-2': '#1a1525',
    '--bg-radial-1': 'radial-gradient(ellipse 900px 400px at 20% 15%, rgba(88, 28, 135, 0.15), transparent 50%)',
    '--bg-radial-2': 'radial-gradient(ellipse 800px 350px at 80% 80%, rgba(45, 45, 70, 0.12), transparent 50%)',
    '--bg-radial-3': 'radial-gradient(circle 600px at 50% 50%, rgba(20, 20, 28, 0.8), transparent 70%)',
    '--bg-vignette': 'radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.30) 100%)',
    '--glow-color-1': 'rgba(167, 139, 250, 0.7)',
    '--glow-color-2': 'rgba(103, 232, 249, 0.7)',
    '--glow-border': 'rgba(147, 197, 253, 0.8)'
  },
  'morning-light': {
    '--btn-border-start': 'rgba(218,165,32,0.5)',
    '--btn-border-hover': 'rgba(255,215,0,0.8)',
    '--btn-bg-top': '#faf8f3',
    '--btn-bg-bottom': '#f5f0e8',
    // Make button and menu text fully legible on light background
    '--btn-text': '#000000',
    '--btn-subtext': '#7a5a30',
    '--btn-key-bg': 'rgba(250,248,243,0.9)',
    '--btn-shadow': 'rgba(139,115,85,0.15)',
    '--wave-fill': '#fffef9',
    '--wave-stroke': 'rgba(180,140,70,0.8)',
    '--wave-bg': 'linear-gradient(90deg, rgba(180,140,70,0.06), rgba(200,160,90,0.06))',
    '--wave-grad-1': 'rgba(180, 140, 70, 0.85)',
    '--wave-grad-2': 'rgba(200, 160, 90, 0.85)',
    '--wave-grad-3': 'rgba(160, 180, 200, 0.75)',
    '--subtitle-color': '#333333',
    // Make playback/topbar text very legible on the morning-light theme
    '--topbar-text': '#000000',
    '--topbar-bg': 'rgba(250,248,243,0.3)',
    '--topbar-border': 'rgba(218,165,32,0.4)',
    '--pad-empty-border': 'rgba(218,165,32,0.3)',
    '--pad-empty-bg': 'linear-gradient(180deg, rgba(250,248,243,0.5), rgba(245,240,232,0.5))',
    '--waveform-border': 'rgba(218,165,32,0.35)',
    '--bg-grad-1': '#e8f2f7',
    '--bg-grad-2': '#d4e9f2',
    '--bg-radial-1': 'radial-gradient(ellipse 900px 400px at 20% 15%, rgba(218, 165, 32, 0.12), transparent 50%)',
    '--bg-radial-2': 'radial-gradient(ellipse 800px 350px at 80% 80%, rgba(173, 216, 230, 0.15), transparent 50%)',
    '--bg-radial-3': 'radial-gradient(circle 600px at 50% 50%, rgba(200, 210, 220, 0.3), transparent 70%)',
    '--bg-vignette': 'radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0) 40%, rgba(100,150,180,0.15) 100%)',
    '--glow-color-1': 'rgba(180, 140, 70, 0.6)',
    '--glow-color-2': 'rgba(160, 180, 200, 0.5)',
    '--glow-border': 'rgba(218, 165, 32, 0.7)'
  },
  'retro-sunset': {
    '--btn-border-start': 'rgba(249,115,22,0.6)',
    '--btn-border-hover': 'rgba(252,165,0,0.9)',
    '--btn-bg-top': '#3b0a21',
    '--btn-bg-bottom': '#2b021f',
    '--btn-text': '#fff6f3',
    '--btn-subtext': '#fb7185',
    '--btn-key-bg': 'rgba(30,10,10,0.8)',
    '--wave-fill': '#2b021f',
    '--wave-stroke': 'rgba(249,115,22,0.95)',
    '--wave-bg': 'linear-gradient(90deg, rgba(249,115,22,0.06), rgba(236,72,153,0.06))',
    '--wave-grad-1': 'rgba(249,115,22,0.95)',
    '--wave-grad-2': 'rgba(236,72,153,0.95)',
    '--wave-grad-3': 'rgba(99,102,241,0.95)',
    '--subtitle-color': '#ffd6c7',
    '--topbar-text': '#fff6f3',
    '--topbar-bg': 'rgba(43,6,20,0.45)',
    '--topbar-border': 'rgba(249,115,22,0.4)',
    '--pad-empty-border': 'rgba(249,115,22,0.25)',
    '--pad-empty-bg': 'linear-gradient(180deg, rgba(59,10,33,0.6), rgba(43,2,31,0.6))',
    '--waveform-border': 'rgba(249,115,22,0.3)',
    '--bg-grad-1': '#2b021f',
    '--bg-grad-2': '#3b0a21',
    '--bg-radial-1': 'radial-gradient(ellipse 900px 400px at 20% 15%, rgba(249, 115, 22, 0.15), transparent 50%)',
    '--bg-radial-2': 'radial-gradient(ellipse 800px 350px at 80% 80%, rgba(236, 72, 153, 0.12), transparent 50%)',
    '--bg-radial-3': 'radial-gradient(circle 600px at 50% 50%, rgba(30, 10, 20, 0.8), transparent 70%)',
    '--bg-vignette': 'radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.35) 100%)',
    '--glow-color-1': 'rgba(249, 115, 22, 0.7)',
    '--glow-color-2': 'rgba(236, 72, 153, 0.7)',
    '--glow-border': 'rgba(252, 165, 0, 0.8)'
  },
  'forest-emerald': {
    '--btn-border-start': 'rgba(34,197,94,0.5)',
    '--btn-border-hover': 'rgba(34,197,94,0.95)',
    '--btn-bg-top': '#071f0a',
    '--btn-bg-bottom': '#04210a',
    '--btn-text': '#e9fff0',
    '--btn-subtext': '#a7f3d0',
    '--btn-key-bg': 'rgba(4,20,10,0.85)',
    '--wave-fill': '#04210a',
    '--wave-stroke': 'rgba(34,197,94,0.95)',
    '--wave-bg': 'linear-gradient(90deg, rgba(34,197,94,0.06), rgba(94,234,212,0.06))',
    '--wave-grad-1': 'rgba(34,197,94,0.98)',
    '--wave-grad-2': 'rgba(94,234,212,0.9)',
    '--wave-grad-3': 'rgba(167, 255, 199, 0.9)',
    '--subtitle-color': '#c6f6e5',
    '--topbar-text': '#e9fff0',
    '--topbar-bg': 'rgba(3,20,8,0.4)',
    '--topbar-border': 'rgba(34,197,94,0.4)',
    '--pad-empty-border': 'rgba(34,197,94,0.25)',
    '--pad-empty-bg': 'linear-gradient(180deg, rgba(7,31,10,0.6), rgba(4,33,10,0.6))',
    '--waveform-border': 'rgba(34,197,94,0.3)',
    '--bg-grad-1': '#04210a',
    '--bg-grad-2': '#071f0a',
    '--bg-radial-1': 'radial-gradient(ellipse 900px 400px at 20% 15%, rgba(34, 197, 94, 0.15), transparent 50%)',
    '--bg-radial-2': 'radial-gradient(ellipse 800px 350px at 80% 80%, rgba(94, 234, 212, 0.12), transparent 50%)',
    '--bg-radial-3': 'radial-gradient(circle 600px at 50% 50%, rgba(10, 25, 15, 0.8), transparent 70%)',
    '--bg-vignette': 'radial-gradient(60% 60% at 50% 50%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.30) 100%)',
    '--glow-color-1': 'rgba(34, 197, 94, 0.7)',
    '--glow-color-2': 'rgba(94, 234, 212, 0.7)',
    '--glow-border': 'rgba(34, 197, 94, 0.9)'
  }
};

/**
 * Applique un thème au document
 * @param {string} name - Nom du thème
 * @param {Document|ShadowRoot} targetRoot - Root où appliquer le thème
 * @param {Object} context - Contexte avec waveformCanvas, trimbarsDrawer, etc.
 */
export function applyTheme(name, targetRoot = document, context = {}) {
  const theme = themes[name] || themes['purple-neon'];
  
  // Appliquer au `documentElement` pour que les couleurs de fond / body
  // reflètent immédiatement le thème global.
  const docRoot = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => docRoot.style.setProperty(k, v));

  // Si la cible est un ShadowRoot, appliquer également les variables sur
  // l'élément hôte afin d'assurer l'héritage des variables CSS dans le
  // Shadow DOM du composant embarqué.
  if (targetRoot && typeof targetRoot === 'object' && targetRoot.host) {
    const host = targetRoot.host;
    Object.entries(theme).forEach(([k, v]) => host.style.setProperty(k, v));
  }

  // Émettre un événement global pour permettre aux composants de réagir
  // (par ex. redessiner un waveform ou recalculer des dégradés).
  try {
    window.dispatchEvent(new CustomEvent('sampler-theme-changed', { detail: { name } }));
  } catch (e) {
    // Ignorer si l'émission échoue dans certains environnements
  }

  // If a waveform is currently shown, force redraw so gradient/background match immediately
  if (context.currentShownBuffer && context.waveformCanvas && context.drawWaveform) {
    try {
      // Si le module waveform expose un overlayCanvas, le fournir afin
      // que les tailles et dégradés soient recalculés immédiatement.
      const overlay = context.overlayCanvas || null;
      context.drawWaveform(context.currentShownBuffer, context.waveformCanvas, overlay);
    } catch (e) {
      console.warn('Failed to redraw waveform after theme change', e);
    }
  }
  
  // Redessiner les trimbars / overlay si présents
  if (context.trimbarsDrawer && context.overlayCanvas) {
    try {
      context.trimbarsDrawer.draw();
    } catch (e) {
      // Ignorer les erreurs non critiques lors du redraw
    }
  }
}

/**
 * Configure le select de thème
 * @param {HTMLSelectElement} themeSelect - Élément select
 * @param {Document|ShadowRoot} targetRoot - Root où appliquer le thème
 * @param {Object} options - Options avec thème initial
 * @param {Object} context - Contexte pour redessiner après changement
 */
export function setupThemeSelect(themeSelect, targetRoot, options, context) {
  if (!themeSelect) return;
  
  // set initial value from options or element
  const initial = options.theme || themeSelect.value || 'purple-neon';
  themeSelect.value = initial;
  applyTheme(initial, targetRoot, context);
  
  const _handler = () => {
    applyTheme(themeSelect.value, targetRoot, context);
  };
  themeSelect._samplerThemeHandler = _handler;
  themeSelect.addEventListener('change', _handler);
}

/**
 * Retire le listener ajouté par `setupThemeSelect` si présent
 * @param {HTMLSelectElement} themeSelect
 */
export function teardownThemeSelect(themeSelect) {
  try {
    if (!themeSelect) return;
    if (themeSelect._samplerThemeHandler) {
      themeSelect.removeEventListener('change', themeSelect._samplerThemeHandler);
      themeSelect._samplerThemeHandler = null;
    }
  } catch (e) { /* ignore */ }
}
