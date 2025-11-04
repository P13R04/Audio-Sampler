/* ---------------------------------------------------------------------------
   soundutils.js
   Fonctions utilitaires pour charger et jouer des fichiers audio via la
   Web Audio API. Exporte :
   - loadAndDecodeSound(url, ctx) => Promise<AudioBuffer>
   - playSound(ctx, buffer, startTime, endTime) => AudioBufferSourceNode

   Remarques importantes:
   - Les AudioBufferSourceNode sont "one-shot" : il faut en recréer un à
     chaque lecture.
   - La méthode start() de BufferSource prend une durée (end-start) en 3ème
     argument, et non pas un temps de fin absolu.
   --------------------------------------------------------------------------- */
// Charge un son par HTTP(S) et le décode avec la Web Audio API
// - url: URL absolue du fichier audio (wav/mp3/etc.)
// - ctx: AudioContext
// Retourne: une promesse résolue avec un AudioBuffer décodé
async function loadAndDecodeSound(url, ctx) {
  const response = await fetch(url);
  const sound = await response.arrayBuffer();

  console.log("Son chargé en ArrayBuffer");

  // Décodage asynchrone en AudioBuffer
  const decodedSound = await ctx.decodeAudioData(sound);
  console.log("Son décodé");

  return decodedSound;
};

// Construit le graphe audio minimal pour jouer un son
// Ici: un BufferSource → destination (carte son)
// Retourne le BufferSourceNode créé (one-shot)
function buildAudioGraph(ctx, buffer) {
  const bufferSource = ctx.createBufferSource();
  bufferSource.buffer = buffer;
  bufferSource.connect(ctx.destination);
  return bufferSource;
}

// Joue un segment [startTime, endTime] (en secondes) du buffer
// - startTime: position de départ dans le son
// - endTime: position de fin absolue (exclue). ATTENTION: l’API attend une durée → end-start
// Retourne le BufferSourceNode (utile pour pouvoir l’arrêter via .stop())
function playSound(ctx, buffer, startTime, endTime) {
  // Sécurise les bornes de lecture
  if (startTime < 0) startTime = 0;
  if (endTime > buffer.duration) endTime = buffer.duration;

  // La durée à jouer est (fin - début)
  let duration = Math.max(0, endTime - startTime);
  if (duration === 0) return null; // rien à jouer

  // Les BufferSource sont one-shot → on en crée un nouveau à chaque lecture
  const bufferSource = buildAudioGraph(ctx, buffer);

  // start(when, offset, duration)
  // when = 0 → maintenant; offset = startTime; duration = end-start
  // Doc: https://developer.mozilla.org/fr/docs/Web/API/AudioBufferSourceNode/start
  bufferSource.start(0, startTime, duration);
  return bufferSource;
}

export { loadAndDecodeSound, playSound };