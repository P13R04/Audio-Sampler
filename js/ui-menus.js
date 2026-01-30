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
  const exportPresetToFile = deps.exportPresetToFile;
  const savePresetToLocalStorage = deps.savePresetToLocalStorage;
  const importPresetFromFile = deps.importPresetFromFile;
  const fillPresetSelect = deps.fillPresetSelect;
  const presetSelect = deps.presetSelect;
  const getCurrentPresetIndex = deps.getCurrentPresetIndex;
  const updateOrCreatePreset = deps.updateOrCreatePreset;
  const formatSampleNameFn = deps.formatSampleNameFromUrl || formatSampleNameFromUrl;
  const extractFileNameFn = deps.extractFileName || extractFileName;
  // Référence vers le container créé par createSavedSamplesUI (pour destroy)
  let _savedSamplesContainer = null;

  // Helpers d'URL blob importés depuis js/blob-utils.js

  // --- Fonctions UI (concises, même comportement qu'avant) ---
  function activePresetIndex() {
    // TOUJOURS utiliser getCurrentPresetIndex en priorité car c'est la source de vérité
    // (currentPresetIndex dans main.js est mis à jour par loadPresetByIndex)
    if (typeof getCurrentPresetIndex === 'function') {
      const val = getCurrentPresetIndex();
      if (typeof val === 'number' && !isNaN(val)) return val;
    }
    // Fallback sur presetSelect.value seulement si getCurrentPresetIndex n'est pas disponible
    if (presetSelect && presetSelect.value != null && presetSelect.value !== '') {
      const val = Number(presetSelect.value);
      if (!isNaN(val)) return val;
    }
    return 0;
  }
  // Helper simple de saisie de texte modal utilisant modalManager.
  let _modalPromptCounter = 1;
  function openTextInputModal({ title = 'Saisir un texte', placeholder = '', defaultValue = '' } = {}) {
    return new Promise((resolve) => {
      const currentRoot = getCurrentRoot();
      const id = 'text-input-modal-' + (_modalPromptCounter++);
      const panel = document.createElement('div');
      panel.id = id;
      panel.classList.add('modal-panel', 'text-input-modal');

      const header = document.createElement('div'); header.classList.add('modal-header');
      const titleEl = document.createElement('div'); titleEl.classList.add('modal-title'); titleEl.textContent = title; header.appendChild(titleEl);
      const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.classList.add('control-btn');
      closeBtn.addEventListener('click', () => { try { modalManager.removeModal(id); } catch (e) {} resolve(null); });
      header.appendChild(closeBtn);
      panel.appendChild(header);

      const content = document.createElement('div'); content.classList.add('modal-content');
      const input = document.createElement('input'); input.type = 'text'; input.classList.add('text-input'); input.placeholder = placeholder || '';
      input.value = defaultValue || '';
      input.style.width = '100%';
      content.appendChild(input);

      const btnRow = document.createElement('div'); btnRow.classList.add('row-button');
      const ok = document.createElement('button'); ok.textContent = 'OK'; ok.classList.add('control-btn');
      const cancel = document.createElement('button'); cancel.textContent = 'Annuler'; cancel.classList.add('control-btn');
      btnRow.appendChild(cancel); btnRow.appendChild(ok);
      content.appendChild(btnRow);
      panel.appendChild(content);

      ok.addEventListener('click', () => { const v = String(input.value || '').trim(); try { modalManager.removeModal(id); } catch (e) {} resolve(v === '' ? '' : v); });
      cancel.addEventListener('click', () => { try { modalManager.removeModal(id); } catch (e) {} resolve(null); });
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); ok.click(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel.click(); }
      });

      try { modalManager.appendModal(panel, { id, root: currentRoot }); } catch (e) { const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot; if (fallback && fallback.appendChild) fallback.appendChild(panel); }
      // autofocus the input
      setTimeout(() => { try { input.focus(); input.select(); } catch (e) {} }, 50);
    });
  }

  // Modal simple pour sélectionner une option dans une liste
  function openSelectModal({ title = 'Choisir', options = [] } = {}) {
    return new Promise((resolve) => {
      const id = 'selectModal-' + Math.random().toString(36).slice(2, 8);
      const panel = document.createElement('div');
      panel.className = 'modal-panel select-modal';
      const h = document.createElement('h3'); h.textContent = title; panel.appendChild(h);
      const sel = document.createElement('select');
      sel.style.width = '100%';
      for (const o of options) {
        const opt = document.createElement('option'); opt.value = o; opt.textContent = o; sel.appendChild(opt);
      }
      panel.appendChild(sel);
      const btns = document.createElement('div'); btns.className = 'modal-buttons';
      const ok = document.createElement('button'); ok.textContent = 'OK';
      const cancel = document.createElement('button'); cancel.textContent = 'Annuler';
      btns.appendChild(ok); btns.appendChild(cancel); panel.appendChild(btns);
      ok.addEventListener('click', () => { try { modalManager.removeModal(id); } catch (e) {} resolve(sel.value); });
      cancel.addEventListener('click', () => { try { modalManager.removeModal(id); } catch (e) {} resolve(null); });
      try { modalManager.appendModal(panel, { id, root: currentRoot }); } catch (e) { const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot; if (fallback && fallback.appendChild) fallback.appendChild(panel); }
    });
  }
  async function openAddSoundMenu(rootParam) {
    const currentRoot = rootParam || getCurrentRoot();
    try { showStatus && showStatus('Ouverture panneau "Charger un son"...'); } catch (e) {}
    let panel = currentRoot.getElementById ? currentRoot.getElementById('addSoundPanel') : currentRoot.querySelector('#addSoundPanel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div'); panel.id = 'addSoundPanel';
    panel.classList.add('modal-panel', 'add-sound-panel');

    // Header sticky
    const header = document.createElement('div');
    header.classList.add('modal-header');
    const title = document.createElement('div');
    title.textContent = 'Charger un son';
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
          // Charger dans la zone d'enregistrement
          const loadBtn = document.createElement('button'); loadBtn.textContent = 'Charger'; loadBtn.classList.add('control-btn');
          loadBtn.addEventListener('click', async () => {
            try {
              const saved = await audioSamplerComp.recorder.getSample(s.id);
              if (!saved || !saved.blob) throw new Error('Sample introuvable');
              const ab = await saved.blob.arrayBuffer();
              const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(ab);
              audioSamplerComp.lastAudioBuffer = decoded;
              audioSamplerComp.lastBlob = saved.blob;
              try { if (audioSamplerComp.$status) audioSamplerComp.$status.textContent = 'Sample chargé — ' + (saved.name || s.id); } catch (e) {}
              try { if (audioSamplerComp._renderWave) audioSamplerComp._renderWave(decoded.getChannelData(0)); } catch (e) {}
              try { if (audioSamplerComp.$play) audioSamplerComp.$play.disabled = false; } catch (e) {}
              try { if (audioSamplerComp.$save) audioSamplerComp.$save.disabled = false; } catch (e) {}
              try { audioSamplerComp.dispatchEvent(new CustomEvent('sampleloaded', { detail: { id: s.id, name: saved.name } })); } catch (e) {}
              closeAddSoundMenu();
            } catch (err) { showError('Erreur chargement sample: ' + (err && err.message || err)); }
          });
          card.appendChild(loadBtn);

          // only provide a single 'Charger' action in this panel — adding to
          // the preset is done via the main UI (bouton 'Ajouter au preset')
          grid.appendChild(card);
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
          const loadBtn = document.createElement('button'); loadBtn.textContent = 'Charger'; loadBtn.classList.add('control-btn');
          loadBtn.addEventListener('click', async () => {
            try {
              const resp = await fetch(url);
              const ab = await resp.arrayBuffer();
              const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(ab);
              audioSamplerComp.lastAudioBuffer = decoded;
              // create a wav blob for saving/playback parity
              try { audioSamplerComp.lastBlob = audioSamplerComp.recorder.audioBufferToWavBlob(decoded); } catch (e) { audioSamplerComp.lastBlob = null; }
              try { if (audioSamplerComp.$status) audioSamplerComp.$status.textContent = 'Sample chargé — ' + name; } catch (e) {}
              try { if (audioSamplerComp._renderWave) audioSamplerComp._renderWave(decoded.getChannelData(0)); } catch (e) {}
              try { if (audioSamplerComp.$play) audioSamplerComp.$play.disabled = false; } catch (e) {}
              try { if (audioSamplerComp.$save) audioSamplerComp.$save.disabled = false; } catch (e) {}
              try { audioSamplerComp.dispatchEvent(new CustomEvent('sampleloaded', { detail: { url, name } })); } catch (e) {}
              closeAddSoundMenu();
            } catch (err) { showError('Erreur chargement sample: ' + (err && err.message || err)); }
          });
          card.appendChild(loadBtn);
          grid.appendChild(card);
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

  // Ouvre un panneau permettant de parcourir les presets chargés et
  // d'en charger un (ou d'importer un preset depuis un fichier local).
  async function openLoadPresetMenu(rootParam) {
    const currentRoot = rootParam || getCurrentRoot();
    try { showStatus && showStatus('Ouverture panneau "Charger un preset"...'); } catch (e) {}
    let panel = currentRoot.getElementById ? currentRoot.getElementById('loadPresetPanel') : currentRoot.querySelector('#loadPresetPanel');
    if (panel) { panel.remove(); return; }

    panel = document.createElement('div'); panel.id = 'loadPresetPanel';
    panel.classList.add('modal-panel', 'load-preset-panel');

    const header = document.createElement('div'); header.classList.add('modal-header');
    const title = document.createElement('div'); title.textContent = 'Charger un preset'; title.classList.add('modal-title'); header.appendChild(title);
    const closeBtn = document.createElement('button'); closeBtn.textContent = '✕'; closeBtn.classList.add('control-btn'); closeBtn.addEventListener('click', () => { const p = panel; if (p && p.remove) p.remove(); }); header.appendChild(closeBtn);
    panel.appendChild(header);

    const content = document.createElement('div'); content.classList.add('modal-content');

    // Import en haut
    const importRow = document.createElement('div'); importRow.classList.add('row-button');
    const importBtn = document.createElement('button'); importBtn.textContent = 'Importer...'; importBtn.classList.add('control-btn');
    importBtn.addEventListener('click', () => {
      const inp = currentRoot.querySelector && currentRoot.querySelector('input[type=file][accept=".json,application/json"]');
      if (inp) inp.click();
    });
    importRow.appendChild(importBtn);
    content.appendChild(importRow);

    // Liste des presets chargés
    const list = document.createElement('div'); list.classList.add('presets-list');
    for (let i = 0; i < (presets && presets.length ? presets.length : 0); i++) {
      const p = presets[i];
      const row = document.createElement('div'); row.classList.add('sample-card');
      const name = document.createElement('div'); name.classList.add('sample-title'); name.textContent = p && p.name ? p.name : `Preset ${i+1}`;
      row.appendChild(name);
      const btn = document.createElement('button'); btn.classList.add('control-btn'); btn.textContent = 'Charger';
      btn.addEventListener('click', async () => {
        try {
          await loadPresetByIndex(i);
          try { showStatus && showStatus('Preset chargé: ' + (p && p.name || i)); } catch (e) {}
          panel.remove();
        } catch (err) { showError && showError('Erreur chargement preset: ' + (err && err.message || err)); }
      });
      row.appendChild(btn);
      list.appendChild(row);
    }
    content.appendChild(list);
    panel.appendChild(content);
    try { modalManager.appendModal(panel, { id: 'loadPresetPanel', root: currentRoot }); } catch (e) { const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot; if (fallback && fallback.appendChild) fallback.appendChild(panel); }
  }

  function closeAddSoundMenu() {
    modalManager.removeModal('addSoundPanel');
  }

  async function openFreesoundBrowser() {
    const currentRoot = getCurrentRoot();
    const id = 'freesoundPanel';
    
    // Vérifier si API key est configurée
    let apiKey = localStorage.getItem('freesound_api_key') || '';
    
    const panel = document.createElement('div');
    panel.id = id;
    panel.classList.add('modal-panel', 'freesound-browser');

    const header = document.createElement('div');
    header.classList.add('modal-header');
    const titleEl = document.createElement('div');
    titleEl.classList.add('modal-title');
    titleEl.textContent = '🔊 Freesound Browser';
    header.appendChild(titleEl);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.classList.add('control-btn');
    closeBtn.addEventListener('click', () => { modalManager.removeModal(id); });
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const content = document.createElement('div');
    content.classList.add('modal-content', 'freesound-content');

    // Configuration API key
    if (!apiKey) {
      const configSection = document.createElement('div');
      configSection.classList.add('freesound-config');
      
      const infoText = document.createElement('p');
      infoText.textContent = 'Pour utiliser Freesound, obtenez une clé API gratuite:';
      configSection.appendChild(infoText);
      
      const linkBtn = document.createElement('a');
      linkBtn.href = 'https://freesound.org/api/apply/';
      linkBtn.textContent = 'Obtenir une clé API ›';
      linkBtn.target = '_blank';
      linkBtn.classList.add('freesound-link');
      configSection.appendChild(linkBtn);
      
      const keyInput = document.createElement('input');
      keyInput.type = 'password';
      keyInput.placeholder = 'Coller votre clé API';
      keyInput.classList.add('text-input', 'freesound-input');
      configSection.appendChild(keyInput);
      
      const saveKeyBtn = document.createElement('button');
      saveKeyBtn.textContent = 'Sauvegarder clé';
      saveKeyBtn.classList.add('control-btn', 'freesound-btn');
      saveKeyBtn.addEventListener('click', () => {
        const key = keyInput.value.trim();
        if (!key) {
          showError('Veuillez entrer une clé API');
          return;
        }
        apiKey = key;
        localStorage.setItem('freesound_api_key', key);
        showStatus('Clé API sauvegardée');
        configSection.style.display = 'none';
        searchSection.style.display = 'block';
      });
      configSection.appendChild(saveKeyBtn);
      content.appendChild(configSection);
    }

    // Section de recherche
    const searchSection = document.createElement('div');
    searchSection.classList.add('freesound-search');
    if (!apiKey) searchSection.style.display = 'none';
    
    const queryInput = document.createElement('input');
    queryInput.type = 'text';
    queryInput.placeholder = 'Chercher un son (ex: "drum", "bell")...';
    queryInput.classList.add('text-input', 'freesound-input');
    searchSection.appendChild(queryInput);
    
    const searchBtn = document.createElement('button');
    searchBtn.textContent = '🔍 Chercher';
    searchBtn.classList.add('control-btn', 'freesound-btn');
    searchSection.appendChild(searchBtn);
    
    const resultsDiv = document.createElement('div');
    resultsDiv.classList.add('freesound-results');
    searchSection.appendChild(resultsDiv);
    
    content.appendChild(searchSection);

    // Logique de recherche
    searchBtn.addEventListener('click', async () => {
      const query = queryInput.value.trim();
      if (!query) {
        showError('Entrez un terme de recherche');
        return;
      }
      if (!apiKey) {
        showError('Clé API non configurée');
        return;
      }

      searchBtn.disabled = true;
      searchBtn.textContent = '⏳ Recherche...';
      resultsDiv.innerHTML = '';

      try {
        // Appel API Freesound
        const url = new URL('https://freesound.org/apiv2/search/text/');
        url.searchParams.append('query', query);
        url.searchParams.append('fields', 'id,name,previews');
        url.searchParams.append('filter', 'duration:[0 TO 30]');
        url.searchParams.append('page_size', '20');

        const headers = apiKey ? { 'Authorization': 'Token ' + apiKey } : {};
        const response = await fetch(url.toString(), { headers });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Clé API invalide. Vérifiez votre clé sur https://freesound.org/api/credentials/');
          }
          if (response.status === 404) {
            throw new Error('Aucun résultat trouvé pour "' + query + '"');
          }
          if (response.status === 429) {
            throw new Error('Trop de requêtes. Attendez quelques secondes et réessayez.');
          }
          throw new Error(`Erreur API (${response.status}): ${response.statusText}`);
        }

        const data = await response.json();
        const sounds = data.results || [];

        if (sounds.length === 0) {
          resultsDiv.textContent = 'Aucun résultat trouvé';
          return;
        }

        // Afficher les résultats
        for (const sound of sounds) {
          const card = document.createElement('div');
          card.classList.add('freesound-sound-card');

          const nameEl = document.createElement('div');
          nameEl.classList.add('freesound-sound-name');
          nameEl.textContent = sound.name;
          card.appendChild(nameEl);

          const infoEl = document.createElement('div');
          infoEl.classList.add('freesound-sound-info');
          infoEl.textContent = sound.id ? `ID: ${sound.id}` : 'Son Freesound';
          card.appendChild(infoEl);

          const btnRow = document.createElement('div');
          btnRow.classList.add('freesound-btn-row');

          // Bouton Préview
          if (sound.previews && sound.previews['preview-hq-mp3']) {
            const previewBtn = document.createElement('button');
            previewBtn.textContent = '▶️ Preview';
            previewBtn.classList.add('control-btn', 'freesound-btn');
            previewBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              const audio = new Audio(sound.previews['preview-hq-mp3']);
              audio.play();
            });
            btnRow.appendChild(previewBtn);
          }

          // Bouton Charger
          const loadBtn = document.createElement('button');
          loadBtn.textContent = '⬇️ Charger';
          loadBtn.classList.add('control-btn', 'freesound-btn');
          loadBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            loadBtn.disabled = true;
            loadBtn.textContent = '⏳...';
            
            try {
              const audioSamplerComp = currentRoot.querySelector('audio-sampler');
              if (!audioSamplerComp) {
                showError('Composant sampler non trouvé');
                return;
              }

              // Télécharger le preview
              if (!sound.previews || !sound.previews['preview-hq-mp3']) {
                throw new Error('Préview non disponible');
              }

              const response = await fetch(sound.previews['preview-hq-mp3']);
              if (!response.ok) throw new Error('Erreur de téléchargement');
              
              const arrayBuffer = await response.arrayBuffer();
              const decoded = await audioSamplerComp.recorder.audioContext.decodeAudioData(arrayBuffer);
              
              audioSamplerComp.lastAudioBuffer = decoded;
              audioSamplerComp.lastBlob = audioSamplerComp.recorder.audioBufferToWavBlob(decoded);
              
              if (audioSamplerComp.$status) {
                audioSamplerComp.$status.textContent = `Sample chargé — ${sound.name}`;
              }
              if (audioSamplerComp._renderWave) {
                audioSamplerComp._renderWave(decoded.getChannelData(0));
              }
              if (audioSamplerComp.$play) audioSamplerComp.$play.disabled = false;
              if (audioSamplerComp.$save) audioSamplerComp.$save.disabled = false;
              
              try {
                audioSamplerComp.dispatchEvent(new CustomEvent('sampleloaded', {
                  detail: { url: sound.previews['preview-hq-mp3'], name: sound.name }
                }));
              } catch (e) {}

              showStatus(`Sample "${sound.name}" chargé`);
              modalManager.removeModal(id);
            } catch (err) {
              showError('Erreur chargement: ' + (err && err.message || err));
              loadBtn.disabled = false;
              loadBtn.textContent = '⬇️ Charger';
            }
          });
          btnRow.appendChild(loadBtn);

          // Lien téléchargement fichier complet
          if (apiKey && sound.id) {
            const dlUrl = `https://freesound.org/apiv2/sounds/${sound.id}/download/?token=${encodeURIComponent(apiKey)}`;
            const dlLink = document.createElement('a');
            dlLink.href = dlUrl;
            dlLink.textContent = '⬇️';
            dlLink.target = '_blank';
            dlLink.title = 'Télécharger le fichier complet';
            dlLink.classList.add('freesound-link');
            dlLink.style.alignSelf = 'center';
            dlLink.style.marginLeft = 'auto';
            btnRow.appendChild(dlLink);
          }

          card.appendChild(btnRow);
          resultsDiv.appendChild(card);
        }
      } catch (error) {
        showError('Erreur recherche Freesound: ' + (error && error.message || error));
        console.error('Freesound search error:', error);
      } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 Chercher';
      }
    });

    // Allowenter key pour chercher
    queryInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') searchBtn.click();
    });

    panel.appendChild(content);

    try {
      modalManager.appendModal(panel, { id, root: currentRoot });
    } catch (e) {
      const fallback = (currentRoot instanceof Document) ? currentRoot.body : currentRoot;
      if (fallback && fallback.appendChild) fallback.appendChild(panel);
    }
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

    const emptyRow = makeRowButton('Preset vide', async () => {
      try {
        const input = await openTextInputModal({ title: 'Nom du preset vide', placeholder: 'Preset vide', defaultValue: 'Preset vide' });
        const presetName = (input === null) ? null : String(input);
        const preset = { name: presetName || 'Preset vide', files: [], originalFiles: [] };
        // Push into runtime, then persist via updateOrCreatePreset wrapper so it
        // is created directly in localStorage (and IndexedDB for samples)
        presets.push(preset);
        const newIdx = presets.length - 1;
        if (typeof updateOrCreatePreset === 'function') {
          // This will create a user preset and replace the runtime entry
          const res = await updateOrCreatePreset(newIdx, preset.name);
          try {
            if (res && typeof res.index === 'number') {
              if (typeof fillPresetSelect === 'function') fillPresetSelect(presetSelect, presets);
              if (presetSelect) presetSelect.value = String(res.index);
            }
          } catch (e) {}
        } else {
          // Fallback: just load the newly created runtime preset
          if (fillPresetSelect) fillPresetSelect(presetSelect, presets);
          if (presetSelect) presetSelect.value = String(newIdx);
          await loadPresetByIndex(newIdx);
        }
        showStatus('Preset vide créé');
        modalManager.removeModal('createPresetPanel');
      } catch (e) { showError('Erreur création preset vide: ' + (e && (e.message || e))); }
    });
    content.appendChild(emptyRow);

    const splitRow = makeRowButton('Enregistrer & scinder', async () => {
      try {
        const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
        if (!audioSamplerComp) return showError('Composant d\'enregistrement introuvable');
        if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent.');
        const input = await openTextInputModal({ title: 'Nom du preset scindé', placeholder: 'Recording', defaultValue: 'Recording' });
        if (input === null || String(input).trim() === '') return;
        await createPresetFromBufferSegments(audioSamplerComp.lastAudioBuffer, String(input).trim(), getInstrumentCreatorParams());
        modalManager.removeModal('createPresetPanel');
      } catch (e) { showError('Erreur: ' + (e.message || e)); }
    });
    content.appendChild(splitRow);

    // Liste d'instruments/modes disponibles (chaque entrée crée un instrument 16 notes)
    const INSTRUMENT_MODES = [
      { key: 'chromatic', label: 'Chromatique (16 demi-tons consécutifs)' },
      { key: 'whole', label: 'Par tons entiers' },
      { key: 'major', label: 'Gamme Majeure' },
      { key: 'minor', label: 'Gamme Mineure (naturelle)' },
      { key: 'harmonicMinor', label: 'Mineure harmonique' },
      { key: 'mixolydian', label: 'Mixolydien' },
      { key: 'lydian', label: 'Lydien' },
      { key: 'pentatonicMajor', label: 'Pentatonique Majeur' },
      { key: 'pentatonicMinor', label: 'Pentatonique Mineur' }
    ];

    for (const m of INSTRUMENT_MODES) {
      const row = makeRowButton(`Créer instrument — ${m.label}`, async () => {
        try {
          const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
          if (!audioSamplerComp) return showError('Composant introuvable');
          if (!audioSamplerComp.lastAudioBuffer) return showError('Aucun enregistrement récent');
          const input = await openTextInputModal({ title: `Nom de l\'instrument (${m.label})`, placeholder: 'Instrument', defaultValue: 'Instrument' });
          if (input === null || String(input).trim() === '') return;
          const wav = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
          const url = createTrackedObjectUrl(wav);
          const params = Object.assign({}, getInstrumentCreatorParams(), { scale: m.key });
          await createInstrumentFromBufferUrl(url, String(input).trim(), params);
          modalManager.removeModal('createPresetPanel');
        } catch (e) { showError('Erreur création instrument: ' + (e.message||e)); }
      });
      content.appendChild(row);
    }

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
      const input = await openTextInputModal({ title: 'Nom du preset', placeholder: 'Preset assemblé', defaultValue: 'Preset assemblé' });
      const presetName = (input === null) ? null : String(input);
      const preset = { name: presetName || 'Preset assemblé', files, originalFiles: [] };
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
      const idx = activePresetIndex();
      if (!presets[idx]) presets[idx] = { name: 'Custom', files: [] };
      const files = presets[idx].files || [];
      const entry = { url: blobUrl, name: saved.name || (`sample-${id}`), _sampleId: id };
      if (files.length < 16) {
        files.push(entry);
      } else {
        const old = files[files.length - 1];
        const oldUrl = getUrlFromEntry(old);
        if (oldUrl && isObjectUrl(oldUrl)) revokeObjectUrlSafe(oldUrl);
        files[files.length - 1] = entry;
      }
      // Révoquer les anciennes URL blob qui ne sont pas dans le nouveau tableau
      revokePresetBlobUrlsNotInNew(presets, trimPositions, idx, files);
      presets[idx].files = files;
      
      // Recharger le preset modifié (modification temporaire, pas de sauvegarde auto)
      await loadPresetByIndex(idx);
      showStatus('Sample ajouté au preset (non sauvegardé).');
    } catch (err) {
      showError('Erreur ajout sample: ' + (err.message || err));
    }
  }

  async function addPresetSampleByUrl(url, name) {
    try {
      const idx = activePresetIndex();
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
      
      // Recharger le preset modifié (modification temporaire, pas de sauvegarde auto)
      await loadPresetByIndex(idx);
      showStatus('Sample ajouté au preset (non sauvegardé).');
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
    addSoundBtn.textContent = 'Charger un son';
    addSoundBtn.classList.add('control-btn');
    addSoundBtn.addEventListener('click', async (ev) => { try { await openAddSoundMenu(currentRoot); } catch (e) { try { showError && showError('Ouverture menu échec: ' + (e && (e.message || e))); } catch (_) {} console.error('openAddSoundMenu failed:', e); } });
    // Bouton pour ouvrir le panneau de chargement de presets (nouveau)
    const loadPresetBtn = document.createElement('button');
    loadPresetBtn.textContent = 'Charger un preset';
    loadPresetBtn.classList.add('control-btn');
    loadPresetBtn.addEventListener('click', async () => { try { await openLoadPresetMenu(currentRoot); } catch (e) { try { showError && showError('Ouverture panneau presets échouée: ' + (e && e.message || e)); } catch (_) {} console.error('openLoadPresetMenu failed', e); } });
    topRow.appendChild(loadPresetBtn);

    topRow.appendChild(addSoundBtn);

    const createPresetBtn = document.createElement('button');
    createPresetBtn.textContent = 'Créer preset';
    createPresetBtn.classList.add('control-btn');
    createPresetBtn.addEventListener('click', async (ev) => { try { await openCreatePresetMenu(currentRoot); } catch (e) { try { showError && showError('Ouverture menu création preset échouée: ' + (e && (e.message || e))); } catch (_) {} console.error('openCreatePresetMenu failed', e); } });
    topRow.appendChild(createPresetBtn);

    const freesoundBtn = document.createElement('button');
    freesoundBtn.textContent = '🔊 Freesound';
    freesoundBtn.classList.add('control-btn');
    freesoundBtn.addEventListener('click', async (ev) => { try { await openFreesoundBrowser(currentRoot); } catch (e) { try { showError && showError('Erreur Freesound: ' + (e && (e.message || e))); } catch (_) {} console.error('openFreesoundBrowser failed', e); } });
    topRow.appendChild(freesoundBtn);

    // Bouton pour sauvegarder le preset courant (update/create)
    // Le bouton sera ajouté après sa création ci-dessous.

    // Bouton pour télécharger le preset courant (export JSON + stockage local)
    const savePresetBtn = document.createElement('button');
    savePresetBtn.textContent = '⬇️ Télécharger le preset';
    savePresetBtn.classList.add('control-btn');
    savePresetBtn.addEventListener('click', async () => {
      try {
        const idx = activePresetIndex();
        if (typeof savePresetToLocalStorage === 'function') {
          await savePresetToLocalStorage(idx);
          try { showStatus && showStatus('Preset sauvegardé localement.'); } catch (e) {}
        }
        if (typeof exportPresetToFile === 'function') {
          await exportPresetToFile(idx);
        }
      } catch (e) { showError && showError('Erreur sauvegarde preset: ' + (e && e.message || e)); }
    });
    // NOTE : l'ajout de savePresetBtn est fait après updatePresetBtn
    // pour que l'ordre visuel soit : cleanup / update (save) / download

    // Bouton pour mettre à jour ou créer le preset courant dans localStorage / IndexedDB
    const updatePresetBtn = document.createElement('button');
    updatePresetBtn.textContent = '💾  sauvegarder preset';
    updatePresetBtn.classList.add('control-btn');
    updatePresetBtn.addEventListener('click', async () => {
      try {
        const idx = activePresetIndex();
        if (typeof updateOrCreatePreset !== 'function') return showError && showError('Fonction mise à jour du preset non disponible.');
        const current = (presets && presets[idx] && presets[idx].name) ? presets[idx].name : 'preset';
        // If the preset appears to be a local/user preset, update it silently
        const runtimePreset = presets && presets[idx] ? presets[idx] : null;
        let res;
        if (runtimePreset && runtimePreset._fromUser) {
          // Update existing user preset without asking for a name
          res = await updateOrCreatePreset(idx, null);
        } else {
          // Creating from an API/remote preset: ask for a name (default: "<name> - modified")
          const suggested = `${current} - modified`;
          const input = await openTextInputModal({ title: 'Nom du preset à sauvegarder', placeholder: suggested, defaultValue: suggested });
          // If user cancelled, abort
          if (input === null) return;
          const nameToUse = (String(input || '').trim() === '') ? null : String(input).trim();
          res = await updateOrCreatePreset(idx, nameToUse);
        }
        // Show feedback: if new name returned, display it and sync select
        try {
          if (res && res.name) showStatus && showStatus('Preset sauvegardé: ' + res.name);
          else showStatus && showStatus('Preset mis à jour.');
        } catch (e) {}
        try {
          if (res && typeof res.index === 'number') {
            if (typeof fillPresetSelect === 'function') fillPresetSelect(presetSelect, presets);
            if (presetSelect) presetSelect.value = String(res.index);
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        showError && showError('Erreur mise à jour preset: ' + (e && (e.message || e)));
      }
    });
    topRow.appendChild(updatePresetBtn);

    // Ajouter le bouton download après le bouton update pour respecter l'ordre demandé
    topRow.appendChild(savePresetBtn);

    // Import preset depuis un fichier local
    const importPresetInput = document.createElement('input');
    importPresetInput.type = 'file';
    importPresetInput.accept = '.json,application/json';
    importPresetInput.hidden = true;
    importPresetInput.addEventListener('change', async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        if (typeof importPresetFromFile === 'function') {
          await importPresetFromFile(f);
          try { showStatus && showStatus('Preset importé.'); } catch (e) {}
        }
      } catch (err) { showError && showError('Erreur import preset: ' + (err && err.message || err)); }
      finally { ev.target.value = ''; }
    });
    // Note: l'import de preset est accessible depuis le panneau "Charger un preset"
    // via le bouton 'Importer...' en haut du panneau. Nous ne créons pas de
    // bouton séparé ici pour éviter la duplication.

    // Supprimer le select visible du preset courant pour centraliser le choix
    try {
      const root = getCurrentRoot();
      const sel = root.querySelector && root.querySelector('#presetSelect');
      if (sel && sel.parentNode) {
        sel.parentNode.removeChild(sel);
      }
    } catch (e) { /* ignore */ }

    // Place the recording detection selector in the topbar (avec les autres sélecteurs)
    try {
      // create a plain label (text) matching other topbar labels
      const detectionLabel = document.createElement('label');
      detectionLabel.setAttribute('for', 'detectionSelect');
      detectionLabel.textContent = 'Détection :';
      detectionLabel.classList.add('topbar-label');
      try { topbar.appendChild(detectionLabel); } catch (e) { /* ignore DOM insertion errors */ }

      // create the select inside a .select-wrapper so it matches visual style
      const detectionWrapper = document.createElement('span');
      detectionWrapper.classList.add('select-wrapper');
      const detectionSelect = document.createElement('select');
      detectionSelect.id = 'detectionSelect';
      detectionSelect.classList.add('detection-select');
      const optCalm = document.createElement('option'); optCalm.value = 'calm'; optCalm.textContent = 'Calme';
      const optNoisy = document.createElement('option'); optNoisy.value = 'noisy'; optNoisy.textContent = 'Bruyant';
      detectionSelect.appendChild(optCalm); detectionSelect.appendChild(optNoisy);
      detectionWrapper.appendChild(detectionSelect);
      try { topbar.appendChild(detectionWrapper); } catch (e) { /* ignore DOM insertion errors */ }

      const LS_MODE = 'recorder.mode';
      function loadSettings() { return { mode: localStorage.getItem(LS_MODE) || 'calm' }; }
      function saveSettings(s) { if (s.mode) localStorage.setItem(LS_MODE, s.mode); }
      function applyToRecorder() {
        const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
        if (!audioSamplerComp || !audioSamplerComp.recorder) return;
        const rec = audioSamplerComp.recorder;
        const s = loadSettings();
        if (s.mode === 'calm') {
          rec.detectionThreshold = 0.02;
          rec.detectionHoldMs = 30;
          rec.windowMs = 10;
        } else if (s.mode === 'noisy') {
          // In noisy environments require a higher RMS (louder) to start
          rec.detectionThreshold = 0.06;
          rec.detectionHoldMs = 30;
          rec.windowMs = 10;
        }
      }

      // Initialize UI from stored settings
      const initSettings = loadSettings();
      detectionSelect.value = initSettings.mode || 'calm';
      detectionSelect.addEventListener('change', () => { const m = detectionSelect.value; saveSettings({ mode: m }); applyToRecorder(); });
      try { applyToRecorder(); } catch (e) { console.warn('applyToRecorder failed', e); }
    } catch (e) {
      console.warn('Failed to create detection selector in topbar', e);
    }

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

    const addToPresetBtn = document.createElement('button');
    addToPresetBtn.textContent = '➕ Ajouter au preset';
    addToPresetBtn.classList.add('control-btn');
    // Initially disabled if no loaded buffer
    try {
      const currentRootCheck = getCurrentRoot();
      const asc = currentRootCheck.querySelector && currentRootCheck.querySelector('audio-sampler');
      addToPresetBtn.disabled = !(asc && asc.lastAudioBuffer);
    } catch (e) { addToPresetBtn.disabled = true; }
    addToPresetBtn.addEventListener('click', async () => {
      const currentRootClick = getCurrentRoot();
      const audioSamplerComp = currentRootClick.querySelector('audio-sampler');
      if (!audioSamplerComp || !audioSamplerComp.lastAudioBuffer) return showError('Aucun sample chargé.');
      try {
        console.log('[addToPresetBtn] START - adding loaded sample to preset');
        const idx = activePresetIndex();
        console.log('[addToPresetBtn] activePresetIndex returned:', idx);
        console.log('[addToPresetBtn] presetSelect.value=', presetSelect?.value, 'getCurrentPresetIndex=', typeof getCurrentPresetIndex === 'function' ? getCurrentPresetIndex() : 'N/A');
        console.log('[addToPresetBtn] Current preset index=', idx, 'preset=', presets[idx]);
        try { showStatus && showStatus('Ajout du sample au preset...'); } catch (e) {}
        const wav = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
        const blobUrl = createTrackedObjectUrl(wav);
        if (!presets[idx]) presets[idx] = { name: 'Custom', files: [] };
        const files = presets[idx].files || [];
        const entry = { url: blobUrl, name: (audioSamplerComp.lastBlob && audioSamplerComp.lastBlob.name) ? audioSamplerComp.lastBlob.name : 'Loaded sample' };
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
        
        // Recharger le preset modifié (modification temporaire, pas de sauvegarde auto)
        await loadPresetByIndex(idx);
        showStatus('Sample ajouté au preset (non sauvegardé).');
      } catch (err) {
        showError('Erreur ajout au preset: ' + (err && (err.message || err)));
      }
    });
    // enable the button when a sample is loaded into the audio-sampler
    try {
      const asc = currentRoot.querySelector && currentRoot.querySelector('audio-sampler');
      if (asc) {
        asc.addEventListener('sampleloaded', () => { try { addToPresetBtn.disabled = false; } catch (e) {} });
        asc.addEventListener('recordingstop', () => { try { addToPresetBtn.disabled = false; } catch (e) {} });
      }
    } catch (e) {}
    bottomRow.appendChild(addToPresetBtn);

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Sauvegarder';
    saveBtn.classList.add('control-btn');
    saveBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp || !audioSamplerComp.lastAudioBuffer) {
        return showError('Aucun sample à sauvegarder');
      }
      try {
        const input = await openTextInputModal({ 
          title: 'Nom du sample à sauvegarder', 
          placeholder: 'mon-sample', 
          defaultValue: 'mon-sample' 
        });
        if (input === null || String(input).trim() === '') return;
        const sampleName = String(input).trim();
        
        // Convert buffer to WAV blob
        const wavBlob = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
        
        // Upload to backend
        const { uploadSample } = await import('./api-service.js');
        await uploadSample(sampleName, wavBlob);
        showStatus(`Sample "${sampleName}" sauvegardé sur le serveur`);
      } catch (e) { 
        console.error('Save error:', e);
        showError(e.message || 'Erreur lors de la sauvegarde'); 
      }
    });
    bottomRow.appendChild(saveBtn);

    // Téléchargement local du dernier sample (WAV)
    const downloadSampleBtn = document.createElement('button');
    downloadSampleBtn.textContent = '⬇️ Télécharger le sample';
    downloadSampleBtn.classList.add('control-btn');
    downloadSampleBtn.addEventListener('click', async () => {
      const audioSamplerComp = getCurrentRoot().querySelector('audio-sampler');
      if (!audioSamplerComp || !audioSamplerComp.lastAudioBuffer) return showError('Aucun sample chargé à télécharger.');
      try {
        const defaultName = (audioSamplerComp.lastBlob && audioSamplerComp.lastBlob.name) ? audioSamplerComp.lastBlob.name.replace(/\.\w+$/, '') : 'sample';
        const input = await openTextInputModal({ title: 'Nom du fichier à télécharger', placeholder: defaultName, defaultValue: defaultName });
        if (input === null) return;
        const fname = (String(input).trim() === '') ? defaultName : String(input).trim();
        const wavBlob = audioSamplerComp.recorder.audioBufferToWavBlob(audioSamplerComp.lastAudioBuffer);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(wavBlob);
        a.download = fname + '.wav';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 5000);
      } catch (e) { showError('Erreur téléchargement sample: ' + (e && e.message || e)); }
    });
    bottomRow.appendChild(downloadSampleBtn);

    // Hidden file input for importing sounds
    const importSoundInput = document.createElement('input');
    importSoundInput.type = 'file';
    importSoundInput.accept = 'audio/*';
    importSoundInput.hidden = true;
    importSoundInput.addEventListener('change', onImportSoundFile);

    savedSamplesContainer.appendChild(topRow);
    savedSamplesContainer.appendChild(bottomRow);
    // input pour importer un preset local
    savedSamplesContainer.appendChild(importPresetInput);
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
        // remove preset import input if present
        try {
          const presetInput = root.querySelector && (root.querySelector('input[type=file][accept=".json,application/json"]') || root.querySelector('input[type=file][accept="application/json,.json"]'));
          if (presetInput && presetInput.parentNode) presetInput.parentNode.removeChild(presetInput);
        } catch (e) {}
        // remove detection selector added to topbar (if present)
        try {
          const det = root.querySelector && root.querySelector('#detectionSelect');
          if (det && det.parentNode) det.parentNode.removeChild(det);
          const lab = root.querySelector && root.querySelector('label[for="detectionSelect"]');
          if (lab && lab.parentNode) lab.parentNode.removeChild(lab);
          // also remove any .select-wrapper that may be empty and was used for detection
          const wrappers = root.querySelectorAll && root.querySelectorAll('.select-wrapper');
          if (wrappers && wrappers.length) {
            wrappers.forEach(w => {
              if (w.querySelector && !w.querySelector('select')) {
                if (w.parentNode) w.parentNode.removeChild(w);
              }
            });
          }
        } catch (e) {}
      } catch (e) {}
    } catch (e) {
      // swallow to avoid affecting stop flow
      console.warn('ui-menus destroy failed', e);
    }
  }

  return { openAddSoundMenu, closeAddSoundMenu, openCreatePresetMenu, openAssemblePresetPanel, renderSavedSamplesList, addSavedSampleToPreset, addPresetSampleByUrl, onImportSoundFile, createSavedSamplesUI, destroy };
}
