import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-audio-preview',
  imports: [CommonModule],
  templateUrl: './audio-preview.html',
  styleUrl: './audio-preview.scss',
})
export class AudioPreview implements OnInit {
  @Input() audioUrl = '';
  @ViewChild('audioElement') audioElement!: ElementRef<HTMLAudioElement>;

  isPlaying = false;
  currentTime = 0;
  duration = 0;
  volume = 0.7;

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
