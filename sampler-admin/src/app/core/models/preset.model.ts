export interface Sample {
  url: string;
  name: string;
  playbackRate?: number;
  type?: string;
  samples?: Sample[]; // For preset compatibility
}

export interface Preset {
  name: string;
  samples: Sample[];
  type?: string;
  category?: string;
  description?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  isFactoryPresets?: boolean;
}

export interface PresetCreateRequest {
  name: string;
  type?: string;
  description?: string;
  tags?: string[];
  files: File[];
}

export interface PresetUpdateRequest {
  name?: string;
  type?: string;
  description?: string;
  tags?: string[];
  samples?: Sample[];
}
