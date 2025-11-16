// Web Component wrapper <audio-sampler-app>
// Ce composant encapsule l'appareil sampler complet dans un ShadowRoot et
// appelle `startSampler(shadowRoot)` exporté par `js/main.js`.
// Pour l'utiliser :
// <script type="module" src="js/sampler-component.js"></script>
// <audio-sampler-app></audio-sampler-app>

class AudioSamplerApp extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Prevent the page auto-initializer in main.js
    window.__AUDIO_SAMPLER_EMBEDDED__ = true;

    // Minimal styles + structure similar to index.html expected by main.js
    this.shadowRoot.innerHTML = `
    <link rel="stylesheet" href="css/styles.css">
      <div id="topbar">
        <label for="presetSelect">Preset:</label>
        <select id="presetSelect" disabled>
          <option>Loading presets…</option>
        </select>
        <span id="status"></span>
        <label for="keyboardLayout" style="margin-left: 1rem;">Layout:</label>
        <select id="keyboardLayout">
          <option value="qwerty">QWERTY</option>
          <option value="azerty">AZERTY</option>
        </select>
        <label for="themeSelect" style="margin-left: 1rem;">Theme:</label>
        <select id="themeSelect">
          <option value="purple-neon">Purple Neon</option>
          <option value="midnight-blue">Midnight Blue</option>
          <option value="retro-sunset">Retro Sunset</option>
          <option value="forest-emerald">Forest Emerald</option>
        </select>
      </div>
      <div id="buttonsContainer"></div>
      <p class="error" id="error"></p>
    `;

    // Dynamically import the main app and start it inside this shadowRoot
    import('./main.js').then((mod) => {
      if (typeof mod.startSampler === 'function') {
        mod.startSampler(this.shadowRoot).catch((e) => console.error('startSampler failed:', e));
      } else {
        console.error('startSampler not found in main.js');
      }
    }).catch((err) => console.error('Import main.js failed:', err));
  }
}

customElements.define('audio-sampler-app', AudioSamplerApp);
