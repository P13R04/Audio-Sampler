// tests/01-health.test.mjs - Tests health check
import { test } from "node:test";
import assert from "node:assert";

const API_BASE = "http://localhost:3000";

test("Health check returns OK", async () => {
  const response = await fetch(`${API_BASE}/api/health`);
  const data = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(data.ok, true);
  assert.ok(data.timestamp);
  assert.ok(typeof data.uptime === "number");
});

test("Health check includes environment info", async () => {
  const response = await fetch(`${API_BASE}/api/health`);
  const data = await response.json();

  assert.ok(data.env);
  assert.ok(["development", "production", "test"].includes(data.env));
});
