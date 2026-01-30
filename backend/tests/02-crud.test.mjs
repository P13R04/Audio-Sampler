// tests/02-crud.test.mjs - Tests CRUD des presets
import { test } from "node:test";
import assert from "node:assert";

const API_BASE = "http://localhost:3000";

// Helper pour créer un preset de test
const createTestPreset = (name = "Test Preset") => ({
  name,
  type: "test",
  samples: [
    { url: "/presets/test/sample1.wav", name: "Sample 1" },
    { url: "/presets/test/sample2.wav", name: "Sample 2" },
  ],
  isFactoryPresets: false,
});

test("GET /api/presets returns array", async () => {
  const response = await fetch(`${API_BASE}/api/presets`);
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.ok(Array.isArray(data));
});

test("GET /api/presets with query filter", async () => {
  const response = await fetch(`${API_BASE}/api/presets?type=drums`);
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.ok(Array.isArray(data));
  // Tous les résultats doivent avoir type=drums (s'il y en a)
  data.forEach((preset) => {
    if (preset.type) {
      assert.strictEqual(preset.type.toLowerCase(), "drums");
    }
  });
});

test("POST /api/presets creates new preset", async () => {
  const newPreset = createTestPreset(`Test ${Date.now()}`);

  const response = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const data = await response.json();

  assert.strictEqual(response.status, 201);
  assert.ok(data.preset);
  assert.strictEqual(data.preset.name, newPreset.name);
  assert.ok(data.slug);
  assert.ok(data.preset.createdAt);
  assert.ok(data.preset.updatedAt);
});

test("POST /api/presets rejects invalid preset (no name)", async () => {
  const invalidPreset = {
    type: "test",
    samples: [],
  };

  const response = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidPreset),
  });

  assert.strictEqual(response.status, 400);
  const data = await response.json();
  assert.ok(data.error);
  assert.ok(data.details);
});

test("POST /api/presets rejects invalid preset (samples not array)", async () => {
  const invalidPreset = {
    name: "Invalid Preset",
    samples: "not an array",
  };

  const response = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(invalidPreset),
  });

  assert.strictEqual(response.status, 400);
});

test("GET /api/presets/:name returns specific preset", async () => {
  // Créer d'abord un preset
  const testName = `GetTest-${Date.now()}`;
  const newPreset = createTestPreset(testName);

  const createResponse = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const createData = await createResponse.json();
  const slug = createData.slug;

  // Récupérer le preset
  const getResponse = await fetch(`${API_BASE}/api/presets/${slug}`);
  const preset = await getResponse.json();

  assert.strictEqual(getResponse.status, 200);
  assert.strictEqual(preset.name, testName);
  assert.ok(Array.isArray(preset.samples));
});

test("GET /api/presets/:name returns 404 for non-existent", async () => {
  const response = await fetch(`${API_BASE}/api/presets/non-existent-preset-xyz`);

  assert.strictEqual(response.status, 404);
  const data = await response.json();
  assert.ok(data.error);
});

test("PUT /api/presets/:name updates preset", async () => {
  // Créer preset
  const testName = `UpdateTest-${Date.now()}`;
  const newPreset = createTestPreset(testName);

  const createResponse = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const createData = await createResponse.json();
  const slug = createData.slug;

  // Mettre à jour
  const updatedPreset = {
    ...newPreset,
    type: "updated",
    samples: [{ url: "/presets/test/new-sample.wav", name: "New Sample" }],
  };

  const updateResponse = await fetch(`${API_BASE}/api/presets/${slug}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedPreset),
  });

  const updateData = await updateResponse.json();

  assert.strictEqual(updateResponse.status, 200);
  assert.strictEqual(updateData.preset.type, "updated");
  assert.strictEqual(updateData.preset.samples.length, 1);
  assert.ok(updateData.preset.updatedAt);
});

test("PATCH /api/presets/:name partially updates preset", async () => {
  // Créer preset
  const testName = `PatchTest-${Date.now()}`;
  const newPreset = createTestPreset(testName);

  const createResponse = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const createData = await createResponse.json();
  const slug = createData.slug;

  // Mise à jour partielle
  const patchResponse = await fetch(`${API_BASE}/api/presets/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "patched" }),
  });

  const patchData = await patchResponse.json();

  assert.strictEqual(patchResponse.status, 200);
  assert.strictEqual(patchData.preset.type, "patched");
  // Le nom doit rester inchangé
  assert.strictEqual(patchData.preset.name, testName);
  // Les samples doivent rester inchangés
  assert.strictEqual(patchData.preset.samples.length, 2);
});

test("PATCH /api/presets/:name renames preset", async () => {
  // Créer preset
  const oldName = `RenameTest-${Date.now()}`;
  const newPreset = createTestPreset(oldName);

  const createResponse = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const createData = await createResponse.json();
  const oldSlug = createData.slug;

  // Renommer
  const newName = `Renamed-${Date.now()}`;
  const patchResponse = await fetch(`${API_BASE}/api/presets/${oldSlug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });

  const patchData = await patchResponse.json();

  assert.strictEqual(patchResponse.status, 200);
  assert.strictEqual(patchData.preset.name, newName);
  assert.ok(patchData.newSlug);
  assert.notStrictEqual(patchData.oldSlug, patchData.newSlug);

  // Vérifier que l'ancien slug ne fonctionne plus
  const oldResponse = await fetch(`${API_BASE}/api/presets/${oldSlug}`);
  assert.strictEqual(oldResponse.status, 404);

  // Vérifier que le nouveau slug fonctionne
  const newResponse = await fetch(`${API_BASE}/api/presets/${patchData.newSlug}`);
  assert.strictEqual(newResponse.status, 200);
});

test("DELETE /api/presets/:name removes preset", async () => {
  // Créer preset
  const testName = `DeleteTest-${Date.now()}`;
  const newPreset = createTestPreset(testName);

  const createResponse = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newPreset),
  });

  const createData = await createResponse.json();
  const slug = createData.slug;

  // Supprimer
  const deleteResponse = await fetch(`${API_BASE}/api/presets/${slug}`, {
    method: "DELETE",
  });

  const deleteData = await deleteResponse.json();

  assert.strictEqual(deleteResponse.status, 200);
  assert.ok(deleteData.message);

  // Vérifier que le preset n'existe plus
  const getResponse = await fetch(`${API_BASE}/api/presets/${slug}`);
  assert.strictEqual(getResponse.status, 404);
});

test("DELETE /api/presets/:name returns 404 for non-existent", async () => {
  const response = await fetch(`${API_BASE}/api/presets/non-existent-xyz`, {
    method: "DELETE",
  });

  assert.strictEqual(response.status, 404);
});
