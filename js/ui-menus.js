// ui-menus.js
// Helpers UI extraits de `main.js`.
// Dépendances injéctées via `deps`.
//
// NOTE (FR) : ce module construit des panneaux / contrôles UI qui peuvent
// créer des `blob:` URLs temporaires via `URL.createObjectURL` (par exemple
// lors de la conversion d'un AudioBuffer en WAV). Les URL créées ici sont
// destinées à être temporaires et doivent être révoquées lorsque plus
// nécessaires. La logique de révocation est déléguée aux helpers `revokeObjectUrlSafe`
// et `revokePresetBlobUrlsNotInNew` présents dans ce fichier :
// - appeler `revokeObjectUrlSafe(url)` quand vous savez que l'URL n'est plus
//   utilisée (ex : remplacement d'un sample dans un preset)
// - `revokePresetBlobUrlsNotInNew(presetIndex, newFiles)` compare les URLs
//   précédentes et nouvelles d'un preset et révoque celles qui ne sont plus
//   référencées.

import { formatSampleNameFromUrl } from './utils.js';
import { extractFileName } from './presets-manager.js';
import { isObjectUrl, getUrlFromEntry, revokeObjectUrlSafe, revokePresetBlobUrlsNotInNew, createTrackedObjectUrl } from './blob-utils.js';
import modalManager from './modal-manager.js';

