import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-file-uploader',
  imports: [CommonModule],
  templateUrl: './file-uploader.html',
  styleUrl: './file-uploader.scss',
})
export class FileUploader {
  @Input() maxFiles = 16;
  @Output() filesSelected = new EventEmitter<File[]>();

  files: File[] = [];
  isDragging = false;
  error = '';

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles) {
      this.handleFiles(Array.from(droppedFiles));
    }
  }

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(Array.from(input.files));
    }
  }

  handleFiles(newFiles: File[]) {
    this.error = '';

    // Filter audio files
    const audioFiles = newFiles.filter(f => f.type.startsWith('audio/'));
    
    if (audioFiles.length !== newFiles.length) {
      this.error = 'Seuls les fichiers audio sont acceptés';
    }

    // Check max files
    if (this.files.length + audioFiles.length > this.maxFiles) {
      this.error = `Maximum ${this.maxFiles} fichiers`;
      return;
    }

    this.files = [...this.files, ...audioFiles];
    this.filesSelected.emit(this.files);
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
    this.filesSelected.emit(this.files);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
