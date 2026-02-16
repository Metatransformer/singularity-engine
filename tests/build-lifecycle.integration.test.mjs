/**
 * Build Lifecycle Integration Test
 * Simulates the full pipeline: deployer writes to _builds + _showcase,
 * then verifies the builds gallery API reads them correctly.
 *
 * This test uses the live API and writes to protected namespaces indirectly
 * (the deployer Lambda writes there, but the public API blocks direct writes).
 * So we test what we CAN test via the public API:
 * - Creating a namespace (simulating an app's data store)
 * - Writing/reading app data through SingularityDB
 * - Verifying the builds gallery API reads existing builds
 * - Full cleanup lifecycle
 */
import { describe, it, expect, afterAll } from "vitest";

const API_URL = process.env.SINGULARITY_DB_URL || "https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com/api/data";
const BASE_URL = API_URL.replace(/\/api\/data$/, "");

async function apiGet(path) {
  const r = await fetch(`${BASE_URL}${path}`);
  return { status: r.status, data: await r.json(), headers: r.headers };
}

async function apiPut(path, body) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function apiDelete(path) {
  const r = await fetch(`${BASE_URL}${path}`, { method: "DELETE" });
  return { status: r.status, data: await r.json() };
}

// ── Full Build Lifecycle ────────────────────────────────────────────────────
describe("Build Lifecycle — App Data Simulation", () => {
  const appNs = `app-lifecycle-test-${Date.now()}`;

  afterAll(async () => {
    // Cleanup
    const list = await apiGet(`/api/data/${appNs}`);
    if (list.status === 200 && Array.isArray(list.data)) {
      for (const item of list.data) {
        await apiDelete(`/api/data/${appNs}/${item.key}`);
      }
    }
  });

  it("simulates full app build lifecycle", async () => {
    // Phase 1: App initialization — no data yet
    const empty = await apiGet(`/api/data/${appNs}`);
    expect(empty.status).toBe(200);
    expect(empty.data).toEqual([]);

    // Phase 2: App saves initial state (like a freshly deployed game)
    await apiPut(`/api/data/${appNs}/gameState`, {
      value: { level: 1, score: 0, lives: 3 },
    });
    await apiPut(`/api/data/${appNs}/settings`, {
      value: { sound: true, difficulty: "normal", theme: "dark" },
    });
    await apiPut(`/api/data/${appNs}/highscores`, {
      value: [],
    });

    // Phase 3: Verify initial state
    const state = await apiGet(`/api/data/${appNs}/gameState`);
    expect(state.status).toBe(200);
    expect(state.data).toEqual({ level: 1, score: 0, lives: 3 });

    const settings = await apiGet(`/api/data/${appNs}/settings`);
    expect(settings.data).toEqual({ sound: true, difficulty: "normal", theme: "dark" });

    // Phase 4: Simulate gameplay — update state
    await apiPut(`/api/data/${appNs}/gameState`, {
      value: { level: 5, score: 2500, lives: 1 },
    });

    // Phase 5: Simulate game over — save high score
    const currentScores = (await apiGet(`/api/data/${appNs}/highscores`)).data || [];
    const updatedScores = [
      ...currentScores,
      { name: "Player1", score: 2500, date: new Date().toISOString() },
    ].sort((a, b) => b.score - a.score);
    await apiPut(`/api/data/${appNs}/highscores`, { value: updatedScores });

    // Phase 6: Another player adds score
    const scores2 = (await apiGet(`/api/data/${appNs}/highscores`)).data;
    const updatedScores2 = [
      ...scores2,
      { name: "Player2", score: 5000, date: new Date().toISOString() },
    ].sort((a, b) => b.score - a.score);
    await apiPut(`/api/data/${appNs}/highscores`, { value: updatedScores2 });

    // Phase 7: Verify final state
    const finalScores = await apiGet(`/api/data/${appNs}/highscores`);
    expect(finalScores.data).toHaveLength(2);
    expect(finalScores.data[0].name).toBe("Player2"); // Higher score first
    expect(finalScores.data[0].score).toBe(5000);
    expect(finalScores.data[1].name).toBe("Player1");

    // Phase 8: List all keys — verify namespace integrity
    const allKeys = await apiGet(`/api/data/${appNs}`);
    expect(allKeys.status).toBe(200);
    expect(allKeys.data).toHaveLength(3);
    const keyNames = allKeys.data.map((i) => i.key).sort();
    expect(keyNames).toEqual(["gameState", "highscores", "settings"]);

    // Verify list values are unwrapped
    const hsItem = allKeys.data.find((i) => i.key === "highscores");
    expect(Array.isArray(hsItem.value)).toBe(true);
    expect(hsItem.value[0].name).toBe("Player2");

    // Phase 9: Delete game state (player resets)
    await apiDelete(`/api/data/${appNs}/gameState`);
    const deleted = await apiGet(`/api/data/${appNs}/gameState`);
    expect(deleted.status).toBe(404);

    // Phase 10: Verify remaining data intact
    const remaining = await apiGet(`/api/data/${appNs}`);
    expect(remaining.data).toHaveLength(2);
  });
});

