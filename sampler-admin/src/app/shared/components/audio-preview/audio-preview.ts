import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-audio-preview',
  imports: [CommonModule],
  templateUrl: './audio-preview.html',
  styleUrl: './audio-preview.scss',
})
export class AudioPreview implements OnInit {
  @Input() set audioUrl(url: string) {
    this._audioUrl = this.getAbsoluteUrl(url);
  }
  get audioUrl(): string {
    return this._audioUrl;
  }
  private _audioUrl = '';

  @ViewChild('audioElement') audioElement!: ElementRef<HTMLAudioElement>;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  volume = 0.7;

  private getAbsoluteUrl(url: string): string {
    if (!url) return '';
    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Convert relative URL to absolute backend URL
    const baseUrl = environment.apiUrl.replace('/api', '');
    // Remove ./ and encode URI components properly
    const cleanPath = url.replace('./', '');
    // Split by / and encode each segment
    const encodedPath = cleanPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    return `${baseUrl}/presets/${encodedPath}`;
  }

  ngOnInit() {
    // Empty - audio element will be initialized in template
  }

  togglePlay() {
    const audio = this.audioElement?.nativeElement;
    if (!audio) return;

    if (this.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    this.isPlaying = !this.isPlaying;
  }

  onTimeUpdate(event: Event) {
    const audio = event.target as HTMLAudioElement;
    this.currentTime = audio.currentTime;
  }

  onLoadedMetadata(event: Event) {
    const audio = event.target as HTMLAudioElement;
    this.duration = audio.duration;
  }

  onEnded() {
    this.isPlaying = false;
    this.currentTime = 0;
  }

  seek(event: Event) {
    const input = event.target as HTMLInputElement;
    const audio = this.audioElement?.nativeElement;
    if (audio) {
      audio.currentTime = Number(input.value);
    }
  }

  setVolume(event: Event) {
    const input = event.target as HTMLInputElement;
    const audio = this.audioElement?.nativeElement;
    this.volume = Number(input.value);
    if (audio) {
      audio.volume = this.volume;
    }
  }

  formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
