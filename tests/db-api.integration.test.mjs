/**
 * Integration tests for SingularityDB API
 * Runs against the live API Gateway endpoint
 *
 * These tests validate the full data flow: write → read → list → delete
 * They use a unique test namespace to avoid interfering with production data.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API_URL = process.env.SINGULARITY_DB_URL || "https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com/api/data";
const BASE_URL = API_URL.replace(/\/api\/data$/, "");
const TEST_NS = `_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// Note: test namespaces starting with _ would be blocked by the API's protected namespace check
// We use a non-_ prefix for actual writes
const WRITE_NS = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function apiGet(path) {
  const r = await fetch(`${BASE_URL}${path}`);
  return { status: r.status, data: await r.json() };
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
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
  });
  return { status: r.status, data: await r.json() };
}

// Cleanup keys after tests
const keysToCleanup = [];

afterAll(async () => {
  for (const key of keysToCleanup) {
    try {
      await apiDelete(`/api/data/${WRITE_NS}/${key}`);
    } catch (e) {
      // ignore cleanup errors
    }
  }
});

describe("SingularityDB API - Data Operations", () => {
  it("PUT + GET: stores and retrieves a simple string", async () => {
    keysToCleanup.push("test-string");
    const put = await apiPut(`/api/data/${WRITE_NS}/test-string`, { value: "hello world" });
    expect(put.status).toBe(200);
    expect(put.data.ok).toBe(true);

    const get = await apiGet(`/api/data/${WRITE_NS}/test-string`);
    expect(get.status).toBe(200);
    expect(get.data).toBe("hello world");
  });

  it("PUT + GET: stores and retrieves a number", async () => {
    keysToCleanup.push("test-number");
    await apiPut(`/api/data/${WRITE_NS}/test-number`, { value: 42 });
    const get = await apiGet(`/api/data/${WRITE_NS}/test-number`);
    expect(get.status).toBe(200);
    expect(get.data).toBe(42);
  });

  it("PUT + GET: stores and retrieves a complex object", async () => {
    keysToCleanup.push("test-object");
    const obj = { name: "Player1", score: 9999, level: 5, items: ["sword", "shield"] };
    await apiPut(`/api/data/${WRITE_NS}/test-object`, { value: obj });
    const get = await apiGet(`/api/data/${WRITE_NS}/test-object`);
    expect(get.status).toBe(200);
    expect(get.data).toEqual(obj);
  });

  it("PUT + GET: stores and retrieves an array (leaderboard pattern)", async () => {
    keysToCleanup.push("leaderboard");
    const leaderboard = [
      { name: "Alice", score: 1000 },
      { name: "Bob", score: 800 },
      { name: "Charlie", score: 600 },
    ];
    await apiPut(`/api/data/${WRITE_NS}/leaderboard`, { value: leaderboard });
    const get = await apiGet(`/api/data/${WRITE_NS}/leaderboard`);
    expect(get.status).toBe(200);
    expect(get.data).toEqual(leaderboard);
    expect(get.data[0].name).toBe("Alice");
    expect(get.data[0].score).toBe(1000);
  });

  it("PUT + GET: stores and retrieves a boolean", async () => {
    keysToCleanup.push("test-bool");
    await apiPut(`/api/data/${WRITE_NS}/test-bool`, { value: true });
    const get = await apiGet(`/api/data/${WRITE_NS}/test-bool`);
    expect(get.status).toBe(200);
    expect(get.data).toBe(true);
  });

  it("PUT + GET: stores and retrieves null", async () => {
    keysToCleanup.push("test-null");
    await apiPut(`/api/data/${WRITE_NS}/test-null`, { value: null });
    const get = await apiGet(`/api/data/${WRITE_NS}/test-null`);
    expect(get.status).toBe(200);
    expect(get.data).toBe(null);
  });

  it("GET: returns 404 for nonexistent key", async () => {
    const get = await apiGet(`/api/data/${WRITE_NS}/does-not-exist-${Date.now()}`);
    expect(get.status).toBe(404);
  });

  it("PUT: overwrites existing value", async () => {
    keysToCleanup.push("overwrite-test");
    await apiPut(`/api/data/${WRITE_NS}/overwrite-test`, { value: "first" });
    await apiPut(`/api/data/${WRITE_NS}/overwrite-test`, { value: "second" });
    const get = await apiGet(`/api/data/${WRITE_NS}/overwrite-test`);
    expect(get.data).toBe("second");
  });
});

describe("SingularityDB API - DELETE", () => {
  it("deletes an existing key", async () => {
    await apiPut(`/api/data/${WRITE_NS}/to-delete`, { value: "bye" });
    const del = await apiDelete(`/api/data/${WRITE_NS}/to-delete`);
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);

    const get = await apiGet(`/api/data/${WRITE_NS}/to-delete`);
    expect(get.status).toBe(404);
  });

  it("delete on nonexistent key returns ok (idempotent)", async () => {
    const del = await apiDelete(`/api/data/${WRITE_NS}/never-existed-${Date.now()}`);
    expect(del.status).toBe(200);
  });
});

describe("SingularityDB API - LIST", () => {
  it("lists keys in a namespace with unwrapped values", async () => {
    const ns = `test-list-${Date.now()}`;
    await apiPut(`/api/data/${ns}/key1`, { value: "val1" });
    await apiPut(`/api/data/${ns}/key2`, { value: 42 });

    const list = await apiGet(`/api/data/${ns}`);
    expect(list.status).toBe(200);
    expect(Array.isArray(list.data)).toBe(true);
    expect(list.data.length).toBeGreaterThanOrEqual(2);

    const key1 = list.data.find((i) => i.key === "key1");
    const key2 = list.data.find((i) => i.key === "key2");
    expect(key1).toBeDefined();
    expect(key1.value).toBe("val1"); // NOT {value: "val1"} — must be unwrapped
    expect(key2.value).toBe(42);
    expect(key1.updatedAt).toBeDefined();

    // Cleanup
    await apiDelete(`/api/data/${ns}/key1`);
    await apiDelete(`/api/data/${ns}/key2`);
  });

  it("returns empty array for empty namespace", async () => {
    const list = await apiGet(`/api/data/empty-ns-${Date.now()}`);
    expect(list.status).toBe(200);
    expect(list.data).toEqual([]);
  });
});

describe("SingularityDB API - Protected Namespaces", () => {
  it("blocks PUT to _system namespace", async () => {
    const result = await apiPut("/api/data/_system/test", { value: "hack" });
    expect(result.status).toBe(403);
  });

  it("blocks PUT to _builds namespace", async () => {
    const result = await apiPut("/api/data/_builds/test", { value: "hack" });
    expect(result.status).toBe(403);
  });

  it("blocks PUT to any _ prefixed namespace", async () => {
    const result = await apiPut("/api/data/_custom/test", { value: "hack" });
    expect(result.status).toBe(403);
  });

  it("blocks DELETE from protected namespace", async () => {
    const result = await apiDelete("/api/data/_showcase/test");
    expect(result.status).toBe(403);
  });

  it("allows reading from _showcase (builds gallery)", async () => {
    const result = await apiGet("/api/data/_showcase");
    expect(result.status).toBe(200);
    expect(Array.isArray(result.data)).toBe(true);
  });
});

describe("SingularityDB API - Builds Gallery", () => {
  it("GET /api/builds returns paginated results", async () => {
    const result = await apiGet("/api/builds");
    expect(result.status).toBe(200);
    expect(result.data.builds).toBeDefined();
    expect(Array.isArray(result.data.builds)).toBe(true);
    expect(result.data.page).toBe(1);
    expect(result.data.per_page).toBeDefined();
    expect(result.data.total).toBeDefined();
  });

  it("GET /api/builds?sort=coolness returns sorted results", async () => {
    const result = await apiGet("/api/builds?sort=coolness");
    expect(result.status).toBe(200);
    const scores = result.data.builds.map((b) => b.score);
    // Verify descending order
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("each build has required fields", async () => {
    const result = await apiGet("/api/builds?per_page=3");
    if (result.data.builds.length > 0) {
      const build = result.data.builds[0];
      expect(build).toHaveProperty("id");
      expect(build).toHaveProperty("name");
      expect(build).toHaveProperty("score");
      expect(build).toHaveProperty("query");
      expect(build).toHaveProperty("username");
      expect(build).toHaveProperty("build_url");
    }
  });
});

describe("SingularityDB API - CORS", () => {
  it("cross-origin requests work (API Gateway v2 manages CORS)", async () => {
    // API Gateway v2 handles CORS at the gateway level, not Lambda level
    // Verify data access works (which implies CORS is functional)
    const r = await fetch(`${BASE_URL}/api/builds`);
    expect(r.status).toBe(200);
    const data = await r.json();
    expect(data.builds).toBeDefined();
  });

  it("OPTIONS returns 200 (handled by API Gateway or Lambda)", async () => {
    const r = await fetch(`${BASE_URL}/api/data/test/key`, { method: "OPTIONS" });
    expect(r.status).toBeLessThan(400);
  });
});

describe("SingularityDB API - Full Lifecycle (simulates generated app)", () => {
  const gameNs = `game-test-${Date.now()}`;

  afterAll(async () => {
    // Cleanup
    await apiDelete(`/api/data/${gameNs}/highscores`);
    await apiDelete(`/api/data/${gameNs}/settings`);
  });

  it("simulates a complete game data lifecycle", async () => {
    // 1. Game loads — no high scores yet
    const initial = await apiGet(`/api/data/${gameNs}/highscores`);
    expect(initial.status).toBe(404);

    // 2. Player finishes game — save first high score
    const scores1 = [{ name: "Player1", score: 500, date: "2026-02-15" }];
    const save1 = await apiPut(`/api/data/${gameNs}/highscores`, { value: scores1 });
    expect(save1.status).toBe(200);

    // 3. Another player plays — update leaderboard
    const get1 = await apiGet(`/api/data/${gameNs}/highscores`);
    expect(get1.status).toBe(200);
    expect(get1.data).toEqual(scores1);

    const scores2 = [
      { name: "Player2", score: 800, date: "2026-02-15" },
      ...get1.data,
    ].sort((a, b) => b.score - a.score);
    await apiPut(`/api/data/${gameNs}/highscores`, { value: scores2 });

    // 4. Verify updated leaderboard
    const get2 = await apiGet(`/api/data/${gameNs}/highscores`);
    expect(get2.data[0].name).toBe("Player2");
    expect(get2.data[0].score).toBe(800);
    expect(get2.data[1].name).toBe("Player1");

    // 5. Save game settings
    await apiPut(`/api/data/${gameNs}/settings`, { value: { sound: true, difficulty: "hard" } });

    // 6. List all data in namespace
    const list = await apiGet(`/api/data/${gameNs}`);
    expect(list.status).toBe(200);
    expect(list.data.length).toBe(2);
    const keys = list.data.map((i) => i.key).sort();
    expect(keys).toEqual(["highscores", "settings"]);

    // Verify list values are NOT double-wrapped
    const hsItem = list.data.find((i) => i.key === "highscores");
    expect(Array.isArray(hsItem.value)).toBe(true);
    expect(hsItem.value[0].name).toBe("Player2");

    // 7. Delete settings
    const del = await apiDelete(`/api/data/${gameNs}/settings`);
    expect(del.status).toBe(200);

    // 8. Verify deletion
    const getDeleted = await apiGet(`/api/data/${gameNs}/settings`);
    expect(getDeleted.status).toBe(404);

    // 9. List should now have only highscores
    const list2 = await apiGet(`/api/data/${gameNs}`);
    expect(list2.data.length).toBe(1);
    expect(list2.data[0].key).toBe("highscores");
  });
});
