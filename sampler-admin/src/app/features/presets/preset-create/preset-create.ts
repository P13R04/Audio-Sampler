import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PresetService } from '../../../core/services/preset.service';
import { SampleService, Sample as BackendSample } from '../../../core/services/sample.service';
import { Sample as PresetSample } from '../../../core/models/preset.model';
import { FileUploader } from '../../../shared/components/file-uploader/file-uploader';

@Component({
  selector: 'app-preset-create',
  imports: [CommonModule, ReactiveFormsModule, FileUploader],
  templateUrl: './preset-create.html',
  styleUrl: './preset-create.scss',
})
export class PresetCreate implements OnInit {
  presetForm!: FormGroup;
  uploadedFiles: File[] = [];
  backendSamples: BackendSample[] = [];
  selectedBackendSamples = new Set<string>();
  loading = false;
  error = '';

  constructor(
    private fb: FormBuilder,
    private presetService: PresetService,
    private sampleService: SampleService,
    private router: Router
  ) {}

  ngOnInit() {
    this.presetForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      type: ['', Validators.required],
      description: [''],
      tags: ['']
    });

    this.loadBackendSamples();
  }

  loadBackendSamples() {
    this.sampleService.getSamples().subscribe({
      next: (presets) => {
        this.backendSamples = presets.filter(p => p.type === 'Sample');
      },
      error: (err) => {
        console.error('Erreur chargement samples backend:', err);
      }
    });
  }

  onFilesSelected(files: File[]) {
    this.uploadedFiles = files;
    this.error = '';
  }

  toggleBackendSample(sample: BackendSample, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedBackendSamples.add(sample.name);
    } else {
      this.selectedBackendSamples.delete(sample.name);
    }
  }

  private buildSelectedSamples(): PresetSample[] {
    const selected = this.backendSamples.filter(s => this.selectedBackendSamples.has(s.name));
    return selected
      .map((s) => s.samples?.[0])
      .filter((s): s is { url: string; name: string } => !!s && !!s.url)
      .map((s) => ({
        url: s.url,
        name: s.name || 'Sample'
      }));
  }

  onSubmit() {
    if (this.presetForm.invalid) {
      this.error = 'Veuillez remplir tous les champs obligatoires';
      return;
    }

    const selectedSamples = this.buildSelectedSamples();
    if (this.uploadedFiles.length === 0 && selectedSamples.length === 0) {
      this.error = 'Veuillez ajouter au moins un fichier audio ou sélectionner un sample existant';
      return;
    }

    this.loading = true;
    this.error = '';

    const presetName = this.presetForm.value.name;
    const tags = this.presetForm.value.tags
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t);

    const basePayload = {
      name: presetName,
      type: this.presetForm.value.type,
      description: this.presetForm.value.description,
      tags: tags
    };

    // Cas 1: uniquement des samples existants (pas d'upload)
    if (this.uploadedFiles.length === 0) {
      const payload = {
        ...basePayload,
        samples: selectedSamples
      };

      this.presetService.createPreset(payload).subscribe({
        next: () => this.router.navigate(['/presets']),
        error: (err: any) => {
          this.error = err.message || 'Erreur lors de la création du preset';
          this.loading = false;
        }
      });
      return;
    }

    // Cas 2: upload de fichiers (avec optionnellement des samples existants)
    const request = {
      ...basePayload,
      files: this.uploadedFiles
    };

    this.presetService.createPresetWithFiles(request).subscribe({
      next: (created) => {
        if (!created || selectedSamples.length === 0) {
          this.router.navigate(['/presets']);
          return;
        }

        const mergedSamples = [...(created.samples || []), ...selectedSamples];
        this.presetService.updatePreset(created.name, { samples: mergedSamples }).subscribe({
          next: () => this.router.navigate(['/presets']),
          error: (err: any) => {
            this.error = err.message || 'Erreur lors de la mise à jour des samples';
            this.loading = false;
          }
        });
      },
      error: (err: any) => {
        this.error = err.message || 'Erreur lors de la création du preset';
        this.loading = false;
      }
    });
  }

  cancel() {
    this.router.navigate(['/presets']);
  }
}
