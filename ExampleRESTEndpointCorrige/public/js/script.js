// Petit script de démonstration côté serveur de presets
// Version commentée en français :
// - Récupère /api/presets
// - Charge en mémoire les samples d'un preset via WebAudio
// - Génère un bouton de lecture par sample

window.onload = init;

function init() {
    console.log('Initialisation script presets');
    fetchPresets();
}

// Récupère la liste des presets depuis l'API et les affiche
async function fetchPresets() {
    try {
        const response = await fetch('/api/presets');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const presets = await response.json();
        displayPresets(presets);
    } catch (err) {
        console.error('Erreur lors de la récupération des presets :', err);
    }
}

// Affiche la liste des presets dans l'UI (ul#preset-list attendu)
function displayPresets(presets) {
    const presetList = document.querySelector('#preset-list');
    if (!presetList) return;
    presetList.innerHTML = '';

    presets.forEach(async (preset) => {
        const li = document.createElement('li');
        li.textContent = `${preset.name} ${preset.type ? '(' + preset.type + ')' : ''}`;
        presetList.appendChild(li);

        // Charge les samples du preset et ajoute un bouton de lecture pour chacun
        await loadSamplesInMemory(preset, li);
    });
}

// Crée un AudioContext partagé pour la page
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Charge en mémoire les samples d'un preset, puis ajoute un bouton "Play" pour chaque sample
async function loadSamplesInMemory(preset, container) {
    if (!preset || !preset.samples || preset.samples.length === 0) return;

    // Construit les URLs relatives attendues par le serveur
    const sampleUrls = preset.samples.map(s => 'presets/' + s.url);
    console.log('Chargement des URLs :', sampleUrls);

    try {
        // Récupère tous les fichiers audio en ArrayBuffer
        const arrayBuffers = await Promise.all(sampleUrls.map(u => fetch(u).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status} pour ${u}`);
            return r.arrayBuffer();
        })));

        // Décode tous les buffers en AudioBuffer via la WebAudio API
        const audioBuffers = await Promise.all(arrayBuffers.map(ab => audioContext.decodeAudioData(ab)));
        console.log('AudioBuffers décodés :', audioBuffers.length);

        // Pour chaque AudioBuffer, créer un bouton de lecture
        audioBuffers.forEach((audioBuffer, idx) => {
            const sample = preset.samples[idx] || {};
            const btn = document.createElement('button');
            btn.textContent = `▶ ${sample.name || 'Sample'}`;
            btn.addEventListener('click', () => {
                // Resume si nécessaire (politique autoplay des navigateurs)
                if (audioContext.state === 'suspended') audioContext.resume();

                const src = audioContext.createBufferSource();
                src.buffer = audioBuffer;
                src.connect(audioContext.destination);
                src.start(0);
            });
            container.appendChild(btn);
        });
    } catch (err) {
        console.error('Erreur chargement/decodage des samples :', err);
    }
}

// Option : afficher les samples en <audio> natif (méthode non utilisée par défaut)
function showSamplesAsHTMLAudioPlayers(preset, container) {
    if (!preset || !preset.samples || preset.samples.length === 0) return;
    const ul = document.createElement('ul');
    preset.samples.forEach(sample => {
        const li = document.createElement('li');
        li.textContent = sample.name || 'Sample';
        const audio = document.createElement('audio');
        audio.controls = true;
        const src = document.createElement('source');
        src.src = 'presets/' + sample.url;
        audio.appendChild(src);
        li.appendChild(audio);
        ul.appendChild(li);
    });
    container.appendChild(ul);
}
