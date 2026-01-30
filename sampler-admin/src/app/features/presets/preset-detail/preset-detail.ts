import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PresetService } from '../../../core/services/preset.service';
import { Preset, Sample } from '../../../core/models/preset.model';
import { AudioPreview } from '../../../shared/components/audio-preview/audio-preview';
import { FileUploader } from '../../../shared/components/file-uploader/file-uploader';

@Component({
  selector: 'app-preset-detail',
  imports: [CommonModule, FormsModule, AudioPreview, FileUploader],
  templateUrl: './preset-detail.html',
  styleUrl: './preset-detail.scss',
})
export class PresetDetail implements OnInit {
  preset: Preset | null = null;
  loading = true;
  error = '';
  editMode = false;
  editedName = '';
  editedSamples: Sample[] = [];
  presetName = '';
  showAddFiles = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private presetService: PresetService
  ) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      this.presetName = params['name'];
      this.loadPreset();
    });
  }

  loadPreset() {
    this.loading = true;
    this.error = '';
    
    this.presetService.getPresets().subscribe({
      next: (presets) => {
        const foundPreset = presets.find(p => p.name === this.presetName);
        if (!foundPreset) {
          this.error = 'Preset non trouvé';
          this.preset = null;
        } else {
          // S'assurer que samples existe et est un tableau
          this.preset = {
            ...foundPreset,
            samples: foundPreset.samples || []
          };
          this.editedName = this.preset!.name;
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement du preset';
        this.loading = false;
        console.error('Error loading preset:', err);
      }
    });
  }

  toggleEditMode() {
    if (this.preset?.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être modifiés');
      return;
    }
    
    this.editMode = !this.editMode;
    if (this.editMode && this.preset) {
      // create a shallow copy of samples for editing
      this.editedSamples = (this.preset!.samples || []).map(s => ({ ...s }));
      this.editedName = this.preset!.name;
    }
    if (!this.editMode && this.preset) {
      this.editedName = this.preset.name;
      this.editedSamples = [];
    }
  }

  saveName() {
    if (!this.preset || !this.editedName.trim()) return;

    // If samples were edited as well, perform rename then update samples
    const performSamplesUpdate = (nameToUse: string) => {
      if (!this.editedSamples || this.editedSamples.length === 0) {
        this.presetName = nameToUse;
        this.editMode = false;
        this.loadPreset();
        return;
      }
      this.presetService.updatePreset(nameToUse, { samples: this.editedSamples }).subscribe({
        next: (updated: Preset) => {
          if (updated && typeof updated === 'object') {
            this.preset = { ...updated, samples: updated.samples || [] };
            this.presetName = updated.name;
            this.editMode = false;
            this.editedSamples = [];
          } else {
            this.loadPreset();
          }
        },
        error: () => { this.error = 'Erreur lors de la mise à jour des samples'; }
      });
    };

    if (this.editedName.trim() !== this.preset!.name) {
      this.presetService.renamePreset(this.preset!.name, this.editedName).subscribe({
        next: () => performSamplesUpdate(this.editedName.trim()),
        error: () => { this.error = 'Erreur lors du renommage'; }
      });
    } else {
      performSamplesUpdate(this.preset!.name);
    }
  }

  removeSample(index: number) {
    if (!this.preset || this.preset.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être modifiés');
      return;
    }
    
    if (!confirm(`Retirer le sample ${index + 1} ?`)) return;

    const updatedSamples = this.preset!.samples.filter((_, i) => i !== index);

    this.presetService.updatePreset(this.preset!.name, { samples: updatedSamples }).subscribe({
      next: (updated: Preset) => {
        if (updated && typeof updated === 'object') {
          this.preset = { ...updated, samples: updated.samples || [] };
        } else {
          this.loadPreset();
        }
      },
      error: (err) => {
        this.error = 'Erreur lors de la suppression du sample';
      }
    });
  }

  moveSample(index: number, direction: 'up' | 'down') {
    if (!this.preset || this.preset.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être modifiés');
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.preset.samples.length) return;
    // If we're in edit mode, operate on the editedSamples array so the
    // inputs reflect the reordering. Otherwise operate on the live preset.samples.
    if (this.editMode && Array.isArray(this.editedSamples) && this.editedSamples.length > 0) {
      const edited = [...this.editedSamples];
      [edited[index], edited[newIndex]] = [edited[newIndex], edited[index]];
      this.editedSamples = edited;

      // Keep the displayed preset in sync so the UI shows the same ordering
      this.preset = { ...this.preset!, samples: edited } as any;

      this.presetService.updatePreset(this.preset!.name, { samples: edited }).subscribe({
        next: (updated: Preset) => {
          if (updated && typeof updated === 'object') {
            this.preset = { ...updated, samples: updated.samples || [] };
          } else {
            this.loadPreset();
          }
        },
        error: (err) => { this.error = 'Erreur lors du déplacement'; }
      });
      return;
    }

    // Not in edit mode: swap on the preset.samples array
    const samples = [...this.preset!.samples];
    [samples[index], samples[newIndex]] = [samples[newIndex], samples[index]];

    this.presetService.updatePreset(this.preset!.name, { samples }).subscribe({
      next: (updated: Preset) => {
        if (updated && typeof updated === 'object') {
          this.preset = { ...updated, samples: updated.samples || [] };
        } else {
          this.loadPreset();
        }
      },
      error: (err) => { this.error = 'Erreur lors du déplacement'; }
    });
  }

  onFilesSelected(files: File[]) {
    if (!this.preset) return;

    const formData = new FormData();
    files.forEach(file => formData.append('newFiles', file));

    this.presetService.updatePreset(this.preset!.name, formData).subscribe({
      next: (updated: Preset) => {
        this.showAddFiles = false;
        if (updated && typeof updated === 'object') {
          this.preset = { ...updated, samples: updated.samples || [] };
        } else {
          this.loadPreset();
        }
      },
      error: (err) => {
        this.error = 'Erreur lors de l\'ajout des fichiers';
      }
    });
  }

  deletePreset() {
    if (!this.preset) return;
    
    if (this.preset.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être supprimés');
      return;
    }
    
    if (!confirm(`Supprimer définitivement "${this.preset!.name}" ?`)) return;

    this.presetService.deletePreset(this.preset!.name).subscribe({
      next: () => this.router.navigate(['/presets']),
      error: (err) => {
        this.error = 'Erreur lors de la suppression';
      }
    });
  }

  goBack() {
    this.router.navigate(['/presets']);
  }

  getSampleUrl(sample: Sample): string {
    // Les URLs des samples sont relatives dans les JSON (ex: "./808/Kick 808X.wav")
    // On doit construire l'URL complète pour le backend
    const baseUrl = 'http://localhost:3000/presets';
    // Retirer le './' du début si présent
    const cleanUrl = sample.url.startsWith('./') ? sample.url.substring(2) : sample.url;
    // Encoder l'URL pour gérer les espaces et caractères spéciaux
    const encodedUrl = cleanUrl.split('/').map(part => encodeURIComponent(part)).join('/');
    return `${baseUrl}/${encodedUrl}`;
  }

  getOriginalSampleName(sample: Sample): string {
    const url = sample.url || '';
    const cleanUrl = url.startsWith('./') ? url.substring(2) : url;
    const filename = cleanUrl.split('/').pop() || '';
    const decoded = decodeURIComponent(filename);
    return decoded.replace(/\.[^/.]+$/, '') || 'Sample';
  }
}
