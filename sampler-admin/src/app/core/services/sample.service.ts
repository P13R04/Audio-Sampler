import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface AudioSample {
  url: string;
  name: string;
  index?: number;
}

export interface Sample {
  name: string;
  type: string;
  samples: AudioSample[];
  isFactoryPresets?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SampleService {
  private apiUrl = `${environment.apiUrl}/presets`;

  constructor(private http: HttpClient) {}

  /**
   * Get all samples (presets of type "Sample")
   */
  getSamples(): Observable<Sample[]> {
    return this.http.get<Sample[]>(this.apiUrl).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Delete a sample by name
   */
  deleteSample(name: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${encodeURIComponent(name)}`).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Upload a single sample file
   */
  uploadSample(file: File): Observable<any> {
    const name = file.name.replace(/\.[^/.]+$/, '');
    const formData = new FormData();
    formData.append('name', name);
    formData.append('file', file);

    return this.http.post(`${environment.apiUrl}/samples`, formData).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Renomme un sample (preset de type Sample)
   */
  renameSample(oldName: string, newName: string, samples: AudioSample[]): Observable<Sample> {
    return this.http.patch<any>(`${this.apiUrl}/${encodeURIComponent(oldName)}`, { name: newName, samples }).pipe(
      map((res) => res?.preset ?? res),
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Une erreur est survenue';
    if (error.error instanceof ErrorEvent) {
      errorMessage = error.error.message;
    } else if (error.error && error.error.message) {
      errorMessage = error.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return throwError(() => new Error(errorMessage));
  }
}