export function createUIMenus(deps = {}) {
  const getCurrentRoot = deps.getCurrentRoot || (() => document);
  const presets = deps.presets || [];
  const trimPositions = deps.trimPositions;
  const loadPresetByIndex = deps.loadPresetByIndex;
  const showStatus = deps.showStatus || (() => {});
  const showError = deps.showError || (() => {});
  const getInstrumentCreatorParams = deps.getInstrumentCreatorParams;
  const createPresetFromBufferSegments = deps.createPresetFromBufferSegments;
  const createInstrumentFromSavedSample = deps.createInstrumentFromSavedSample;
  const createPresetFromSavedSampleSegments = deps.createPresetFromSavedSampleSegments;
  const createInstrumentFromBufferUrl = deps.createInstrumentFromBufferUrl;
  const openCleanupDialog = deps.openCleanupDialog || (async () => {});
  const fillPresetSelect = deps.fillPresetSelect;
  const presetSelect = deps.presetSelect;
  const formatSampleNameFn = deps.formatSampleNameFromUrl || formatSampleNameFromUrl;
  const extractFileNameFn = deps.extractFileName || extractFileName;
  // Référence vers le container créé par `createSavedSamplesUI` (pour destroy)
  let _savedSamplesContainer = null;

  // blob URL helpers imported from `js/blob-utils.js`

  // --- UI functions (concise, same behaviour as before) ---
  async function openAddSoundMenu(rootParam) {
    const currentRoot = rootParam || getCurrentRoot();
    try { showStatus && showStatus('Ouverture panneau "Ajouter un son"...'); } catch (e) {}
    let panel = currentRoot.getElementById ? currentRoot.getElementById('addSoundPanel') : currentRoot.querySelector('#addSoundPanel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div'); panel.id = 'addSoundPanel';
    panel.classList.add('modal-panel', 'add-sound-panel');

    // Header sticky
    const header = document.createElement('div');
    header.classList.add('modal-header');
    const title = document.createElement('div');
    title.textContent = 'Ajouter un son';
    title.classList.add('modal-title');
    header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.classList.add('control-btn'); closeBtn.addEventListener('click', closeAddSoundMenu); header.appendChild(closeBtn);
    panel.appendChild(header);

    // Scrollable content area
    const content = document.createElement('div');
    content.classList.add('modal-content');

    // No top quick-controls here — keep the panel content focused on samples/import
    // Grille : deux cartes de sample par ligne (mise en page gérée par le CSS)
    const grid = document.createElement('div');
    grid.classList.add('samples-grid');

    // Carte d'import (occupe la première ligne en entier)
    const importCard = document.createElement('div');
    importCard.classList.add('sample-card', 'import-card');
    // Cette carte occupe toute la ligne via la classe CSS associée
    const importBtn = document.createElement('button'); importBtn.textContent = 'Importer...'; importBtn.classList.add('control-btn'); importBtn.addEventListener('click', () => { const input = currentRoot.querySelector('input[type=file][accept="audio/*"]'); if (input) input.click(); });
    importCard.appendChild(importBtn);
    grid.appendChild(importCard);

    // Samples sauvegardés (depuis IndexedDB via le recorder du composant)
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');
    if (audioSamplerComp && audioSamplerComp.recorder) {
      try {
        const samples = await audioSamplerComp.recorder.getAllSamples();
        for (const s of samples) {
          const card = document.createElement('div');
          card.classList.add('sample-card');
          const titleS = document.createElement('div'); titleS.textContent = s.name || `Sample ${s.id}`; titleS.classList.add('sample-title'); card.appendChild(titleS);
          const addBtn = document.createElement('button'); addBtn.textContent = 'Ajouter'; addBtn.classList.add('control-btn'); addBtn.addEventListener('click', async () => { await addSavedSampleToPreset(s.id); closeAddSoundMenu(); });
          card.appendChild(addBtn); grid.appendChild(card);
        }
      } catch (e) { console.warn('Erreur lecture samples sauvegardés:', e); }
    }

    // Samples provenant des presets (liste consolidée pour ajout rapide)
    try {
      const seen = new Set();
      for (const p of presets || []) {
        if (!p || !Array.isArray(p.files)) continue;
        for (const f of p.files) {
          const url = (typeof f === 'string') ? f : f.url;
          if (!url || seen.has(url)) continue; seen.add(url);
          const card = document.createElement('div');
          card.classList.add('sample-card');
          const name = (typeof f === 'string') ? formatSampleNameFn(url) : (f.name || formatSampleNameFn(url));
          const titleEl = document.createElement('div'); titleEl.textContent = name; titleEl.classList.add('sample-title'); card.appendChild(titleEl);
          const addBtn = document.createElement('button'); addBtn.textContent = 'Ajouter'; addBtn.classList.add('control-btn'); addBtn.addEventListener('click', async () => { await addPresetSampleByUrl(url, name); closeAddSoundMenu(); });
          card.appendChild(addBtn); grid.appendChild(card);
        }
      }
    } catch (e) { console.warn('Erreur while enumerating presets samples:', e); }

    content.appendChild(grid); panel.appendChild(content);
    // Pas de contrôles fixes en bas pour ce panneau ; les contrôles globaux
    // de la page restent la source de vérité. On attache le panneau via
    // le modalManager pour garantir la visibilité et le bon stacking.
    try {
        modalManager.appendModal(panel, { id: 'addSoundPanel', root: currentRoot });
    } catch (e) {
        console.error('modalManager.appendModal failed for addSoundPanel', e);
        try { showError && showError('Impossible d\'ouvrir le panneau Ajouter un son: ' + (e && (e.message || e))); } catch (_) {}
        const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot;
        if (fallback && fallback.appendChild) fallback.appendChild(panel);
    }
  }

  function closeAddSoundMenu() {
    modalManager.removeModal('addSoundPanel');
  }

  async function openCreatePresetMenu() {
    const currentRoot = getCurrentRoot();
    try { showStatus && showStatus('Ouverture panneau "Créer preset"...'); } catch (e) {}
    let panel = currentRoot.getElementById ? currentRoot.getElementById('createPresetPanel') : currentRoot.querySelector('#createPresetPanel');
    if (panel) { panel.remove(); return; }
    panel = document.createElement('div'); panel.id = 'createPresetPanel';
    panel.classList.add('modal-panel', 'create-preset-panel');

    // En-tête sticky : titre à gauche, bouton de fermeture à droite
    const header = document.createElement('div');
    header.classList.add('modal-header');
    const title = document.createElement('div'); title.textContent = 'Créer un preset'; title.classList.add('modal-title'); header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.classList.add('control-btn'); closeBtn.addEventListener('click', () => { const p = panel; if (p && p.remove) p.remove(); }); header.appendChild(closeBtn);
    panel.appendChild(header);

    // Zone scrollable pour le contenu du panneau
    const content = document.createElement('div');
    content.classList.add('modal-content');

    function makeRowButton(text, onClick) {
      const row = document.createElement('div');
      row.classList.add('row-button');
      const label = document.createElement('div'); label.textContent = text; label.classList.add('row-label');
      const btn = document.createElement('button'); btn.textContent = 'Sélectionner'; btn.classList.add('control-btn'); btn.addEventListener('click', onClick);
      row.appendChild(label); row.appendChild(btn);
      return row;
    }

    const assembleRow = makeRowButton('Assembler des sons existants', async () => { try { await openAssemblePresetPanel(panel); } catch(e){ showError(e.message||e); } });
    content.appendChild(assembleRow);

    const splitRow = makeRowButton('Enregistrer & scinder', async () => {
      try { const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler'); if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable'); if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent.'); await createPresetFromBufferSegments(audioSamplerComp.lastAudioBuffer, 'Recording', getInstrumentCreatorParams()); modalManager.removeModal('createPresetPanel'); } catch (e) { showError('Erreur: ' + (e.message || e)); }
    });
    content.appendChild(splitRow);

    const instrRow = makeRowButton('Créer instrument (16 notes)', async () => { try { const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler'); if (!audioSamplerComp) return showError('Composant introuvable'); if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent'); const wav = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer); const url = createTrackedObjectUrl(wav); await createInstrumentFromBufferUrl(url, 'Instrument', getInstrumentCreatorParams()); modalManager.removeModal('createPresetPanel'); } catch (e) { showError('Erreur création instrument: ' + (e.message||e)); } });
    content.appendChild(instrRow);

    panel.appendChild(content);
    // Attacher via modalManager pour assurer visibilité et gestion du stacking
    try {
        modalManager.appendModal(panel, { id: 'createPresetPanel', root: currentRoot });
    } catch (e) {
        console.error('modalManager.appendModal failed for createPresetPanel', e);
        try { showError && showError('Impossible d\'ouvrir le panneau Créer preset: ' + (e && (e.message || e))); } catch (_) {}
        const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot;
        if (fallback && fallback.appendChild) fallback.appendChild(panel);
    }
  }

  async function openAssemblePresetPanel(parentPanel) {
    // Ouvre un panneau qui permet de sélectionner plusieurs samples
    // sauvegardés et de les assembler en preset.
    const currentRoot = getCurrentRoot();
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');
    if (!audioSamplerComp) return showError('Composant recorder introuvable');

    const panel = document.createElement('div');
    panel.id = 'assemblePresetPanel';
    const samples = await audioSamplerComp.recorder.getAllSamples();
    if (!samples || samples.length === 0) {
      parentPanel.appendChild(document.createTextNode('Aucun sample sauvegardé.'));
      return;
    }

    // Construire la liste de sélection
    for (const s of samples) {
      const row = document.createElement('div');
      const left = document.createElement('div');
      left.textContent = s.name || `Sample ${s.id}`;
      row.appendChild(left);
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.dataset.sampleId = s.id;
      row.appendChild(cb);
      panel.appendChild(row);
    }

    const createBtn = document.createElement('button');
    createBtn.textContent = 'Créer preset avec sélection';
    createBtn.classList.add('control-btn');
    createBtn.addEventListener('click', async () => {
      const checks = Array.from(panel.querySelectorAll('input[type=checkbox]:checked')).slice(0,16);
      if (checks.length === 0) return showError('Sélectionnez au moins un sample.');
      const files = [];
      for (const c of checks) {
        const id = Number(c.dataset.sampleId);
        const saved = await audioSamplerComp.recorder.getSample(id);
        const blobUrl = createTrackedObjectUrl(saved.blob);
        try {
          const ab = await saved.blob.arrayBuffer();
          const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(ab);
          trimPositions.set(blobUrl, { start:0, end: decoded.duration });
        } catch (e) {
          // Si le décodage échoue, on ignore la position de trim par défaut.
        }
        files.push({ url: blobUrl, name: saved.name || `sample-${id}` });
      }
      const name = prompt('Nom du preset :', 'Preset assemblé');
      const preset = { name: name || 'Preset assemblé', files, originalFiles: [] };
      presets.push(preset);
      if (fillPresetSelect) fillPresetSelect(presetSelect, presets);
      if (presetSelect) presetSelect.value = String(presets.length - 1);
      await loadPresetByIndex(presets.length - 1);
      showStatus('Preset créé (' + files.length + ' sons)');
      modalManager.removeModal('createPresetPanel');
    });
    parentPanel.appendChild(createBtn);
  }

  async function renderSavedSamplesList() {
    const currentRoot = getCurrentRoot();
    const list = currentRoot.getElementById ? currentRoot.getElementById('savedSamplesList') : currentRoot.querySelector('#savedSamplesList');
    if (!list) return;
    list.innerHTML = '';
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');
    if (!audioSamplerComp || !audioSamplerComp.recorder) return;
    const samples = await audioSamplerComp.recorder.getAllSamples();
    if (!samples || samples.length === 0) {
      const p = document.createElement('div');
      p.textContent = 'Aucun sample enregistré.';
      list.appendChild(p);
      return;
    }
    for (const s of samples) {
      const card = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = s.name || `Sample ${s.id}`;
      card.appendChild(title);
      const addBtn = document.createElement('button');
      addBtn.textContent = 'Ajouter au preset';
      addBtn.classList.add('control-btn');
      addBtn.addEventListener('click', () => addSavedSampleToPreset(s.id));
      card.appendChild(addBtn);
      list.appendChild(card);
    }
  }

  async function addSavedSampleToPreset(id) {
    const currentRoot = getCurrentRoot();
    const audioSamplerComp = currentRoot.querySelector('audio-sampler');
    if (!audioSamplerComp) return;
    try {
      const saved = await audioSamplerComp.recorder.getSample(id);
      if (!saved || !saved.blob) throw new Error('Sample introuvable');
      const blobUrl = createTrackedObjectUrl(saved.blob);
      const idx = presetSelect ? Number(presetSelect.value) || 0 : 0;
      if (!presets[idx]) presets[idx] = { name: 'Custom', files: [] };
      const files = presets[idx].files || [];
      const entry = { url: blobUrl, name: saved.name || (`sample-${id}`) };
      if (files.length < 16) {
        files.push(entry);
      } else {
        const old = files[files.length - 1];
        const oldUrl = getUrlFromEntry(old);
        if (oldUrl && isObjectUrl(oldUrl)) revokeObjectUrlSafe(oldUrl);
        files[files.length - 1] = entry;
      }
      // revoke any old blob URLs not present in the new files array
      revokePresetBlobUrlsNotInNew(presets, trimPositions, idx, files);
      presets[idx].files = files;
      await loadPresetByIndex(idx);
      showStatus('Sample ajouté au preset.');
    } catch (err) {
      showError('Erreur ajout sample: ' + (err.message || err));
    }
  }

  async function addPresetSampleByUrl(url, name) {
    try {
      const idx = presetSelect ? Number(presetSelect.value) || 0 : 0;
      if (!presets[idx]) presets[idx] = { name: 'Custom', files: [] };
      const files = presets[idx].files || [];
      const entry = { url, name: name || formatSampleNameFn(url) };
      if (files.length < 16) {
        files.push(entry);
      } else {
        const old = files[files.length - 1];
        const oldUrl = getUrlFromEntry(old);
        if (oldUrl && isObjectUrl(oldUrl)) revokeObjectUrlSafe(oldUrl);
        files[files.length - 1] = entry;
      }
      revokePresetBlobUrlsNotInNew(presets, trimPositions, idx, files);
      presets[idx].files = files;
      await loadPresetByIndex(idx);
      showStatus('Sample ajouté au preset.');
    } catch (err) {
      showError('Erreur ajout sample: ' + (err.message || err));
    }
  }

  async function onImportSoundFile(ev) { const f = ev.target.files && ev.target.files[0]; if (!f) return; const currentRoot = getCurrentRoot(); const audioSamplerComp = currentRoot.querySelector('audio-sampler'); if (!audioSamplerComp) return; try { const id = await audioSamplerComp.recorder.saveSample(f, { name: f.name }); showStatus('Sample importé et sauvegardé (id ' + id + ')'); await addSavedSampleToPreset(id); } catch (err) { showError('Erreur import fichier: ' + (err.message || err)); } finally { ev.target.value = ''; } }

  function createSavedSamplesUI() {
    const currentRoot = getCurrentRoot();
    const topbar = currentRoot.getElementById ? currentRoot.getElementById('topbar') : currentRoot.querySelector('#topbar');
    if (!topbar) return;
    // Prepare container and rows (classes defined in css/styles.css)
    const savedSamplesContainer = document.createElement('div');
    savedSamplesContainer.classList.add('saved-samples-container');
    _savedSamplesContainer = savedSamplesContainer;

    // Move the existing #status element (if present) below the topbar so it appears
    // above the control rows as requested.
    const statusEl = currentRoot.querySelector('#status');
    if (statusEl && statusEl.parentNode !== topbar.parentNode) {
      // ensure status is a direct child of the same parent so insertion works
      try { statusEl.parentNode.removeChild(statusEl); } catch (e) {}
    }
    if (statusEl) topbar.parentNode.insertBefore(statusEl, topbar.nextSibling);

    // Info message placeholder (if status element not present, create a fallback)
    const infoMessage = document.createElement('div');
    infoMessage.classList.add('info-message');
    if (!statusEl) {
      infoMessage.textContent = '';
      savedSamplesContainer.appendChild(infoMessage);
    }

    // Top row: Ajouter / Créer preset / Nettoyer
    const topRow = document.createElement('div');
    topRow.classList.add('controls-top-row');

    const addSoundBtn = document.createElement('button');
    addSoundBtn.textContent = 'Ajouter un son';
    addSoundBtn.classList.add('control-btn');
    addSoundBtn.addEventListener('click', async (ev) => { try { await openAddSoundMenu(currentRoot); } catch (e) { try { showError && showError('Ouverture menu échec: ' + (e && (e.message || e))); } catch (_) {} console.error('openAddSoundMenu failed:', e); } });
    topRow.appendChild(addSoundBtn);

    const createPresetBtn = document.createElement('button');
    createPresetBtn.textContent = 'Créer preset';
    createPresetBtn.classList.add('control-btn');
    createPresetBtn.addEventListener('click', async (ev) => { try { await openCreatePresetMenu(currentRoot); } catch (e) { try { showError && showError('Ouverture menu création preset échouée: ' + (e && (e.message || e))); } catch (_) {} console.error('openCreatePresetMenu failed', e); } });
    topRow.appendChild(createPresetBtn);

    const cleanupBtn = document.createElement('button');
    cleanupBtn.textContent = '🧹 Nettoyer';
    cleanupBtn.classList.add('control-btn');
    cleanupBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp || !audioSamplerComp.recorder) {
        showError('Composant d\'enregistrement non disponible');
        return;
      }
      await openCleanupDialog(audioSamplerComp.recorder, getCurrentRoot(), (result) => {
        if (result.success) showStatus(result.message); else showError(result.message);
      });
    });
    topRow.appendChild(cleanupBtn);

    // Bottom row: Enregistrer / Stop / Lecture / Sauvegarder
    const bottomRow = document.createElement('div');
    bottomRow.classList.add('controls-bottom-row');

    const recordBtn = document.createElement('button');
    recordBtn.textContent = '🎙️ Enregistrer';
    recordBtn.classList.add('control-btn');
    recordBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      try { await audioSamplerComp.record(); } catch (e) { showError(e.message || e); }
    });
    bottomRow.appendChild(recordBtn);

    const stopBtn = document.createElement('button');
    stopBtn.textContent = '⏹️ Stop';
    stopBtn.classList.add('control-btn');
    stopBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      try { await audioSamplerComp.stopRecording(); } catch (e) { showError(e.message || e); }
    });
    bottomRow.appendChild(stopBtn);

    const playBtn = document.createElement('button');
    playBtn.textContent = '▶️ Lecture';
    playBtn.classList.add('control-btn');
    playBtn.addEventListener('click', () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      try { audioSamplerComp.play(); } catch (e) { showError(e.message || e); }
    });
    bottomRow.appendChild(playBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Sauvegarder';
    saveBtn.classList.add('control-btn');
    saveBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
      try {
        const name = prompt('Nom du sample à sauvegarder :', 'mon-sample');
        if (!name) return;
        await audioSamplerComp.saveLast(name);
      } catch (e) { showError(e.message || e); }
    });
    bottomRow.appendChild(saveBtn);

    // Hidden file input for importing sounds
    const importSoundInput = document.createElement('input');
    importSoundInput.type = 'file';
    importSoundInput.accept = 'audio/*';
    importSoundInput.hidden = true;
    importSoundInput.addEventListener('change', onImportSoundFile);

    savedSamplesContainer.appendChild(topRow);
    savedSamplesContainer.appendChild(bottomRow);
    savedSamplesContainer.appendChild(importSoundInput);

    topbar.parentNode.insertBefore(savedSamplesContainer, topbar.nextSibling);
  }

  // Nettoie et retire les éléments UI créés par ce module
  function destroy() {
    try {
      // remove modals if any
      try { modalManager.removeModal('addSoundPanel'); } catch (e) {}
      try { modalManager.removeModal('createPresetPanel'); } catch (e) {}
      try { modalManager.removeModal('assemblePresetPanel'); } catch (e) {}
      // remove saved samples container
      if (_savedSamplesContainer && _savedSamplesContainer.parentNode) {
        _savedSamplesContainer.parentNode.removeChild(_savedSamplesContainer);
      }
      _savedSamplesContainer = null;
      // attempt to remove persistent inputs / handlers
      try {
        const root = getCurrentRoot();
        const input = root.querySelector && root.querySelector('input[type=file][accept="audio/*"]');
        if (input) {
          input.removeEventListener('change', onImportSoundFile);
        }
      } catch (e) {}
    } catch (e) {
      // swallow to avoid affecting stop flow
      console.warn('ui-menus destroy failed', e);
    }
  }

  return { openAddSoundMenu, closeAddSoundMenu, openCreatePresetMenu, openAssemblePresetPanel, renderSavedSamplesList, addSavedSampleToPreset, addPresetSampleByUrl, onImportSoundFile, createSavedSamplesUI, destroy };
}
