/**
 * Input sanitization and injection detection
 * 
 * Defense layers:
 * 1. vard (community library) — pattern-based prompt injection detection
 * 2. Custom regex patterns — domain-specific blocked content
 * 3. Output scanner — catches dangerous patterns in generated code
 * 4. CSP injection — browser-enforced network restrictions on deployed apps
 */

import vard from "@andersmyrmel/vard";

// ── vard configuration ───────────────────────────────────────────────────────
// Strict mode: blocks instruction overrides, role manipulation, system prompt
// extraction, delimiter injection, encoding attacks, and more.
const buildRequestValidator = vard
  .strict()
  .maxLength(500)
  .block("instructionOverride")
  .block("roleManipulation")
  .block("systemPromptLeak")
  .block("delimiterInjection")
  .block("encodingAttack")
  .sanitize("delimiterInjection");

// ── Domain-specific blocked content ──────────────────────────────────────────
// These are NOT prompt injection — they're content policy (malware, NSFW, etc.)
const BLOCKED_CONTENT_PATTERNS = [
  { pattern: /porn|nsfw|nude|xxx|sex(?:ual|ting)?/i, category: "nsfw" },
  { pattern: /\bweapon|bomb|explosive/i, category: "violence" },
  { pattern: /\bdrug\s*(deal|trad|sell|market)/i, category: "illegal" },
  { pattern: /\bhack(?:er|ing)\b.*(?:tool|kit|suite)/i, category: "hacking" },
  { pattern: /\bddos|exploit\s*kit|vulnerability\s*scanner/i, category: "hacking" },
  { pattern: /fake\s*(login|bank|paypal|amazon|google)/i, category: "phishing" },
  { pattern: /credit\s*card\s*(skimmer|stealer|harvest)/i, category: "fraud" },
  { pattern: /\bphishing\b/i, category: "phishing" },
  { pattern: /\bransomware\b/i, category: "malware" },
  { pattern: /\bkeylogger\b/i, category: "malware" },
  { pattern: /\bcrypto\s*miner\b/i, category: "malware" },
  { pattern: /\bmalware\b/i, category: "malware" },
  { pattern: /steal|exfiltrate|scrape\s+user/i, category: "data_theft" },
];

// ── Additional injection patterns (beyond what vard catches) ─────────────────
// Environment/secret targeting specific to our pipeline
const PIPELINE_INJECTION_PATTERNS = [
  /process\.env/i,
  /require\s*\(\s*['"](?:fs|child_process|os|net|http|https|crypto|path|stream|cluster|dgram|dns|domain|readline|repl|tls|tty|v8|vm|worker_threads|perf_hooks)/i,
  /import\s+.*from\s*['"](?:fs|child_process|os|net)/i,
  /\.env\b/i,
  /credentials/i,
  /api[_\s]*key/i,
  /secret[_\s]*key/i,
  /access[_\s]*key/i,
  /\bpassword\b/i,
];

/**
 * Sanitize and validate a build request from a tweet
 * @returns {{ safe: boolean, reason?: string, category?: string, cleaned?: string }}
 */
export function sanitizeBuildRequest(text) {
  if (!text || typeof text !== "string") {
    return { safe: false, reason: "empty input", category: "invalid" };
  }

  // Length check
  if (text.length > 500) {
    return { safe: false, reason: `input too long (${text.length} > 500)`, category: "invalid" };
  }

  // Layer 1: vard (community prompt injection detection)
  try {
    buildRequestValidator(text);
  } catch (err) {
    return { 
      safe: false, 
      reason: `prompt injection detected: ${err.message}`,
      category: "injection",
    };
  }

  // Layer 2: Domain-specific blocked content
  for (const { pattern, category } of BLOCKED_CONTENT_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: `blocked content: ${category}`, category };
    }
  }

  // Layer 3: Pipeline-specific injection patterns (env vars, secrets)
  for (const pattern of PIPELINE_INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: `pipeline injection pattern: ${pattern.source}`, category: "injection" };
    }
  }

  // Strip any remaining HTML/script tags
  const cleaned = text
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s.,!?'"():;\-+=#@/&%$*~`\[\]{}|\\]/g, "")
    .trim();

  if (cleaned.length < 5) {
    return { safe: false, reason: "cleaned input too short", category: "invalid" };
  }

  return { safe: true, cleaned };
}

/**
 * Generate a reply message for rejected/malicious requests
 * @returns {string} Tweet-sized rejection message
 */
