/**
 * Unit tests for shared/prompts.mjs
 * Tests prompt generation and SingularityDB script injection
 */
import { describe, it, expect } from "vitest";
import { buildSingularityDBScript, buildUserPrompt, CODE_RUNNER_SYSTEM_PROMPT } from "../shared/prompts.mjs";

describe("buildSingularityDBScript", () => {
  it("generates a script tag with the correct API URL", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "test-ns");
    expect(script).toContain("<script>");
    expect(script).toContain("</script>");
    expect(script).toContain("https://api.example.com/data");
  });

  it("sets the correct namespace", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "my-app-123");
    expect(script).toContain('"my-app-123"');
  });

  it("includes the SingularityDB class with get/set/delete/list", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "ns");
    expect(script).toContain("class SingularityDB");
    expect(script).toContain("async get(key)");
    expect(script).toContain("async set(key, value)");
    expect(script).toContain("async delete(key)");
    expect(script).toContain("async list()");
  });

  it("creates a global db instance", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "ns");
    expect(script).toContain("const db = new SingularityDB(");
  });

  it("uses PUT method for set operations", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "ns");
    expect(script).toContain('method: "PUT"');
  });

  it("wraps value in {value: value} for set operations", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "ns");
    expect(script).toContain("JSON.stringify({value: value})");
  });

  it("URL-encodes keys in fetch calls", () => {
    const script = buildSingularityDBScript("https://api.example.com/data", "ns");
    expect(script).toContain("encodeURIComponent(key)");
  });
});

describe("buildUserPrompt", () => {
  it("includes the user request", () => {
    const prompt = buildUserPrompt("a tetris game", "app-123");
    expect(prompt).toContain("a tetris game");
  });

  it("includes the app namespace", () => {
    const prompt = buildUserPrompt("a timer", "my-timer-456");
    expect(prompt).toContain("my-timer-456");
  });

  it("reminds about auto-injected SingularityDB", () => {
    const prompt = buildUserPrompt("anything", "ns");
    expect(prompt).toContain("auto-injected");
    expect(prompt).toContain("db");
  });
});

describe("CODE_RUNNER_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof CODE_RUNNER_SYSTEM_PROMPT).toBe("string");
    expect(CODE_RUNNER_SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it("forbids external scripts and CDNs", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("NO external scripts");
  });

  it("forbids eval and dynamic code execution", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("NO eval()");
  });

  it("forbids localStorage and cookies", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("NO access to document.cookie");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("localStorage");
  });

  it("instructs to use db global variable", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain('global "db"');
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("db.get");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("db.set");
  });

  it("includes the watermark requirement", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("singularityengine.ai");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("Built by Singularity Engine");
  });

  it("instructs raw HTML output only", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("<!DOCTYPE html>");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("No explanation");
  });

  it("includes injection defense instructions", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("prompt injection");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("Nice try");
  });

  it("documents db.get() return behavior", () => {
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("returns the stored value directly");
    expect(CODE_RUNNER_SYSTEM_PROMPT).toContain("returns null");
  });
});
