// ====== STORAGE MANAGER ======
// Module de gestion du stockage IndexedDB
// Responsable du nettoyage, monitoring et gestion de l'espace

/**
 * Récupère les statistiques d'utilisation du stockage
 * @returns {Promise<{usedMB: number, quotaGB: number, percentage: number}>}
 */
export async function getStorageStats() {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { usedMB: 0, quotaGB: 0, percentage: 0 };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usedMB = (estimate.usage || 0) / 1024 / 1024;
    const quotaGB = (estimate.quota || 0) / 1024 / 1024 / 1024;
    const percentage = estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0;

    return {
      usedMB: Math.round(usedMB * 10) / 10,  // 1 décimale
      quotaGB: Math.round(quotaGB * 10) / 10,
      percentage: Math.round(percentage * 10) / 10
    };
  } catch (err) {
    console.warn('Erreur lecture stats stockage:', err);
    return { usedMB: 0, quotaGB: 0, percentage: 0 };
  }
}

/**
 * Nettoie les samples selon les critères fournis
 * @param {Object} recorder - Instance Recorder avec accès à IndexedDB
 * @param {Object} options - Options de nettoyage
 * @param {number} options.olderThanDays - Supprimer samples plus vieux que X jours
 * @param {boolean} options.all - Supprimer TOUS les samples (dangereux)
 * @returns {Promise<{deleted: number, freed: number}>} Nombre supprimés et MB libérés
 */