export function getRejectionReply(username, category) {
  const replies = {
    injection: [
      `@${username} Nice try! 🦀 That looked like a prompt injection. Build something fun instead!`,
      `@${username} 🛡️ Injection attempt detected. SingularityEngine only builds apps, not exploits!`,
      `@${username} Nope! 🦀 Our security caught that one. Try a real build request!`,
    ],
    nsfw: [
      `@${username} 🦀 SingularityEngine keeps it clean! Try something creative instead.`,
    ],
    phishing: [
      `@${username} 🚫 We don't build phishing pages. How about a legitimate app instead?`,
    ],
    malware: [
      `@${username} 🛡️ Malware requests aren't our thing. Build something positive! 🦀`,
    ],
    hacking: [
      `@${username} 🦀 We build apps, not attack tools. Try something constructive!`,
    ],
    fraud: [
      `@${username} 🚫 That's not what we're here for. Build something legit! 🦀`,
    ],
    data_theft: [
      `@${username} 🛡️ Data theft? Hard pass. Try building something people will love! 🦀`,
    ],
    violence: [
      `@${username} 🦀 Let's keep it peaceful. How about a game or a tool instead?`,
    ],
    illegal: [
      `@${username} 🚫 Can't help with that. Try a fun app instead! 🦀`,
    ],
    invalid: null, // no reply for invalid/empty inputs
  };

  if (!(category in replies)) return replies.injection[Math.floor(Math.random() * replies.injection.length)];
  const options = replies[category];
  if (!options) return null;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * LLM-based TOS check using Claude Haiku
 * Catches nuanced violations that regex misses
 * @returns {{ safe: boolean, reason?: string, category?: string }}
 */
export async function checkTOS(text) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    console.warn("⚠️ No ANTHROPIC_API_KEY for TOS check, skipping LLM layer");
    return { safe: true };
  }

  const TOS_PROMPT = `You are a content safety classifier for SingularityEngine, a service that auto-builds web apps from user descriptions.

TERMS OF SERVICE - Users may NOT request apps that:
1. Facilitate illegal activity (drug dealing, weapons trafficking, fraud, hacking tools)
2. Contain NSFW/pornographic content
3. Are designed to harm, harass, stalk, or doxx individuals
4. Attempt to phish, scam, or steal credentials/data
5. Generate malware, ransomware, keyloggers, or crypto miners
6. Scrape, exfiltrate, or harvest user data without consent
7. Impersonate real people, brands, or government entities
8. Facilitate gambling with real money (without proper licensing)
9. Build surveillance or tracking tools targeting individuals
10. Generate content that promotes violence, terrorism, or self-harm

ALLOWED:
- Games (including gambling-themed games with no real money)
- Productivity tools, dashboards, calculators
- Creative tools, art generators, music players
- Social apps, chat interfaces, forums
- Developer tools, code formatters, API testers
- Educational content, quizzes, learning apps
- Fun/silly/meme apps

Classify this build request. Respond with EXACTLY one line:
SAFE - if the request is allowed
VIOLATION:<category> - <brief reason> if it violates TOS

Build request: "${text}"`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: 50,
        messages: [{ role: "user", content: TOS_PROMPT }],
      }),
    });

    if (!res.ok) {
      console.warn(`⚠️ TOS check API error ${res.status}, allowing request`);
      return { safe: true };
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text?.trim() || "";

    if (reply.startsWith("SAFE")) {
      return { safe: true };
    }

    if (reply.startsWith("VIOLATION:")) {
      const parts = reply.replace("VIOLATION:", "").trim();
      const dashIdx = parts.indexOf(" - ");
      const category = dashIdx > 0 ? parts.slice(0, dashIdx).trim().toLowerCase() : "tos";
      const reason = dashIdx > 0 ? parts.slice(dashIdx + 3).trim() : parts;
      return { safe: false, reason: `TOS violation: ${reason}`, category: `tos_${category}` };
    }

    // Ambiguous response — allow but log
    console.warn(`⚠️ Ambiguous TOS response: "${reply}", allowing`);
    return { safe: true };
  } catch (err) {
    console.warn(`⚠️ TOS check error: ${err.message}, allowing request`);
    return { safe: true };
  }
}

/**
 * Scan generated HTML for dangerous patterns
 * @returns {{ safe: boolean, violations: string[] }}
 */
