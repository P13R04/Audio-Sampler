// preset-admin.js
// UI pour uploader et supprimer des presets via le backend

import { createPresetWithFiles, deletePreset } from './api-service.js';
import { fetchPresets, fillPresetSelect } from './presets-manager.js';

/**
 * Affiche le modal d'upload de preset
 */
export async function showUploadModal(presetSelect, presets) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <h2 style="margin-top: 0;">Upload New Preset</h2>
      <form id="uploadPresetForm">
        <div style="margin-bottom: 1rem;">
          <label for="presetName" style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Preset Name:</label>
          <input 
            type="text" 
            id="presetName" 
            name="presetName" 
            required 
            placeholder="My Preset"
            style="width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;"
          />
        </div>
        
        <div style="margin-bottom: 1rem;">
          <label for="audioFiles" style="display: block; margin-bottom: 0.5rem; font-weight: 600;">Audio Files (max 16):</label>
          <input 
            type="file" 
            id="audioFiles" 
            name="audioFiles" 
            accept="audio/*" 
            multiple 
            required
            style="width: 100%; padding: 0.5rem;"
          />
          <small style="color: #666;">Select up to 16 audio files (.wav, .mp3, .ogg, etc.)</small>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem;">
          <button type="button" id="cancelUpload" style="padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">
            Cancel
          </button>
          <button type="submit" style="padding: 0.5rem 1rem; border: none; border-radius: 4px; background: #8b5cf6; color: white; cursor: pointer; font-weight: 600;">
            Upload
          </button>
        </div>
      </form>
      <div id="uploadProgress" style="margin-top: 1rem; display: none;">
        <div style="background: #e5e7eb; border-radius: 4px; overflow: hidden; height: 24px;">
          <div id="uploadProgressBar" style="background: #8b5cf6; height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
        <p id="uploadStatus" style="text-align: center; margin-top: 0.5rem; font-size: 0.9rem;"></p>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const form = modal.querySelector('#uploadPresetForm');
  const cancelBtn = modal.querySelector('#cancelUpload');
  const progressDiv = modal.querySelector('#uploadProgress');
  const progressBar = modal.querySelector('#uploadProgressBar');
  const statusText = modal.querySelector('#uploadStatus');
  
  const closeModal = () => {
    modal.remove();
  };
  
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = form.querySelector('#presetName');
    const filesInput = form.querySelector('#audioFiles');
    
    const name = nameInput.value.trim();
    const files = Array.from(filesInput.files);
    
    if (!name) {
      alert('Please enter a preset name');
      return;
    }
    
    if (files.length === 0) {
      alert('Please select at least one audio file');
      return;
    }
    
    if (files.length > 16) {
      alert('Maximum 16 files allowed');
      return;
    }
    
    // Show progress
    form.style.display = 'none';
    progressDiv.style.display = 'block';
    statusText.textContent = 'Uploading files...';
    
    try {
      // Simulate progress (real upload doesn't report progress with current API)
      progressBar.style.width = '30%';
      
      const result = await createPresetWithFiles(name, {}, files);
      
      progressBar.style.width = '100%';
      statusText.textContent = 'Upload complete! Refreshing presets...';
      
      // Refresh preset list
      const updatedPresets = await fetchPresets();
      presets.length = 0;
      presets.push(...updatedPresets);
      fillPresetSelect(presetSelect, presets);
      
      setTimeout(() => {
        closeModal();
        alert(`Preset "${name}" uploaded successfully!`);
      }, 500);
      
    } catch (error) {
      console.error('Upload failed:', error);
      progressBar.style.width = '0%';
      statusText.textContent = 'Upload failed: ' + error.message;
      statusText.style.color = '#ef4444';
      
      setTimeout(() => {
        form.style.display = 'block';
        progressDiv.style.display = 'none';
        statusText.style.color = '';
      }, 3000);
    }
  });
}

/**
 * Affiche le modal de gestion des presets (suppression)
 */
export async function showManagePresetsModal(presetSelect, presets) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
      <h2 style="margin-top: 0;">Manage Presets</h2>
      <p style="color: #666; margin-bottom: 1rem;">Select presets to delete. Built-in presets cannot be removed.</p>
      <div id="presetList" style="margin-bottom: 1rem;">
        <!-- Will be filled dynamically -->
      </div>
      <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; border-top: 1px solid #e5e7eb; padding-top: 1rem;">
        <button type="button" id="closeManage" style="padding: 0.5rem 1rem; border: 1px solid #ccc; border-radius: 4px; background: white; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const presetListDiv = modal.querySelector('#presetList');
  const closeBtn = modal.querySelector('#closeManage');
  
  const closeModal = () => {
    modal.remove();
  };
  
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  // Render preset list
  const renderPresetList = async () => {
    presetListDiv.innerHTML = '<p style="text-align: center; color: #666;">Loading...</p>';
    
    try {
      const currentPresets = await fetchPresets();
      
      if (currentPresets.length === 0) {
        presetListDiv.innerHTML = '<p style="text-align: center; color: #666;">No presets available</p>';
        return;
      }
      
      presetListDiv.innerHTML = currentPresets.map(preset => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 0.5rem;">
          <div>
            <strong>${preset.name}</strong>
            <br />
            <small style="color: #666;">${preset.files?.length || 0} samples</small>
          </div>
          <button 
            class="delete-preset-btn" 
            data-preset-name="${preset.name}"
            style="padding: 0.4rem 0.8rem; border: none; border-radius: 4px; background: #ef4444; color: white; cursor: pointer; font-size: 0.85rem; font-weight: 600;"
          >
            Delete
          </button>
        </div>
      `).join('');
      
      // Add event listeners to delete buttons
      presetListDiv.querySelectorAll('.delete-preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const presetName = btn.dataset.presetName;
          
          if (!confirm(`Are you sure you want to delete preset "${presetName}"?\n\nThis action cannot be undone.`)) {
            return;
          }
          
          try {
            btn.textContent = 'Deleting...';
            btn.disabled = true;
            
            await deletePreset(presetName);
            
            // Refresh preset list in modal
            await renderPresetList();
            
            // Refresh main preset select
            const updatedPresets = await fetchPresets();
            presets.length = 0;
            presets.push(...updatedPresets);
            fillPresetSelect(presetSelect, presets);
            
            alert(`Preset "${presetName}" deleted successfully!`);
            
          } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete preset: ' + error.message);
            btn.textContent = 'Delete';
            btn.disabled = false;
          }
        });
      });
      
    } catch (error) {
      console.error('Failed to load presets:', error);
      presetListDiv.innerHTML = `<p style="text-align: center; color: #ef4444;">Failed to load presets: ${error.message}</p>`;
    }
  };
  
  renderPresetList();
}
