import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { Preset, PresetCreateRequest, PresetUpdateRequest } from '../models/preset.model';

@Injectable({
  providedIn: 'root'
})
export class PresetService {
  private readonly apiUrl = 'http://localhost:3000/api/presets';

  constructor(private http: HttpClient) {}

  /**
   * Récupère tous les presets
   */
  getPresets(): Observable<Preset[]> {
    return this.http.get<Preset[]>(this.apiUrl).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Récupère un preset par son nom
   */
  getPreset(name: string): Observable<Preset> {
    return this.http.get<Preset>(`${this.apiUrl}/${encodeURIComponent(name)}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Crée un nouveau preset (métadonnées JSON)
   */
  createPreset(preset: Partial<Preset>): Observable<Preset> {
    return this.http.post<any>(this.apiUrl, preset).pipe(
      map((res) => res?.preset ?? res),
      catchError(this.handleError)
    );
  }

  /**
   * Upload des fichiers audio dans un dossier
   */
  uploadFiles(folderName: string, files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file, file.name);
    });
    return this.http.post(`${this.apiUrl}/${encodeURIComponent(folderName)}/upload`, formData).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Crée un nouveau preset avec des fichiers audio
   */
  createPresetWithFiles(request: PresetCreateRequest): Observable<Preset> {
    const formData = new FormData();
    formData.append('name', request.name);
    
    if (request.type) {
      formData.append('type', request.type);
    }
    if (request.description) {
      formData.append('description', request.description);
    }
    if (request.tags && request.tags.length > 0) {
      formData.append('tags', JSON.stringify(request.tags));
    }

    // Ajouter les fichiers audio - le backend attend 'files' pas 'audioFiles'
    request.files.forEach((file, index) => {
      formData.append('files', file, file.name);
    });

    return this.http.post<any>(`${this.apiUrl}/create-with-files`, formData).pipe(
      map((res) => res?.preset ?? res),
      catchError(this.handleError)
    );
  }

  /**
   * Met à jour un preset existant
   */
  updatePreset(name: string, update: PresetUpdateRequest | FormData): Observable<Preset> {
    return this.http.patch<any>(`${this.apiUrl}/${encodeURIComponent(name)}`, update).pipe(
      map((res) => res?.preset ?? res),
      catchError(this.handleError)
    );
  }

  /**
   * Renomme un preset
   */
  renamePreset(oldName: string, newName: string): Observable<Preset> {
    return this.http.patch<any>(`${this.apiUrl}/${encodeURIComponent(oldName)}`, { name: newName }).pipe(
      map((res) => res?.preset ?? res),
      catchError(this.handleError)
    );
  }

  /**
   * Supprime un preset
   */
  deletePreset(name: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${encodeURIComponent(name)}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Gestion des erreurs HTTP
   */
  private handleError(error: any): Observable<never> {
    let errorMessage = 'Une erreur est survenue';
    
    if (error.error instanceof ErrorEvent) {
      // Erreur côté client
      errorMessage = `Erreur: ${error.error.message}`;
    } else {
      // Erreur côté serveur
      errorMessage = error.error?.message || `Erreur ${error.status}: ${error.statusText}`;
    }
    
    console.error('PresetService Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}
