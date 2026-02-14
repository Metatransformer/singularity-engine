/**
 * Sandboxed Claude Code Runner
 * Runs inside Docker container. Generates a single HTML file from a build request.
 * 
 * Input: BUILD_REQUEST env var (sanitized tweet text)
 * Output: writes HTML to /output/index.html
 * 
 * Can also run as Lambda handler (for simpler deployment).
 */

import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { CODE_RUNNER_SYSTEM_PROMPT, buildUserPrompt } from "./shared/prompts.mjs";
import { scanGeneratedCode } from "./shared/security.mjs";

const client = new Anthropic();

async function generateApp(request, appId) {
  console.log(`🔨 Building: "${request}" (namespace: ${appId})`);

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    system: CODE_RUNNER_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildUserPrompt(request, appId) },
    ],
  });

  const html = message.content[0]?.text;

  if (!html || !html.includes("<!DOCTYPE html>") && !html.includes("<html")) {
    throw new Error("Claude did not generate valid HTML");
  }

  // Extract just the HTML (in case Claude added explanation)
  const htmlMatch = html.match(/(<!DOCTYPE html>[\s\S]*<\/html>)/i) || 
                    html.match(/(<html[\s\S]*<\/html>)/i);
  
  let cleanHtml = htmlMatch ? htmlMatch[1] : html;

  // Inject Content-Security-Policy meta tag to restrict runtime behavior
  // Only allow fetch to our API Gateway, block all other external connections
  const dbUrl = process.env.METATRANSFORMR_DB_URL || "";
  const dbOrigin = dbUrl ? new URL(dbUrl).origin : "https://*.execute-api.*.amazonaws.com";
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; connect-src ${dbOrigin}; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';">`;
  
  // Insert CSP after <head> tag
  if (cleanHtml.includes("<head>")) {
    cleanHtml = cleanHtml.replace("<head>", `<head>\n${cspTag}`);
  } else if (cleanHtml.includes("<html>")) {
    cleanHtml = cleanHtml.replace("<html>", `<html><head>${cspTag}</head>`);
  }

  // Security scan
  const scan = scanGeneratedCode(cleanHtml);
  if (!scan.safe) {
    console.warn(`⚠️ Security violations detected:`, scan.violations);
    // Allow expected patterns from MetatransformrDB usage, block everything else
    const allowedViolations = [
      "fetch() call — needs allowlist check",  // MetatransformrDB uses fetch
      "innerHTML assignment (XSS risk)",         // Common in UI code (low risk for static HTML)
    ];
    const critical = scan.violations.filter(v => !allowedViolations.includes(v));
    if (critical.length > 0) {
      throw new Error(`Critical security violations: ${critical.join(", ")}`);
    }
  }

  return cleanHtml;
}

// Lambda handler
export async function handler(event) {
  try {
    const { request, appId, tweetId, userId } = typeof event.body === "string" 
      ? JSON.parse(event.body) 
      : event;

    const html = await generateApp(request, appId);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        html, 
        appId, 
        tweetId, 
        userId,
        bytesGenerated: html.length,
      }),
    };
  } catch (err) {
    console.error("Build failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
}

// Docker entrypoint
if (process.env.BUILD_REQUEST) {
  const request = process.env.BUILD_REQUEST;
  const appId = process.env.APP_ID || "app-" + Date.now();

  try {
    const html = await generateApp(request, appId);
    mkdirSync("/output", { recursive: true });
    writeFileSync("/output/index.html", html);
    console.log(`✅ Generated ${html.length} bytes → /output/index.html`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Failed:`, err.message);
    process.exit(1);
  }
}