// ── Builds Gallery API ──────────────────────────────────────────────────────
describe("Build Lifecycle — Builds Gallery Reads", () => {
  it("GET /api/builds returns valid paginated structure", async () => {
    const result = await apiGet("/api/builds");
    expect(result.status).toBe(200);
    expect(result.data).toHaveProperty("builds");
    expect(result.data).toHaveProperty("total");
    expect(result.data).toHaveProperty("page");
    expect(result.data).toHaveProperty("per_page");
    expect(Array.isArray(result.data.builds)).toBe(true);
  });

  it("builds gallery respects per_page limit", async () => {
    const result = await apiGet("/api/builds?per_page=2");
    expect(result.status).toBe(200);
    expect(result.data.builds.length).toBeLessThanOrEqual(2);
    expect(result.data.per_page).toBe(2);
  });

  it("builds gallery pagination works", async () => {
    const page1 = await apiGet("/api/builds?per_page=2&page=1");
    const page2 = await apiGet("/api/builds?per_page=2&page=2");
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);

    // Pages should have different builds (if enough data exists)
    if (page1.data.total > 2 && page2.data.builds.length > 0) {
      const ids1 = page1.data.builds.map((b) => b.id);
      const ids2 = page2.data.builds.map((b) => b.id);
      const overlap = ids1.filter((id) => ids2.includes(id));
      expect(overlap).toHaveLength(0);
    }
  });

  it("builds gallery sort=coolness returns descending scores", async () => {
    const result = await apiGet("/api/builds?sort=coolness&per_page=20");
    expect(result.status).toBe(200);
    const scores = result.data.builds.map((b) => b.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("builds have all required fields", async () => {
    const result = await apiGet("/api/builds?per_page=5");
    for (const build of result.data.builds) {
      expect(build).toHaveProperty("id");
      expect(build).toHaveProperty("name");
      expect(build).toHaveProperty("score");
      expect(typeof build.score).toBe("number");
      expect(build).toHaveProperty("query");
      expect(build).toHaveProperty("username");
      expect(build).toHaveProperty("build_url");
    }
  });
});

// ── Protected Namespace Enforcement ─────────────────────────────────────────
describe("Build Lifecycle — Protected Namespaces", () => {
  it("blocks direct writes to _builds (deployer-only)", async () => {
    const result = await apiPut("/api/data/_builds/hack-attempt", { value: "fake" });
    expect(result.status).toBe(403);
  });

  it("blocks direct writes to _showcase (deployer-only)", async () => {
    const result = await apiPut("/api/data/_showcase/hack-attempt", { value: "fake" });
    expect(result.status).toBe(403);
  });

  it("blocks direct writes to _reply_queue", async () => {
    const result = await apiPut("/api/data/_reply_queue/hack", { value: "fake" });
    expect(result.status).toBe(403);
  });

  it("blocks direct writes to _rate_limits", async () => {
    const result = await apiPut("/api/data/_rate_limits/hack", { value: "fake" });
    expect(result.status).toBe(403);
  });

  it("blocks writes to any underscore-prefixed namespace", async () => {
    const result = await apiPut("/api/data/_anything/hack", { value: "fake" });
    expect(result.status).toBe(403);
  });

  it("allows reads from _showcase (public gallery)", async () => {
    const result = await apiGet("/api/data/_showcase");
    expect(result.status).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

// ── Edge Cases ──────────────────────────────────────────────────────────────
describe("Build Lifecycle — Edge Cases", () => {
  const edgeNs = `edge-test-${Date.now()}`;

  afterAll(async () => {
    for (const key of ["empty-string", "zero", "false-val", "nested-deep", "large-array"]) {
      try { await apiDelete(`/api/data/${edgeNs}/${key}`); } catch {}
    }
  });

  it("stores and retrieves empty string", async () => {
    await apiPut(`/api/data/${edgeNs}/empty-string`, { value: "" });
    const get = await apiGet(`/api/data/${edgeNs}/empty-string`);
    expect(get.status).toBe(200);
    expect(get.data).toBe("");
  });

  it("stores and retrieves zero", async () => {
    await apiPut(`/api/data/${edgeNs}/zero`, { value: 0 });
    const get = await apiGet(`/api/data/${edgeNs}/zero`);
    expect(get.status).toBe(200);
    expect(get.data).toBe(0);
  });

  it("stores and retrieves false", async () => {
    await apiPut(`/api/data/${edgeNs}/false-val`, { value: false });
    const get = await apiGet(`/api/data/${edgeNs}/false-val`);
    expect(get.status).toBe(200);
    expect(get.data).toBe(false);
  });

  it("stores and retrieves deeply nested object", async () => {
    const deep = { a: { b: { c: { d: { e: "deep" } } } } };
    await apiPut(`/api/data/${edgeNs}/nested-deep`, { value: deep });
    const get = await apiGet(`/api/data/${edgeNs}/nested-deep`);
    expect(get.data).toEqual(deep);
  });

  it("stores and retrieves large array (100 items)", async () => {
    const arr = Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: `Item ${i}`,
      score: Math.floor(Math.random() * 1000),
    }));
    await apiPut(`/api/data/${edgeNs}/large-array`, { value: arr });
    const get = await apiGet(`/api/data/${edgeNs}/large-array`);
    expect(get.data).toHaveLength(100);
    expect(get.data[0].id).toBe(0);
    expect(get.data[99].id).toBe(99);
  });
});
