/* ---------------------------------------------------------------------------
  utils.js
  Petites fonctions utilitaires réutilisables pour :
  - géométrie (distance)
  - conversion pixel ↔ temps (pixelToSeconds)
  - formatage d'affichage temporel (formatTime)
  - extraction / nettoyage de noms de fichiers (formatSampleNameFromUrl)
  Ces helpers sont volontairement petits, purs et sans effets de bord.
  --------------------------------------------------------------------------- */

// distance Euclidienne entre deux points (en pixels)
function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

// Convertit une position en pixels sur le canvas en seconde dans l'AudioBuffer
function pixelToSeconds(x, bufferDuration, canvasWidth) {
    // proportion simple : x / canvasWidth = t / bufferDuration
    return x * bufferDuration / canvasWidth;
}

// Formate un temps (en secondes) en "mm:ss.mmm"
function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    const mmm = String(ms).padStart(3, '0');
    return `${mm}:${ss}.${mmm}`;
}

export { distance, pixelToSeconds, formatTime };

// Formate un nom de sample à partir d'une URL/chemin de fichier
// - Décodage URI (%20 -> espace)
// - Suppression des query/hash
// - Suppression de l'extension (.wav/.mp3/...)
// - Nettoyage des séparateurs et mise en Title Case
function formatSampleNameFromUrl(pathOrUrl) {
    try {
        // garde le dernier segment après / ou \ (compat Windows)
        let last = String(pathOrUrl).split(/[\\\/]/).pop() || '';
        // supprime query/hash
        last = last.replace(/[?#].*$/, '');
        // decode URI components si nécessaire
        try { last = decodeURIComponent(last); } catch (_) {}
        // retire extension
        last = last.replace(/\.[a-z0-9]+$/i, '');
        // remplace séparateurs par espace et normalise
        last = last.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
        // Title Case basique
        last = last.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
        return last || 'Sample';
    } catch {
        return 'Sample';
    }
}

export { formatSampleNameFromUrl };