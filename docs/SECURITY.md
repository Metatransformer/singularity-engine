# Security Architecture

## Threat Model

Singularity Engine accepts **untrusted input from public tweets** and uses it to generate code via an AI model. This is inherently high-risk. The security model is designed around the principle that **generated code must never have access to secrets or server-side capabilities**.

### Trust Boundaries

```
┌─────────────────────────────────────────────────────┐
│  AWS Lambda (Trusted)                                │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │  Tweet Watcher   │  │  Code Runner              │  │
│  │  Has: X_BEARER   │  │  Has: ANTHROPIC_API_KEY   │  │
│  │  Sanitizes input │  │  Generates HTML only      │  │
│  └────────┬────────┘  │  Scans output             │  │
│           │            └────────────┬───────────────┘  │
│  ┌────────▼──────────────────────────▼───────────────┐ │
│  │  Deployer                                          │ │
│  │  Has: GITHUB_TOKEN                                 │ │
│  │  Pushes static HTML to GitHub Pages                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         ║ (network boundary)
┌────────╨────────────────────────────────────────────────┐
│  GitHub Pages (Untrusted — runs user-facing code)       │
│  Static HTML only. No server. No env vars. No secrets.  │
│  CSP restricts fetch to SingularityDB API only.         │
└─────────────────────────────────────────────────────────┘
```

## Environment Variable Isolation

**Env vars never leave Lambda.** Here's how:

| Secret | Where It Lives | Who Has Access |
|--------|---------------|----------------|
| `ANTHROPIC_API_KEY` | Code Runner Lambda env | Lambda runtime only |
| `X_BEARER_TOKEN` | Tweet Watcher Lambda env | Lambda runtime only |
| `GITHUB_TOKEN` | Deployer Lambda env | Lambda runtime only |
| `X_CONSUMER_KEY/SECRET` | Local poller env or Lambda | Never sent to Claude |
| `X_ACCESS_TOKEN/SECRET` | Local poller env | Never sent to Claude |

**Critical design decision:** The Anthropic API key is used to call Claude from the Lambda function. The *request* sent to Claude contains only the sanitized tweet text and system prompt. No env vars, no tokens, no credentials are included in the prompt.

**Generated apps run on GitHub Pages** — a static hosting environment with zero server-side execution. Even if Claude were tricked into outputting `process.env.ANTHROPIC_API_KEY`, it would be a string literal in dead client-side code referencing a variable that doesn't exist in the browser.

## Input Sanitization Pipeline

Tweets go through multiple layers before reaching Claude:

### Layer 1: Tweet Watcher (pre-filter)
- **Length limit:** 500 characters max
- **Injection patterns:** 30+ regex patterns detect prompt injection attempts
  - "ignore previous instructions", "system prompt", "pretend to be", etc.
  - `process.env`, `require(...)`, `eval(...)`, `exec(...)`
  - Credential-related keywords: `api_key`, `secret_key`, `password`, `credentials`
- **Blocked content:** NSFW, weapons, drugs, hacking tools, phishing
- **HTML stripping:** All HTML tags removed
- **Character filtering:** Only safe characters allowed through
- **Rate limiting:** 2 builds per user per day

### Layer 2: Claude System Prompt
- Explicit rules forbidding dangerous code patterns
- Instructions to output "Nice try 🦀" for injection attempts
- Restricted to single-file HTML with inline CSS/JS only
- No external imports, no Node.js APIs, no eval

### Layer 3: Output Scanner (`shared/security.mjs`)
Scans Claude's generated HTML for dangerous patterns:
- `process.env` access
- `require()` / ES module imports
- `eval()` / `Function()` constructor
- `document.cookie` / `localStorage` / `sessionStorage`
- `window.opener` / `postMessage`
- `document.write` / `innerHTML`
- `WebSocket` / `EventSource` / `navigator.sendBeacon`
- `Image.src` exfiltration
- `Worker` / `SharedWorker` / `ServiceWorker`
- Location redirects (`window.location =`)
- Unauthorized `fetch()` targets (only SingularityDB API allowed)
- Dynamic fetch URLs that could construct arbitrary endpoints

### Layer 4: Content Security Policy
A CSP meta tag is injected into every generated HTML file:
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self' 'unsafe-inline';
  connect-src https://*.execute-api.*.amazonaws.com;
  img-src 'self' data:;
  font-src 'self';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
">
```
This means even if a pattern slips past the scanner, the **browser itself blocks** unauthorized network requests.

## API Security

### SingularityDB Public API
The db-api Lambda provides a key-value store for generated apps. Security measures:
- **Protected namespaces:** `_system`, `_builds`, `_reply_queue`, `_showcase` cannot be written to via the public API
- **Reserved prefix:** All namespaces starting with `_` are blocked from public writes
- **Value size limit:** 100KB max per value to prevent abuse
- **CORS enabled:** Allows cross-origin access (required for GitHub Pages apps)

### DynamoDB
- No SQL injection possible (DynamoDB is NoSQL with structured queries)
- Partition key (`ns`) + sort key (`key`) schema prevents cross-namespace access
- IAM role restricts Lambda to only the singularity-db table

## Rate Limiting

| Limit | Value | Scope |
|-------|-------|-------|
| Builds per user per day | 2 | Per X username |
| Reply cooldown | 60 seconds | Global |
| Tweet poll interval | 2 minutes | Global |
| Max input length | 500 chars | Per request |

## Known Limitations

1. **Claude is not deterministic.** Despite explicit instructions, Claude *could* generate code that violates rules. The output scanner and CSP are the safety nets.
2. **`innerHTML` is allowed.** Many UI patterns require it. XSS risk is mitigated by the fact that apps are isolated on their own GitHub Pages path with no cookies or auth to steal.
3. **No authentication on the public API.** Anyone can read from any namespace. Don't store sensitive data in SingularityDB.
4. **Rate limiting is per-username, not per-IP.** Someone could create multiple X accounts to bypass limits.

## Reporting Security Issues

If you find a vulnerability, please open a GitHub issue or contact the maintainers directly. We take security seriously given the nature of this project.