export function scanGeneratedCode(html) {
  const violations = [];

  const dangerousPatterns = [
    // Code execution
    { pattern: /process\.env/g, name: "process.env access" },
    { pattern: /require\s*\(/g, name: "require() call" },
    { pattern: /import\s+.*from\s*['"]/g, name: "ES module import" },
    { pattern: /eval\s*\(/g, name: "eval()" },
    { pattern: /new\s+Function\s*\(/g, name: "Function constructor" },
    { pattern: /setTimeout\s*\(\s*['"`]/g, name: "setTimeout with string (eval equivalent)" },
    { pattern: /setInterval\s*\(\s*['"`]/g, name: "setInterval with string (eval equivalent)" },
    
    // Network exfiltration
    { pattern: /fetch\s*\(/g, name: "fetch() call — needs allowlist check" },
    { pattern: /XMLHttpRequest/g, name: "XMLHttpRequest" },
    { pattern: /new\s+WebSocket/g, name: "WebSocket (exfiltration channel)" },
    { pattern: /new\s+EventSource/g, name: "EventSource (exfiltration channel)" },
    { pattern: /navigator\.sendBeacon/g, name: "sendBeacon (exfiltration channel)" },
    { pattern: /importScripts/g, name: "importScripts (worker import)" },
    { pattern: /navigator\.serviceWorker/g, name: "Service Worker registration" },
    { pattern: /SharedWorker|new\s+Worker/g, name: "Web Worker (sandbox escape)" },

    // DOM-based attacks
    { pattern: /document\.cookie/g, name: "cookie access" },
    { pattern: /window\.opener/g, name: "window.opener access" },
    { pattern: /postMessage/g, name: "postMessage" },
    { pattern: /\.innerHTML\s*=/g, name: "innerHTML assignment (XSS risk)" },
    { pattern: /document\.write/g, name: "document.write" },

    // Navigation/redirect
    { pattern: /window\.location\s*[=]/g, name: "location redirect" },
    { pattern: /document\.location\s*[=]/g, name: "document.location redirect" },
    { pattern: /top\.location/g, name: "top.location access" },
    { pattern: /parent\.location/g, name: "parent.location access" },

    // HTML-based exfiltration
    { pattern: /<a\s[^>]*ping\s*=/gi, name: "HTML ping attribute (exfiltration)" },
    { pattern: /<form\s[^>]*action\s*=\s*['"]https?:\/\//gi, name: "form action to external URL" },
    { pattern: /<link\s[^>]*rel\s*=\s*['"]prefetch/gi, name: "link prefetch (exfiltration)" },
    { pattern: /<link\s[^>]*rel\s*=\s*['"]preconnect/gi, name: "link preconnect (exfiltration)" },
    { pattern: /<meta\s[^>]*http-equiv\s*=\s*['"]refresh/gi, name: "meta refresh redirect" },

    // CSS-based exfiltration
    { pattern: /url\s*\(\s*['"]?https?:\/\/(?!.*execute-api)/gi, name: "CSS url() to external domain" },
    { pattern: /@import\s+['"]?https?:\/\//gi, name: "CSS @import external URL" },

    // Image-based exfiltration
    { pattern: /new\s+Image\s*\(\s*\)[\s\S]*?\.src\s*=/g, name: "Image src exfiltration" },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(html)) {
      violations.push(name);
    }
  }

  // Allow fetch ONLY to singularity-db API
  const fetchMatches = html.matchAll(/fetch\s*\(\s*[`'"](.*?)[`'"]/g);
  for (const match of fetchMatches) {
    const url = match[1];
    if (!url.includes("execute-api") && !url.includes("singularity-db") && !url.startsWith("$") && !url.startsWith("${")) {
      violations.push(`unauthorized fetch target: ${url}`);
    }
  }

  // Check for dynamic fetch URLs (template literals with variables, concatenation)
  // Strip the SingularityDB class first since it uses fetch() with dynamic URLs legitimately
  const nonDbCode = html.replace(/class\s+SingularityDB\s*\{[\s\S]*?\n\s*\}/g, '');
  const dynamicFetchPatterns = [
    /fetch\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[,)]/,
    /fetch\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\+/,
  ];
  for (const pattern of dynamicFetchPatterns) {
    if (pattern.test(nonDbCode)) {
      violations.push("dynamic fetch URL (potential exfiltration)");
    }
  }

  // Detect dynamic src assignment with data concatenation
  if (/\.src\s*=.*(\+|encodeURI|\$\{)/g.test(html)) {
    violations.push("dynamic src assignment (potential exfiltration)");
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}
