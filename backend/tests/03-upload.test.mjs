// tests/03-upload.test.mjs - Tests upload de fichiers
import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = "http://localhost:3000";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Créer un fichier audio factice pour les tests
function createDummyAudioFile() {
  // Créer un buffer WAV minimal valide (header + quelques bytes)
  const buffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x00, 0x00, 0x00, // ChunkSize
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    0x66, 0x6d, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // Subchunk1Size
    0x01, 0x00, 0x01, 0x00, // AudioFormat, NumChannels
    0x44, 0xac, 0x00, 0x00, // SampleRate (44100)
    0x88, 0x58, 0x01, 0x00, // ByteRate
    0x02, 0x00, 0x10, 0x00, // BlockAlign, BitsPerSample
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x00, 0x00, 0x00, // Subchunk2Size
  ]);

  return new Blob([buffer], { type: "audio/wav" });
}

test("POST /api/presets/:folder/upload accepts audio files", async () => {
  const formData = new FormData();
  const audioFile = createDummyAudioFile();

  formData.append("files", audioFile, "test-sample.wav");

  const response = await fetch(`${API_BASE}/api/presets/test-upload/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  assert.strictEqual(response.status, 201);
  assert.ok(data.files);
  assert.ok(Array.isArray(data.files));
  assert.strictEqual(data.files.length, 1);
  assert.strictEqual(data.files[0].filename, "test-sample.wav");
  assert.ok(data.files[0].url);
});

test("POST /api/presets/:folder/upload accepts multiple files", async () => {
  const formData = new FormData();

  for (let i = 1; i <= 3; i++) {
    const audioFile = createDummyAudioFile();
    formData.append("files", audioFile, `sample-${i}.wav`);
  }

  const response = await fetch(`${API_BASE}/api/presets/multi-test/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  assert.strictEqual(response.status, 201);
  assert.strictEqual(data.count, 3);
  assert.strictEqual(data.files.length, 3);
});

test("POST /api/presets/:folder/upload rejects if no files", async () => {
  const formData = new FormData();

  const response = await fetch(`${API_BASE}/api/presets/no-files/upload`, {
    method: "POST",
    body: formData,
  });

  assert.strictEqual(response.status, 400);
  const data = await response.json();
  assert.ok(data.error);
});

test("POST /api/presets/create-with-files creates preset with files", async () => {
  const formData = new FormData();
  const testName = `UploadPreset-${Date.now()}`;

  formData.append("name", testName);
  formData.append("type", "upload-test");
  formData.append("isFactoryPresets", "false");

  // Ajouter quelques fichiers
  for (let i = 1; i <= 2; i++) {
    const audioFile = createDummyAudioFile();
    formData.append("files", audioFile, `sample-${i}.wav`);
  }

  const response = await fetch(`${API_BASE}/api/presets/create-with-files`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  assert.strictEqual(response.status, 201);
  assert.ok(data.preset);
  assert.strictEqual(data.preset.name, testName);
  assert.strictEqual(data.preset.samples.length, 2);
  assert.strictEqual(data.filesCount, 2);

  // Vérifier que le preset existe bien
  const slug = data.preset.name.toLowerCase().replace(/\s+/g, "-");
  const getResponse = await fetch(`${API_BASE}/api/presets/${slug}`);
  assert.strictEqual(getResponse.status, 200);
});

test("POST /api/presets/create-with-files rejects without name", async () => {
  const formData = new FormData();

  formData.append("type", "test");

  const audioFile = createDummyAudioFile();
  formData.append("files", audioFile, "sample.wav");

  const response = await fetch(`${API_BASE}/api/presets/create-with-files`, {
    method: "POST",
    body: formData,
  });

  assert.strictEqual(response.status, 400);
  const data = await response.json();
  assert.ok(data.error);
});

test("POST /api/presets/create-with-files rejects without files", async () => {
  const formData = new FormData();

  formData.append("name", "Test Without Files");
  formData.append("type", "test");

  const response = await fetch(`${API_BASE}/api/presets/create-with-files`, {
    method: "POST",
    body: formData,
  });

  assert.strictEqual(response.status, 400);
  const data = await response.json();
  assert.ok(data.error);
});

// Note: Tests pour la validation des types de fichiers et tailles
// nécessiteraient de créer de vrais fichiers avec des extensions/tailles différentes
// Ces tests sont laissés comme exercice ou peuvent être ajoutés si nécessaire
