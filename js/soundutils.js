/* ---------------------------------------------------------------------------
   soundutils.js
   Fonctions utilitaires pour charger et jouer des fichiers audio via la
   Web Audio API.
   
   Exports :
   - loadAndDecodeSound(url, ctx) => Promise<AudioBuffer>
   - playSound(ctx, buffer, startTime, endTime, playbackRate) => AudioBufferSourceNode

   Remarques importantes :
   - Les AudioBufferSourceNode sont "one-shot" : il faut en recréer un à
     chaque lecture (impossible de réutiliser après stop).
   - La méthode start() de BufferSource prend une durée (end-start) en 3ème
     argument, et non pas un temps de fin absolu.
   --------------------------------------------------------------------------- */

/**
 * Charge un fichier audio par HTTP(S) et le décode avec la Web Audio API
 * @param {string} url - URL absolue du fichier audio (wav/mp3/ogg/etc.)
 * @param {AudioContext} ctx - Contexte audio pour le décodage
 * @returns {Promise<AudioBuffer>} Buffer audio décodé
 */
async function loadAndDecodeSound(url, ctx) {
  const response = await fetch(url);
  const sound = await response.arrayBuffer();

  // Décodage asynchrone en AudioBuffer
  const decodedSound = await ctx.decodeAudioData(sound);

  return decodedSound;
};

/**
 * Construit le graphe audio minimal pour jouer un son
 * Crée la chaîne : BufferSource → destination (sortie audio/carte son)
 * @param {AudioContext} ctx - Contexte audio
 * @param {AudioBuffer} buffer - Buffer audio à jouer
 * @returns {AudioBufferSourceNode} Node source (one-shot, non réutilisable)
 */
function buildAudioGraph(ctx, buffer) {
  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = buffer;
  bufferSource.connect(ctx.destination);
  return bufferSource;
}

// Joue un segment [startTime, endTime] (en secondes) du buffer
// - startTime: position de départ dans le son
// - endTime: position de fin absolue (exclue). ATTENTION: l’API attend une durée → end-start
// - playbackRate: (optionnel) vitesse de lecture pour pitchen (1 = origine)
// Retourne le BufferSourceNode (utile pour pouvoir l’arrêter via .stop())
function playSound(ctx, buffer, startTime, endTime, playbackRate = 1) {
  // Sécurise les bornes de lecture
  if (startTime < 0) startTime = 0;
  if (endTime > buffer.duration) endTime = buffer.duration;

  // La durée à jouer est (fin - début)
  let duration = Math.max(0, endTime - startTime);
  if (duration === 0) return null; // rien à jouer

  // Les BufferSource sont one-shot → on en crée un nouveau à chaque lecture
  const bufferSource = buildAudioGraph(ctx, buffer);

  // Permet de jouer plus vite/plus lentement pour créer des notes pitchées
  try {
    bufferSource.playbackRate.value = playbackRate;
  } catch (e) {
    // Certains environnements peuvent ne pas autoriser la modification
    // — on ignore silencieusement.
  }

  // start(when, offset, duration)
  // when = 0 → maintenant; offset = startTime; duration = end-start
  // Doc: https://developer.mozilla.org/fr/docs/Web/API/AudioBufferSourceNode/start
  bufferSource.start(0, startTime, duration);
  return bufferSource;
}

export { loadAndDecodeSound, playSound };