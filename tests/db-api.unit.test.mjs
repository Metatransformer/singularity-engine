/**
 * Unit tests for db-api handler logic
 * Tests the handler function with mocked DynamoDB responses
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AWS SDK before importing the handler
const mockSend = vi.fn();
vi.mock("@aws-sdk/client-dynamodb", () => {
  return {
    DynamoDBClient: class MockDynamoDBClient {
      constructor() {}
    },
  };
});
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: mockSend })),
  },
  GetCommand: class MockGetCommand { constructor(params) { this.type = "Get"; this.params = params; } },
  PutCommand: class MockPutCommand { constructor(params) { this.type = "Put"; this.params = params; } },
  DeleteCommand: class MockDeleteCommand { constructor(params) { this.type = "Delete"; this.params = params; } },
  QueryCommand: class MockQueryCommand { constructor(params) { this.type = "Query"; this.params = params; } },
}));

const { handler } = await import("../aws/db-api/index.mjs");

function makeEvent(method, path, { body, queryStringParameters, isBase64Encoded } = {}) {
  return {
    requestContext: { http: { method } },
    rawPath: path,
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    queryStringParameters: queryStringParameters || null,
    isBase64Encoded: isBase64Encoded || false,
  };
}

function parseResponse(result) {
  return { ...result, parsedBody: JSON.parse(result.body) };
}

beforeEach(() => {
  mockSend.mockReset();
});

describe("CORS", () => {
  it("responds to OPTIONS with CORS headers", async () => {
    const result = await handler(makeEvent("OPTIONS", "/api/data/test/key"));
    expect(result.statusCode).toBe(200);
    expect(result.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(result.headers["Access-Control-Allow-Methods"]).toContain("DELETE");
  });
});

describe("GET /api/data/:ns/:key", () => {
  it("returns unwrapped value for new format (direct storage)", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { ns: "myapp", key: "score", value: 42, updatedAt: "2026-01-01T00:00:00Z" },
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/myapp/score")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toBe(42);
  });

  it("returns unwrapped value for old double-wrapped format", async () => {
    // Old format: value was stored as {value: actualData}
    mockSend.mockResolvedValueOnce({
      Item: { ns: "myapp", key: "scores", value: { value: [{ name: "Player1", score: 100 }] }, updatedAt: "2026-01-01T00:00:00Z" },
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/myapp/scores")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual([{ name: "Player1", score: 100 }]);
  });

  it("returns 404 for missing key", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/myapp/nonexistent")));
    expect(result.statusCode).toBe(404);
  });

  it("handles complex objects without unwrapping them (objects with multiple keys)", async () => {
    // An object with multiple keys should NOT be unwrapped even if one key is "value"
    mockSend.mockResolvedValueOnce({
      Item: { ns: "myapp", key: "config", value: { value: "test", other: "data" }, updatedAt: "2026-01-01T00:00:00Z" },
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/myapp/config")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual({ value: "test", other: "data" });
  });
});

describe("PUT /api/data/:ns/:key", () => {
  it("stores unwrapped value from {value: v} body", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/myapp/score", {
      body: { value: 42 },
    })));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual({ ok: true });

    // Verify DynamoDB was called with unwrapped value
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.params.Item.value).toBe(42);
  });

  it("stores array values correctly", async () => {
    mockSend.mockResolvedValueOnce({});
    await handler(makeEvent("PUT", "/api/data/myapp/leaderboard", {
      body: { value: [{ name: "A", score: 100 }, { name: "B", score: 50 }] },
    }));
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.params.Item.value).toEqual([{ name: "A", score: 100 }, { name: "B", score: 50 }]);
  });

  it("blocks writes to protected namespaces", async () => {
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/_system/test", {
      body: { value: "hack" },
    })));
    expect(result.statusCode).toBe(403);
  });

  it("blocks writes to namespaces starting with _", async () => {
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/_custom/test", {
      body: { value: "hack" },
    })));
    expect(result.statusCode).toBe(403);
  });

  it("handles base64 encoded bodies", async () => {
    mockSend.mockResolvedValueOnce({});
    const body = Buffer.from(JSON.stringify({ value: "base64-test" })).toString("base64");
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/myapp/key", {
      body,
      isBase64Encoded: true,
    })));
    expect(result.statusCode).toBe(200);
    const putCall = mockSend.mock.calls[0][0];
    expect(putCall.params.Item.value).toBe("base64-test");
  });

  it("rejects values over 100KB", async () => {
    const bigValue = "x".repeat(110000);
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/myapp/big", {
      body: { value: bigValue },
    })));
    expect(result.statusCode).toBe(413);
  });
});

describe("DELETE /api/data/:ns/:key", () => {
  it("deletes a key and returns ok", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = parseResponse(await handler(makeEvent("DELETE", "/api/data/myapp/old-score")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual({ ok: true });

    const deleteCall = mockSend.mock.calls[0][0];
    expect(deleteCall.params.Key).toEqual({ ns: "myapp", key: "old-score" });
  });

  it("blocks deletes from protected namespaces", async () => {
    const result = parseResponse(await handler(makeEvent("DELETE", "/api/data/_builds/test")));
    expect(result.statusCode).toBe(403);
  });
});

describe("GET /api/data/:ns (list)", () => {
  it("returns items with unwrapped values", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        { ns: "myapp", key: "score1", value: { value: 100 }, updatedAt: "2026-01-01T00:00:00Z" },
        { ns: "myapp", key: "score2", value: 200, updatedAt: "2026-01-02T00:00:00Z" },
      ],
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/myapp")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual([
      { key: "score1", value: 100, updatedAt: "2026-01-01T00:00:00Z" },
      { key: "score2", value: 200, updatedAt: "2026-01-02T00:00:00Z" },
    ]);
  });

  it("returns empty array for empty namespace", async () => {
    mockSend.mockResolvedValueOnce({ Items: [] });
    const result = parseResponse(await handler(makeEvent("GET", "/api/data/empty-ns")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody).toEqual([]);
  });
});

describe("GET /api/builds", () => {
  it("returns paginated builds from _showcase namespace with channel field", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          ns: "_showcase",
          key: "test-app",
          value: { name: "Test App", score: 85, query: "test app", username: "user1", channel: "x", build_url: "https://example.com" },
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/builds")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody.builds).toHaveLength(1);
    expect(result.parsedBody.builds[0].name).toBe("Test App");
    expect(result.parsedBody.builds[0].score).toBe(85);
    expect(result.parsedBody.builds[0].channel).toBe("x");
    expect(result.parsedBody.page).toBe(1);
    expect(result.parsedBody.per_page).toBe(10);
    expect(result.parsedBody.total).toBe(1);
  });

  it("defaults channel to 'x' for legacy builds without channel field", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          ns: "_showcase",
          key: "legacy-app",
          value: { name: "Legacy App", score: 60, query: "legacy", username: "user3", build_url: "https://example.com" },
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/builds")));
    expect(result.parsedBody.builds[0].channel).toBe("x");
  });

  it("unwraps old double-wrapped showcase values", async () => {
    mockSend.mockResolvedValueOnce({
      Items: [
        {
          ns: "_showcase",
          key: "old-app",
          value: { value: { name: "Old App", score: 70, query: "old", username: "user2" } },
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/builds")));
    expect(result.parsedBody.builds[0].name).toBe("Old App");
    expect(result.parsedBody.builds[0].score).toBe(70);
  });
});

describe("GET /api/builds/:id/source", () => {
  it("returns source HTML for a build", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { ns: "_source", key: "test-app", value: { html: "<html>test</html>", htmlSize: 17 }, updatedAt: "2026-01-01T00:00:00Z" },
    });
    const result = parseResponse(await handler(makeEvent("GET", "/api/builds/test-app/source")));
    expect(result.statusCode).toBe(200);
    expect(result.parsedBody.id).toBe("test-app");
    expect(result.parsedBody.html).toBe("<html>test</html>");
    expect(result.parsedBody.htmlSize).toBe(17);
  });

  it("returns 404 when source not found", async () => {
    mockSend.mockResolvedValueOnce({ Item: null });
    const result = parseResponse(await handler(makeEvent("GET", "/api/builds/missing/source")));
    expect(result.statusCode).toBe(404);
  });
});

describe("404 handling", () => {
  it("returns 404 with route list for unknown paths", async () => {
    const result = parseResponse(await handler(makeEvent("GET", "/api/unknown")));
    expect(result.statusCode).toBe(404);
    expect(result.parsedBody.routes).toBeDefined();
    expect(result.parsedBody.routes).toContain("GET /api/builds/:id/source");
  });
});

describe("protected namespaces", () => {
  it("blocks writes to _source namespace", async () => {
    const result = parseResponse(await handler(makeEvent("PUT", "/api/data/_source/test", {
      body: { value: "hack" },
    })));
    expect(result.statusCode).toBe(403);
  });
});