export async function cleanupSamples(recorder, options = {}) {
  if (!recorder) {
    throw new Error('Recorder non fourni');
  }

  const { olderThanDays = null, all = false } = options;
  
  // Récupérer tous les samples
  const samples = await recorder.getAllSamples();
  
  if (!samples || samples.length === 0) {
    return { deleted: 0, freed: 0 };
  }

  let deleted = 0;
  let freedBytes = 0;
  const now = Date.now();
  const cutoff = olderThanDays ? now - (olderThanDays * 24 * 60 * 60 * 1000) : null;

  for (const sample of samples) {
    let shouldDelete = false;

    // Critère 1 : Supprimer tous
    if (all) {
      shouldDelete = true;
    }
    // Critère 2 : Supprimer les anciens
    else if (cutoff && sample.createdAt) {
      const sampleDate = new Date(sample.createdAt).getTime();
      if (sampleDate < cutoff) {
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      try {
        // Calculer la taille avant suppression
        if (sample.blob && sample.blob.size) {
          freedBytes += sample.blob.size;
        }
        
        await recorder.deleteSample(sample.id);
        deleted++;
      } catch (err) {
        console.warn(`Erreur suppression sample ${sample.id}:`, err);
      }
    }
  }

  const freedMB = Math.round((freedBytes / 1024 / 1024) * 10) / 10;

  return { deleted, freed: freedMB };
}

/**
 * Vérifie si l'espace de stockage atteint un seuil critique
 * @param {number} warningThresholdMB - Seuil d'avertissement en MB (défaut: 100)
 * @returns {Promise<{warning: boolean, usedMB: number, message: string}>}
 */
export async function checkStorageWarning(warningThresholdMB = 100) {
  const stats = await getStorageStats();
  
  const warning = stats.usedMB > warningThresholdMB;
  const message = warning
    ? `⚠️ Stockage: ${stats.usedMB} MB utilisés. Pensez à nettoyer les anciens samples.`
    : `✅ Stockage: ${stats.usedMB} MB utilisés`;

  return {
    warning,
    usedMB: stats.usedMB,
    message
  };
}

/**
 * Ouvre un dialogue modal pour nettoyer les samples
 * @param {Object} recorder - Instance Recorder
 * @param {HTMLElement} root - Root DOM (document ou shadowRoot)
 * @param {Function} onComplete - Callback après nettoyage
 */
export async function openCleanupDialog(recorder, root, onComplete) {
  // Vérifier si un dialogue existe déjà
  const existingDialog = root.getElementById ? 
    root.getElementById('cleanupDialog') : 
    root.querySelector('#cleanupDialog');
  
  if (existingDialog) {
    existingDialog.remove();
    return;
  }

  // Créer le dialogue
  const dialog = document.createElement('div');
  dialog.id = 'cleanupDialog';
  dialog.classList.add('modal-panel', 'center-vertical', 'cleanup-dialog');

  // Récupérer les stats
  const stats = await getStorageStats();
  const samples = await recorder.getAllSamples();

  // Calculer la taille totale des samples
  let totalSamplesMB = 0;
  for (const sample of samples) {
    if (sample.blob && sample.blob.size) {
      totalSamplesMB += sample.blob.size / 1024 / 1024;
    }
  }
  totalSamplesMB = Math.round(totalSamplesMB * 10) / 10;

  // Build dialog content using DOM APIs (avoid innerHTML to reduce XSS risk)
  const inner = document.createElement('div');
  inner.className = 'cleanup-inner';

  const h3 = document.createElement('h3');
  h3.className = 'cleanup-title';
  h3.textContent = '🧹 Nettoyage du stockage';
  inner.appendChild(h3);

  const statsWrap = document.createElement('div');
  statsWrap.className = 'cleanup-stats';

  const stat1 = document.createElement('div');
  stat1.className = 'stat-row';
  const span1 = document.createElement('span');
  span1.textContent = 'Espace utilisé :';
  const strong1 = document.createElement('strong');
  strong1.className = 'stat-val';
  strong1.textContent = `${stats.usedMB} MB / ${stats.quotaGB} GB`;
  stat1.appendChild(span1);
  stat1.appendChild(strong1);
  statsWrap.appendChild(stat1);

  const stat2 = document.createElement('div');
  stat2.className = 'stat-row';
  const span2 = document.createElement('span');
  span2.textContent = 'Samples sauvegardés :';
  const strong2 = document.createElement('strong');
  strong2.className = 'stat-val';
  strong2.textContent = String(samples.length);
  stat2.appendChild(span2);
  stat2.appendChild(strong2);
  statsWrap.appendChild(stat2);

  const stat3 = document.createElement('div');
  stat3.className = 'stat-row';
  const span3 = document.createElement('span');
  span3.textContent = 'Taille totale samples :';
  const strong3 = document.createElement('strong');
  strong3.className = 'stat-val';
  strong3.textContent = `${totalSamplesMB} MB`;
  stat3.appendChild(span3);
  stat3.appendChild(strong3);
  statsWrap.appendChild(stat3);

  inner.appendChild(statsWrap);

  const desc = document.createElement('p');
  desc.className = 'cleanup-desc';
  desc.textContent = 'Choisissez une action de nettoyage :';
  inner.appendChild(desc);

  const actions = document.createElement('div');
  actions.className = 'cleanup-actions';

  const btn30 = document.createElement('button');
  btn30.id = 'cleanup30';
  btn30.className = 'control-btn full-width';
  btn30.textContent = '🗓️ Supprimer les samples de plus de 30 jours';
  actions.appendChild(btn30);

  const btn90 = document.createElement('button');
  btn90.id = 'cleanup90';
  btn90.className = 'control-btn full-width';
  btn90.textContent = '📅 Supprimer les samples de plus de 90 jours';
  actions.appendChild(btn90);

  const btnAll = document.createElement('button');
  btnAll.id = 'cleanupAll';
  btnAll.className = 'control-btn full-width danger';
  btnAll.textContent = '⚠️ Supprimer TOUS les samples';
  actions.appendChild(btnAll);

  inner.appendChild(actions);

  const footer = document.createElement('div');
  footer.className = 'cleanup-footer';
  const closeBtnEl = document.createElement('button');
  closeBtnEl.id = 'closeCleanup';
  closeBtnEl.className = 'control-btn';
  closeBtnEl.textContent = 'Annuler';
  footer.appendChild(closeBtnEl);
  inner.appendChild(footer);

  dialog.appendChild(inner);

  // Ajouter au DOM
  const container = root.getRootNode ? root.getRootNode() : root;
  const target = container.body || container.host?.shadowRoot || root;
  target.appendChild(dialog);

  // Gestion des événements
  const cleanup30Btn = dialog.querySelector('#cleanup30');
  const cleanup90Btn = dialog.querySelector('#cleanup90');
  const cleanupAllBtn = dialog.querySelector('#cleanupAll');
  const closeBtn = dialog.querySelector('#closeCleanup');

  // Fonction helper pour effectuer le nettoyage
  async function performCleanup(options, confirmMessage) {
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    try {
      // Afficher un indicateur de chargement
      dialog.classList.add('busy');

      const result = await cleanupSamples(recorder, options);

      dialog.remove();

      // Callback avec les résultats
      if (onComplete) {
        onComplete({
          success: true,
          deleted: result.deleted,
          freed: result.freed,
          message: `✅ ${result.deleted} sample(s) supprimé(s) • ${result.freed} MB libéré(s)`
        });
      }
    } catch (err) {
      console.error('Erreur nettoyage:', err);
      dialog.classList.remove('busy');
      
      if (onComplete) {
        onComplete({
          success: false,
          message: `❌ Erreur: ${err.message}`
        });
      }
    }
  }

  // Listeners
  cleanup30Btn.addEventListener('click', () => {
    performCleanup({ olderThanDays: 30 }, 'Supprimer les samples de plus de 30 jours ?');
  });

  cleanup90Btn.addEventListener('click', () => {
    performCleanup({ olderThanDays: 90 }, 'Supprimer les samples de plus de 90 jours ?');
  });

  cleanupAllBtn.addEventListener('click', () => {
    performCleanup(
      { all: true }, 
      '⚠️ ATTENTION : Cela supprimera TOUS vos samples sauvegardés. Cette action est irréversible. Continuer ?'
    );
  });

  closeBtn.addEventListener('click', () => {
    dialog.remove();
  });
}
