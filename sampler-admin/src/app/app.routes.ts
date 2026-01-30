import { Routes } from '@angular/router';
import { PresetListComponent } from './features/presets/preset-list/preset-list';
import { PresetCreate } from './features/presets/preset-create/preset-create';
import { PresetDetail } from './features/presets/preset-detail/preset-detail';
import { SampleListComponent } from './features/samples/sample-list/sample-list';

export const routes: Routes = [
  { path: '', redirectTo: '/presets', pathMatch: 'full' },
  { path: 'presets', component: PresetListComponent },
  { path: 'presets/new', component: PresetCreate },
  { path: 'presets/:name', component: PresetDetail },
  { path: 'samples', component: SampleListComponent },
];
