// Web Component `<audio-sampler-app>`
// Ce composant encapsule l'application sampler dans un ShadowRoot.
// Il importe dynamiquement le module principal et appelle
// `startSampler(shadowRoot)` pour initialiser l'UI à l'intérieur du
// Shadow DOM. Utilisation :
// <script type="module" src="js/sampler-component.js"></script>
// <audio-sampler-app></audio-sampler-app>

// Importer le composant `<audio-sampler>` (définit l'élément) et le bus
// d'événements partagé.
import './audio-sampler.js';
import { bus } from './event-bus.js';

class AudioSamplerApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    // Empêcher l'initialisation globale automatique dans `main.js`
    window.__AUDIO_SAMPLER_EMBEDDED__ = true;

    // Attendre que le custom element `audio-sampler` soit défini
    await customElements.whenDefined('audio-sampler');

    // Structure minimale attendue par `main.js` (topbar, select, containers)
    // La feuille de style globale est chargée dans le ShadowRoot pour que
    // l'apparence du composant reste cohérente.
    this.shadowRoot.innerHTML = `
    <link rel="stylesheet" href="css/styles.css">
      <div id="topbar">
        <label for="presetSelect">Preset:</label>
        <span class="select-wrapper"><select id="presetSelect" disabled>
          <option>Loading presets…</option>
        </select></span>
        <span id="status"></span>
        <label for="keyboardLayout">Layout:</label>
        <span class="select-wrapper"><select id="keyboardLayout">
          <option value="qwerty">QWERTY</option>
          <option value="azerty" selected>AZERTY</option>
        </select></span>
        <label for="themeSelect">Theme:</label>
        <span class="select-wrapper"><select id="themeSelect">
          <option value="purple-neon">Purple Neon</option>
          <option value="morning-light">Morning Light</option>
          <option value="retro-sunset">Retro Sunset</option>
          <option value="forest-emerald">Forest Emerald</option>
        </select></span>
      </div>
      
      <!-- Conteneur pour le composant d'enregistrement -->
      <div id="recorderContainer" class="recorder-container"></div>
      
      <div id="buttonsContainer"></div>
      <p class="error" id="error"></p>
    `;

    // Créer et injecter l'élément <audio-sampler> dynamiquement
    const recorderContainer = this.shadowRoot.getElementById('recorderContainer');
    const audioSamplerElement = document.createElement('audio-sampler');
    recorderContainer.appendChild(audioSamplerElement);

    // Attendre un cycle d'exécution afin que l'élément inséré soit bien
    // attaché au DOM avant d'initialiser l'application principale.
    await new Promise(resolve => setTimeout(resolve, 0));

    // Importer dynamiquement le module principal et démarrer l'application
    // à l'intérieur de ce ShadowRoot. Mettre à jour l'état visible pour
    // informer l'utilisateur pendant l'import/initialisation.
    const statusEl = this.shadowRoot.getElementById('status');
    const errorEl = this.shadowRoot.getElementById('error');
    // Ensure status / error are visually prominent in the shadow root
    if (statusEl) {
      statusEl.textContent = 'Importation du module principal...';
      statusEl.classList.add('info-message');
    }
    if (errorEl) {
      errorEl.classList.add('error');
    }
    import('./main.js').then((mod) => {
      if (statusEl) statusEl.textContent = 'Démarrage de l\'application...';

      if (typeof mod.startSampler === 'function') {
        mod.startSampler(this.shadowRoot).catch((e) => {
          console.error('startSampler failed:', e);
          if (statusEl) statusEl.textContent = 'Erreur initialisation (voir console)';
          if (errorEl) errorEl.textContent = (e && e.message) ? e.message : String(e);
        });
      } else {
        console.error('startSampler introuvable dans main.js');
        if (statusEl) statusEl.textContent = 'startSampler introuvable';
        if (errorEl) errorEl.textContent = 'startSampler non exporté par main.js';
      }
    }).catch((err) => {
      console.error('Échec import main.js:', err);
      if (statusEl) statusEl.textContent = 'Échec import du module';
      if (errorEl) errorEl.textContent = (err && err.message) ? err.message : String(err);
    });
  }

  disconnectedCallback() {
    // Lors du retrait du composant, demander au module principal d'arrêter
    // et d'effectuer le nettoyage si la fonction `stopSampler` est exportée.
    try {
      import('./main.js').then((mod) => {
        if (mod && typeof mod.stopSampler === 'function') {
          try { const p = mod.stopSampler(); if (p && typeof p.then === 'function') p.catch(() => {}); } catch (e) { /* ignore */ }
        }
      }).catch(() => {});
    } catch (e) {
      // Ignorer les erreurs d'import lors du nettoyage.
    }
  }
}

customElements.define('audio-sampler-app', AudioSamplerApp);
