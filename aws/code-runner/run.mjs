/**
 * Singularity Engine — Code Runner
 * Generates a single HTML file from a build request.
 * 
 * Input: BUILD_REQUEST env var (sanitized tweet text)
 * Output: writes HTML to /output/index.html
 * 
 * Supports multiple models via MODEL env var (claude|grok|gpt).
 * Supports build iteration via EXISTING_CODE env var or existingCode param.
 * Build engine is configurable via BUILD_ENGINE env var.
 */

import { writeFileSync, mkdirSync } from "fs";
import { CODE_RUNNER_SYSTEM_PROMPT, buildUserPrompt, buildSingularityDBScript, SINGULARITY_DB_URL } from "./shared/prompts.mjs";
import { scanGeneratedCode } from "./shared/security.mjs";
import { generateWithModel } from "./shared/model-adapters.mjs";

const BUILD_ENGINE = process.env.BUILD_ENGINE || "default";
const DEFAULT_MODEL = process.env.MODEL || "claude";

// Iteration system prompt — used when modifying existing code
const ITERATION_SYSTEM_PROMPT = `You are a code iteration engine. You receive existing HTML application code and a modification request.

Your job:
1. Read the existing code carefully
2. Apply the requested changes
3. Return the COMPLETE updated HTML file (not a diff)
4. Preserve all existing functionality unless explicitly asked to remove it
5. Keep the same structure, style, and patterns as the original
6. Do NOT add explanations — return ONLY the complete HTML document

Rules:
- Output a single, complete HTML file
- Maintain all existing features unless the user asks to change them
- Keep the SingularityDB integration intact if present
- Preserve CSP meta tags and injected scripts`;

function buildIterationPrompt(existingCode, request, appId) {
  return `Here is the existing app code:

\`\`\`html
${existingCode}
\`\`\`

The user wants these changes: ${request}

Modify the code accordingly. Return the complete updated HTML file. Do not include any explanation — just the HTML.`;
}

async function generateApp(request, appId, options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const existingCode = options.existingCode || process.env.EXISTING_CODE;
  const isIteration = !!existingCode;

  if (isIteration) {
    console.log(`🔄 Iteration mode: modifying existing app (${existingCode.length} bytes) with model=${model}`);
  } else {
    console.log(`🔨 Building: "${request}" (namespace: ${appId}, model: ${model})`);
  }

  const systemPrompt = isIteration ? ITERATION_SYSTEM_PROMPT : CODE_RUNNER_SYSTEM_PROMPT;
  const userPrompt = isIteration 
    ? buildIterationPrompt(existingCode, request, appId)
    : buildUserPrompt(request, appId);

  const html = await generateWithModel(model, systemPrompt, userPrompt, 16000);

  if (!html || (!html.includes("<!DOCTYPE html>") && !html.includes("<html"))) {
    throw new Error(`${model} did not generate valid HTML`);
  }

  // Extract just the HTML (in case model added explanation)
  const htmlMatch = html.match(/(<!DOCTYPE html>[\s\S]*<\/html>)/i) || 
                    html.match(/(<html[\s\S]*<\/html>)/i);
  
  let cleanHtml = htmlMatch ? htmlMatch[1] : html;

  // Inject Content-Security-Policy meta tag to restrict runtime behavior
  const dbUrl = process.env.SINGULARITY_DB_URL || SINGULARITY_DB_URL;
  const dbOrigin = dbUrl ? new URL(dbUrl).origin : "https://*.execute-api.*.amazonaws.com";
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; connect-src ${dbOrigin}; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';">`;

  // Build the SingularityDB client script
  const dbScript = buildSingularityDBScript(dbUrl, appId);

  // Strip any SingularityDB class the model may have generated
  cleanHtml = cleanHtml.replace(/class\s+SingularityDB\s*\{[\s\S]*?\n\s*\}/g, '/* SingularityDB class removed — using injected version */');

  // Insert CSP + SingularityDB script after <head> tag
  if (cleanHtml.includes("<head>")) {
    cleanHtml = cleanHtml.replace("<head>", `<head>\n${cspTag}\n${dbScript}`);
  } else if (cleanHtml.includes("<html>")) {
    cleanHtml = cleanHtml.replace("<html>", `<html><head>${cspTag}\n${dbScript}</head>`);
  }

  // Security scan
  const scan = scanGeneratedCode(cleanHtml);
  if (!scan.safe) {
    console.warn(`⚠️ Security violations detected:`, scan.violations);
    const allowedViolations = [
      "fetch() call — needs allowlist check",
      "innerHTML assignment (XSS risk)",
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
    const { request, appId, tweetId, userId, model, existingCode } = typeof event.body === "string" 
      ? JSON.parse(event.body) 
      : event;

    const html = await generateApp(request, appId, { model, existingCode });

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        ok: true, 
        html, 
        appId, 
        tweetId, 
        userId,
        model: model || DEFAULT_MODEL,
        isIteration: !!existingCode,
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
