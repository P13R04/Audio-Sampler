import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { PresetService } from '../../../core/services/preset.service';
import { Preset } from '../../../core/models/preset.model';

@Component({
  selector: 'app-preset-list',
  imports: [CommonModule, RouterModule],
  templateUrl: './preset-list.html',
  styleUrl: './preset-list.scss'
})
export class PresetListComponent implements OnInit {
  presets: Preset[] = [];
  filteredPresets: Preset[] = [];
  loading = false;
  error: string | null = null;
  searchTerm = '';
  selectedCategory = 'all';

  constructor(
    private presetService: PresetService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPresets();
  }

  loadPresets(): void {
    this.loading = true;
    this.error = null;
    
    this.presetService.getPresets().subscribe({
      next: (presets) => {
        this.presets = presets;
        this.filteredPresets = presets;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Erreur lors du chargement des presets';
        this.loading = false;
        console.error('Error loading presets:', err);
      }
    });
  }

  filterPresets(): void {
    this.filteredPresets = this.presets.filter(preset => {
      const matchesSearch = preset.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesCategory = this.selectedCategory === 'all' || preset.type === this.selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }

  onSearchChange(event: Event): void {
    this.searchTerm = (event.target as HTMLInputElement).value;
    this.filterPresets();
  }

  onCategoryChange(category: string): void {
    this.selectedCategory = category;
    this.filterPresets();
  }

  createPreset(): void {
    this.router.navigate(['/presets/new']);
  }

  viewPreset(preset: Preset): void {
    this.router.navigate(['/presets', preset.name]);
  }

  deletePreset(preset: Preset): void {
    if (preset.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être supprimés');
      return;
    }
    
    if (confirm(`Êtes-vous sûr de vouloir supprimer le preset "${preset.name}" ?`)) {
      this.presetService.deletePreset(preset.name).subscribe({
        next: () => {
          this.loadPresets();
        },
        error: (err) => {
          alert('Erreur lors de la suppression');
          console.error('Error deleting preset:', err);
        }
      });
    }
  }

  renamePreset(preset: Preset): void {
    if (preset.isFactoryPresets) {
      alert('Les presets factory ne peuvent pas être renommés');
      return;
    }
    
    const newName = prompt('Nouveau nom du preset:', preset.name);
    if (newName && newName !== preset.name) {
      this.presetService.renamePreset(preset.name, newName).subscribe({
        next: () => {
          this.loadPresets();
        },
        error: (err) => {
          alert('Erreur lors du renommage');
          console.error('Error renaming preset:', err);
        }
      });
    }
  }
}
