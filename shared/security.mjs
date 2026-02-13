/**
 * Input sanitization and injection detection
 */

// Patterns that indicate prompt injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)\s+(instructions|prompts|rules)/i,
  /system\s*prompt/i,
  /you\s+are\s+(now|a)\s/i,
  /pretend\s+(you|to\s+be)/i,
  /act\s+as\s+(if|a|an)/i,
  /\bsudo\b/i,
  /\brm\s+-rf\b/i,
  /process\.env/i,
  /require\s*\(\s*['"](?:fs|child_process|os|net|http|https|crypto|path|stream|cluster|dgram|dns|domain|readline|repl|tls|tty|v8|vm|worker_threads|perf_hooks)/i,
  /import\s+.*from\s*['"](?:fs|child_process|os|net)/i,
  /\.env\b/i,
  /credentials/i,
  /api[_\s]*key/i,
  /secret[_\s]*key/i,
  /access[_\s]*key/i,
  /password/i,
  /exec\s*\(/i,
  /spawn\s*\(/i,
  /eval\s*\(/i,
  /Function\s*\(/i,
  /fetch\s*\(\s*['"](?!https:\/\/[a-z0-9]+\.execute-api)/i, // only allow our API
  /XMLHttpRequest/i,
  /document\.cookie/i,
  /localStorage/i,
  /sessionStorage/i,
  /window\.open/i,
  /iframe/i,
  /script\s+src/i,
  /\\x[0-9a-f]{2}/i, // hex escape sequences
  /\\u[0-9a-f]{4}/i, // unicode escapes (suspicious in build requests)
  /base64/i,
  /atob|btoa/i,
  /data:text\/html/i,
];

// Max input length for a build request
const MAX_INPUT_LENGTH = 500;

/**
 * Sanitize and validate a build request from a tweet
 * @returns {{ safe: boolean, reason?: string, cleaned?: string }}
 */
export function sanitizeBuildRequest(text) {
  if (!text || typeof text !== "string") {
    return { safe: false, reason: "empty input" };
  }

  // Length check
  if (text.length > MAX_INPUT_LENGTH) {
    return { safe: false, reason: `input too long (${text.length} > ${MAX_INPUT_LENGTH})` };
  }

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: `injection pattern detected: ${pattern.source}` };
    }
  }

  // Strip any remaining HTML/script tags
  const cleaned = text
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s.,!?'"():;\-+=#@/&%$*~`\[\]{}|\\]/g, "")
    .trim();

  if (cleaned.length < 5) {
    return { safe: false, reason: "cleaned input too short" };
  }

  return { safe: true, cleaned };
}

/**
 * Scan generated HTML for dangerous patterns
 * @returns {{ safe: boolean, violations: string[] }}
 */
export function scanGeneratedCode(html) {
  const violations = [];

  const dangerousPatterns = [
    { pattern: /process\.env/g, name: "process.env access" },
    { pattern: /require\s*\(/g, name: "require() call" },
    { pattern: /import\s+.*from\s*['"]/g, name: "ES module import" },
    { pattern: /fetch\s*\(/g, name: "fetch() call — needs allowlist check" },
    { pattern: /XMLHttpRequest/g, name: "XMLHttpRequest" },
    { pattern: /document\.cookie/g, name: "cookie access" },
    { pattern: /window\.opener/g, name: "window.opener access" },
    { pattern: /postMessage/g, name: "postMessage" },
    { pattern: /eval\s*\(/g, name: "eval()" },
    { pattern: /new\s+Function\s*\(/g, name: "Function constructor" },
    { pattern: /\.innerHTML\s*=/g, name: "innerHTML assignment (XSS risk)" },
    { pattern: /document\.write/g, name: "document.write" },
    { pattern: /new\s+WebSocket/g, name: "WebSocket (exfiltration channel)" },
    { pattern: /new\s+EventSource/g, name: "EventSource (exfiltration channel)" },
    { pattern: /navigator\.sendBeacon/g, name: "sendBeacon (exfiltration channel)" },
    { pattern: /new\s+Image\s*\(\s*\)[\s\S]*?\.src\s*=/g, name: "Image src exfiltration" },
    { pattern: /importScripts/g, name: "importScripts (worker import)" },
    { pattern: /navigator\.serviceWorker/g, name: "Service Worker registration" },
    { pattern: /SharedWorker|new\s+Worker/g, name: "Web Worker (sandbox escape)" },
    { pattern: /window\.location\s*[=]/g, name: "location redirect" },
    { pattern: /document\.location\s*[=]/g, name: "document.location redirect" },
    { pattern: /top\.location/g, name: "top.location access" },
    { pattern: /parent\.location/g, name: "parent.location access" },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(html)) {
      violations.push(name);
    }
  }

  // Allow fetch ONLY to singularity-db API
  // Check string literal URLs
  const fetchMatches = html.matchAll(/fetch\s*\(\s*[`'"](.*?)[`'"]/g);
  for (const match of fetchMatches) {
    const url = match[1];
    if (!url.includes("execute-api") && !url.includes("singularity-db") && !url.startsWith("$") && !url.startsWith("${")) {
      violations.push(`unauthorized fetch target: ${url}`);
    }
  }

  // Check for dynamic fetch URLs (template literals with variables, concatenation)
  // These are suspicious because they could construct arbitrary URLs at runtime
  const dynamicFetchPatterns = [
    /fetch\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*[,)]/g,  // fetch(variable)
    /fetch\s*\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\+/g,      // fetch(var + ...)
  ];
  for (const pattern of dynamicFetchPatterns) {
    if (pattern.test(html)) {
      // Check if it's the SingularityDB client's fetch (allowlisted)
      // The DB client uses: fetch(`${this.apiUrl}/...`)
      // We only flag non-DB-client dynamic fetches
      const nonDbFetches = html.replace(/class\s+SingularityDB[\s\S]*?^}/m, '');
      if (pattern.test(nonDbFetches)) {
        violations.push("dynamic fetch URL (potential exfiltration)");
      }
    }
  }

  // Detect image-based exfiltration patterns
  if (/\.src\s*=\s*['"`]https?:\/\/(?!.*execute-api)/g.test(html)) {
    // Allow normal image sources but flag dynamic ones
    const dynamicSrc = /\.src\s*=\s*[^'"`\s]/g;
    // Only flag if combined with data that looks like it's sending info
    if (/\.src\s*=.*(\+|encodeURI|\$\{)/g.test(html)) {
      violations.push("dynamic src assignment (potential exfiltration)");
    }
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}
