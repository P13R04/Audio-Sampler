/* ---------------------------------------------------------------------------
  midi-manager.js
  Gestion simple du Web MIDI API pour mapper 16 notes MIDI (standard pads)
  vers les 16 pads du sampler.

  Comportement et conventions:
  - Par défaut, on mappe la plage contiguë MIDI 36..51 (16 notes) aux pads
    logiques 0..15 (pad 0 = bottom-left). Cette plage est le choix courant
    pour les contrôleurs de type MPC/Pad (AKAI etc.).
  - Lorsqu'un message Note On (velocity > 0) est reçu pour une note dans la
    plage, on déclenche la fonction de lecture associée au pad correspondant.
  - Les pads sont indexés selon la logique du loader : padIndex 0 = bottom-left,
    padIndex augmente en parcourant la rangée suivante (left-to-right, bottom-to-top).
  - Le manager accepte un objet `keyboardManager` (ex: instance de
    `KeyboardManager`) et lit `keyboardManager.padPlayFns` pour appeler les
    fonctions de lecture. Cela évite de dupliquer la logique de mapping DOM.
  - Expose des méthodes pour démarrer/arrêter et reconfigurer la note de base.

  Usage:
    import { MidiManager } from './midi-manager.js';
    const mm = new MidiManager({ keyboardManager, baseNote: 36 });
    await mm.start();
    // ... plus tard
    mm.stop();

--------------------------------------------------------------------------- */

export class MidiManager {
  /**
   * @param {Object} opts
   * @param {Object} opts.keyboardManager - instance de KeyboardManager (lecture via padPlayFns)
   * @param {number} [opts.baseNote=36] - note MIDI de départ mappée au pad 0 (inclus)
   * @param {number} [opts.padCount=16] - nombre de pads (habituellement 16)
   */
  constructor({ keyboardManager, baseNote = 36, padCount = 16 } = {}) {
    this.keyboardManager = keyboardManager || null;
    this.baseNote = Number.isFinite(baseNote) ? baseNote : 36;
    this.padCount = Number.isInteger(padCount) && padCount > 0 ? padCount : 16;
    this.midiAccess = null;
    this.inputs = new Map();
    this._onMIDIMessage = this._onMIDIMessage.bind(this);
    this.started = false;
  }

  /** Démarre l'accès WebMIDI et branche les inputs présents */
  async start() {
    if (this.started) return;
    if (!navigator.requestMIDIAccess) {
      console.warn('Web MIDI API non disponible dans ce navigateur');
      return;
    }
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this._bindExistingInputs();
      // Se réabonner aux nouveaux inputs connectés
      this.midiAccess.onstatechange = (ev) => {
        // Rebind sur tout changement (connect/disconnect) pour garder la liste à jour
        try { this._bindExistingInputs(); } catch (e) { console.warn('midi statechange bind failed', e); }
      };
      this.started = true;
    } catch (err) {
      console.warn('Erreur requestMIDIAccess:', err);
    }
  }

  /** Arrête et détache tous les inputs */
  stop() {
    if (!this.started) return;
    try {
      for (const input of Array.from(this.inputs.values())) {
        try { input.onmidimessage = null; } catch (e) {}
      }
      this.inputs.clear();
      if (this.midiAccess) this.midiAccess.onstatechange = null;
    } catch (e) { console.warn('MidiManager.stop failed', e); }
    this.midiAccess = null;
    this.started = false;
  }

  /** Met à jour la note de base utilisée pour le mapping MIDI -> padIndex */
  setBaseNote(n) {
    if (!Number.isInteger(n)) return;
    this.baseNote = n;
  }

  /** Liste les inputs MIDI détectés */
  listInputs() {
    if (!this.midiAccess) return [];
    return Array.from(this.midiAccess.inputs.values()).map(i => ({ id: i.id, name: i.name }));
  }

  _bindExistingInputs() {
    if (!this.midiAccess) return;
    // Détacher handlers précédents
    for (const input of Array.from(this.inputs.values())) {
      try { input.onmidimessage = null; } catch (e) {}
    }
    this.inputs.clear();

    for (const input of this.midiAccess.inputs.values()) {
      try {
        input.onmidimessage = this._onMIDIMessage;
        this.inputs.set(input.id, input);
      } catch (e) {
        console.warn('Failed to bind MIDI input', e);
      }
    }
  }

  /**
   * Handler principal des messages MIDI
   * - supporte Note On (0x90) et Note Off (0x80). Certaines interfaces
   *   envoient NoteOn velocity=0 pour simuler NoteOff; nous traitons cela.
   */
  _onMIDIMessage(ev) {
    try {
      const data = ev.data; // Uint8Array [status, data1, data2]
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const channel = data[0] & 0x0f;
      const note = data[1];
      const velocity = data[2];

      if (status === 0x90 && velocity > 0) {
        // Note On
        this._handleNoteOn(note, velocity, channel);
      } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
        // Note Off
        this._handleNoteOff(note, velocity, channel);
      }
    } catch (e) { console.warn('midi message handler error', e); }
  }

  _handleNoteOn(note, velocity, channel) {
    const padIndex = note - this.baseNote;
    if (padIndex < 0 || padIndex >= this.padCount) return;
    // Convert logical padIndex (0..15, bottom-left origin) to displayIndex
    const cols = 4, rows = Math.ceil(this.padCount / cols);
    const rowFromBottom = Math.floor(padIndex / cols);
    const col = padIndex % cols;
    const visualRow = (rows - 1 - rowFromBottom);
    const displayIndex = visualRow * cols + col;

    const fns = (this.keyboardManager && Array.isArray(this.keyboardManager.padPlayFns)) ? this.keyboardManager.padPlayFns : null;
    if (fns && typeof fns[displayIndex] === 'function') {
      try { fns[displayIndex](); } catch (e) { console.warn('padPlayFn failed', e); }
    }
  }

  _handleNoteOff(note, velocity, channel) {
    // Pour l'instant on ne gère pas l'arrêt (les pads jouent des samples one-shot).
    // Si un futur support stop est ajouté, on peut appeler padStopFns[displayIndex].
  }
}

export default MidiManager;
