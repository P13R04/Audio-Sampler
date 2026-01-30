import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SampleService, Sample } from '../../../core/services/sample.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-sample-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sample-list.html',
  styleUrls: ['./sample-list.scss']
})
export class SampleListComponent implements OnInit {
  samples: Sample[] = [];
  loading = true;
  error: string | null = null;
  playingAudio: HTMLAudioElement | null = null;
  editingSampleName: string | null = null;
  nameDrafts: Record<string, string> = {};

  constructor(
    private sampleService: SampleService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSamples();
  }

  loadSamples() {
    this.loading = true;
    this.error = null;
    this.sampleService.getSamples().subscribe({
      next: (presets) => {
        // Filter only samples (type === 'Sample')
        this.samples = presets.filter(p => p.type === 'Sample');
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message;
        this.loading = false;
      }
    });
  }

  startEditName(sample: Sample) {
    this.editingSampleName = sample.name;
    this.nameDrafts[sample.name] = sample.name;
  }

  cancelEditName() {
    this.editingSampleName = null;
  }

  saveName(sample: Sample) {
    const oldName = sample.name;
    const newName = (this.nameDrafts[oldName] || '').trim();
    if (!newName) {
      this.error = 'Nom du sample invalide';
      return;
    }

    const updatedSamples = (sample.samples || []).map((s) => ({
      ...s,
      name: newName
    }));

    this.sampleService.renameSample(oldName, newName, updatedSamples).subscribe({
      next: (updated) => {
        if (updated) {
          sample.name = updated.name || newName;
          sample.samples = updated.samples || updatedSamples;
        } else {
          sample.name = newName;
          sample.samples = updatedSamples;
        }
        delete this.nameDrafts[oldName];
        this.nameDrafts[sample.name] = sample.name;
        this.editingSampleName = null;
      },
      error: (err) => {
        this.error = err.message;
      }
    });
  }

  playSample(sample: Sample) {
    // Stop previous audio if any
    if (this.playingAudio) {
      this.playingAudio.pause();
      this.playingAudio = null;
    }

    // sample est un preset de type "Sample" avec un array samples[]
    // Le sample audio réel est à sample.samples[0]
    const audioSample = (sample as any).samples?.[0];
    if (!audioSample || !audioSample.url) {
      this.error = `Sample invalide: pas de fichier audio trouvé`;
      return;
    }

    // Construire l'URL correcte
    // sample.url est relatif comme "./single-sample-test/test-audio.wav"
    const cleanUrl = audioSample.url.startsWith('./') ? audioSample.url.substring(2) : audioSample.url;
    const audioUrl = `http://localhost:3000/presets/${cleanUrl}`;
    
    console.log('Playing audio:', { sample: sample.name, url: audioUrl });

    const audio = new Audio();
    
    // Créer un élément source avec le MIME type
    const source = document.createElement('source');
    source.src = audioUrl;
    source.type = 'audio/wav';
    audio.appendChild(source);
    
    // Gestion des erreurs
    audio.onerror = (e) => {
      this.error = `Erreur lors du chargement du sample: ${sample.name}`;
      console.error('Audio loading error:', audio.error, 'URL:', audioUrl);
    };
    
    this.playingAudio = audio;
    audio.play().catch(err => {
      this.error = `Erreur lors de la lecture: ${err.message}`;
      console.error('Audio play error:', err);
    });
  }

  deleteSample(sample: Sample) {
    if (!confirm(`Supprimer le sample "${sample.name}" ?`)) return;
    
    this.sampleService.deleteSample(sample.name).subscribe({
      next: () => {
        this.loadSamples();
      },
      error: (err) => {
        alert(`Erreur: ${err.message}`);
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.loading = true;
    this.sampleService.uploadSample(file).subscribe({
      next: () => {
        this.loadSamples();
      },
      error: (err) => {
        this.error = err.message;
        this.loading = false;
      }
    });
  }

  goToPresets() {
    this.router.navigate(['/presets']);
  }
}
