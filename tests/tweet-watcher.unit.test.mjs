/**
 * Unit tests for tweet-watcher trigger detection, rate limiting, and request extraction.
 * Tests the core logic without hitting live AWS/X APIs.
 */
import { describe, it, expect } from "vitest";

// ── Trigger detection regex (mirrored from tweet-watcher/index.mjs) ─────────
const TRIGGER_RE = /singularityengine(?:\.ai)?\s+(.+)/i;

function extractBuildRequest(text) {
  const match = text.match(TRIGGER_RE);
  if (!match) return null;
  return match[1].replace(/^(build\s+me\s+|make\s+me\s+|create\s+|build\s+)/i, "").trim();
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
}

// ── Trigger Detection ──────────────────────────────────────────────────────────
describe("Tweet Watcher — Trigger Detection", () => {
  it("extracts request from 'singularityengine.ai <request>'", () => {
    expect(extractBuildRequest("singularityengine.ai a tetris game")).toBe("a tetris game");
  });

  it("extracts request from 'SingularityEngine.ai <request>' (case-insensitive)", () => {
    expect(extractBuildRequest("SingularityEngine.ai a calculator")).toBe("a calculator");
  });

  it("extracts request from 'singularityengine <request>' (no .ai)", () => {
    expect(extractBuildRequest("singularityengine a snake game")).toBe("a snake game");
  });

  it("strips 'build me' prefix from request", () => {
    expect(extractBuildRequest("singularityengine.ai build me a todo list")).toBe("a todo list");
  });

  it("strips 'make me' prefix from request", () => {
    expect(extractBuildRequest("singularityengine.ai make me a dashboard")).toBe("a dashboard");
  });

  it("strips 'create' prefix from request", () => {
    expect(extractBuildRequest("singularityengine.ai create a weather app")).toBe("a weather app");
  });

  it("strips 'build' prefix from request", () => {
    expect(extractBuildRequest("singularityengine.ai build a pong game")).toBe("a pong game");
  });

  it("returns null when no keyword present", () => {
    expect(extractBuildRequest("hey @someone build me an app")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(extractBuildRequest("")).toBeNull();
  });

  it("handles keyword in middle of tweet with @mention prefix", () => {
    expect(extractBuildRequest("@singengine singularityengine.ai a music player")).toBe("a music player");
  });

  it("preserves complex multi-word requests", () => {
    expect(extractBuildRequest("singularityengine.ai a retro pixel art drawing app with layers")).toBe(
      "a retro pixel art drawing app with layers"
    );
  });

  it("handles 'SingularityEngine' without .ai variant", () => {
    expect(extractBuildRequest("SINGULARITYENGINE build me a chess game")).toBe("a chess game");
  });
});

// ── Slugification ────────────────────────────────────────────────────────────
describe("Tweet Watcher — Slugify", () => {
  it("converts text to lowercase slug", () => {
    expect(slugify("Tetris Game")).toBe("tetris-game");
  });

  it("removes special characters", () => {
    expect(slugify("A cool app! (with stuff)")).toBe("a-cool-app-with-stuff");
  });

  it("truncates to 40 characters", () => {
    const long = "a really really long description that should be truncated at forty chars";
    expect(slugify(long).length).toBeLessThanOrEqual(40);
  });

  it("collapses multiple spaces", () => {
    expect(slugify("a    game   thing")).toBe("a-game-thing");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

// ── Rate Limiting Logic ──────────────────────────────────────────────────────
describe("Tweet Watcher — Rate Limiting Logic", () => {
  const MAX_BUILDS_PER_DAY = 2;

  function isRateLimited(username, buildCount, ownerUsername) {
    if (username.toLowerCase() === ownerUsername.toLowerCase()) return false;
    return buildCount >= MAX_BUILDS_PER_DAY;
  }

  it("allows first build for new user", () => {
    expect(isRateLimited("alice", 0, "owner")).toBe(false);
  });

  it("allows second build", () => {
    expect(isRateLimited("alice", 1, "owner")).toBe(false);
  });

  it("blocks third build", () => {
    expect(isRateLimited("alice", 2, "owner")).toBe(true);
  });

  it("blocks fourth build", () => {
    expect(isRateLimited("alice", 3, "owner")).toBe(true);
  });

  it("exempts owner from rate limit", () => {
    expect(isRateLimited("owner", 5, "owner")).toBe(false);
  });

  it("owner exemption is case-insensitive", () => {
    expect(isRateLimited("OWNER", 10, "owner")).toBe(false);
  });
});

// ── Self-Reply Filtering ────────────────────────────────────────────────────
describe("Tweet Watcher — Self-Reply Filtering", () => {
  function isSelfReply(username, ownerUsername) {
    return username.toLowerCase() === ownerUsername.toLowerCase();
  }

  it("detects self-reply (exact match)", () => {
    expect(isSelfReply("BotAccount", "BotAccount")).toBe(true);
  });

  it("detects self-reply (case-insensitive)", () => {
    expect(isSelfReply("botaccount", "BotAccount")).toBe(true);
  });

  it("allows non-owner reply", () => {
    expect(isSelfReply("alice", "BotAccount")).toBe(false);
  });
});

// ── App ID Generation ───────────────────────────────────────────────────────
describe("Tweet Watcher — App ID Generation", () => {
  function generateAppId(username, request, tweetId) {
    return `${username}-${slugify(request).slice(0, 25)}-${tweetId.slice(-6)}`;
  }

  it("generates valid app ID", () => {
    const id = generateAppId("alice", "a tetris game", "1234567890123456789");
    expect(id).toBe("alice-a-tetris-game-456789");
  });

  it("truncates long request in app ID", () => {
    const id = generateAppId("bob", "a really long description of a very complex app", "1234567890123456789");
    expect(id.length).toBeLessThan(80);
    expect(id).toMatch(/^bob-/);
    expect(id).toMatch(/-456789$/);
  });

  it("handles special characters in request", () => {
    const id = generateAppId("user", "cool game!!!", "1234567890123456789");
    expect(id).toBe("user-cool-game-456789");
  });
});
