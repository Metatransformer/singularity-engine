# 🦀 Singularity Engine

**Autonomous tweet-to-app pipeline.** Tweet a request → AI builds it → deploys live → replies with link.

> "SingularityEngine build me a todo app" → 45 seconds later → live app + reply

## How People Use It

There are two ways to trigger a build:

1. **Reply to your thread** — You post a thread on X, and people reply with:
   ```
   SingularityEngine build me a tetris game
   ```

2. **@mention you directly** — Anyone tweets:
   ```
   @yourusername SingularityEngine make a pomodoro timer
   ```

The keyword `SingularityEngine` (case-insensitive) is **required**. Without it, the bot ignores the tweet. Each user is rate-limited to 2 builds per hour.

All replies include a link back to this repo so people can deploy their own.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
npm install
npm link  # or: sudo ln -sf $(pwd)/bin/cli.mjs /usr/local/bin/singularityengine
```

## Dependencies

| Dependency | Required | How It's Used |
|-----------|----------|---------------|
| **Node.js** v20+ | ✅ | Runtime for CLI and Lambda functions |
| **AWS CLI** v2 | ✅ | Deploys infrastructure (Lambda, DynamoDB, EventBridge) |
| **GitHub CLI** (`gh`) | ✅ | Auth token, repo forking, API access |
| **Anthropic API key** | ✅ | Claude generates the apps |
| **X API Bearer Token** | Only for `x-api` mode | Reading tweets (openclaw mode uses browser instead) |
| **X API OAuth 1.0a** | Only for `x-api` mode | Posting reply tweets |

`singularityengine config` checks for all dependencies and offers to install missing ones.

## CLI Commands

```bash
singularityengine config              # Interactive setup — auto-detects deps & credentials
singularityengine deploy              # Deploy to AWS (Lambda, DynamoDB, EventBridge, API Gateway)
singularityengine watch 1234567890    # Set the tweet to watch for replies
singularityengine watch               # Show current watched tweet
singularityengine status              # Infrastructure health, config, bot status
singularityengine start               # Enable tweet polling
singularityengine stop                # Disable tweet polling (keeps infra)
singularityengine api                 # Show API spec for embedding builds
singularityengine update              # Self-update from git
singularityengine uninstall           # Full teardown — delete all AWS resources
```

### Deploy Options

```bash
singularityengine deploy --dry-run   # Preview without making changes
```

## Setup Flow

### What `singularityengine config` does

Config is a 4-step interactive process. It auto-detects as much as possible and only asks you for things it can't figure out on its own.

#### Step 1: Dependency Check

Checks for `node` (v20+), `aws` CLI, and `gh` CLI. If anything's missing, offers to install via Homebrew (macOS) or apt (Debian/Ubuntu). Also checks if AWS and GitHub credentials are configured — runs `aws configure` or `gh auth login` if needed.

```
📋 Checking dependencies...
  ✅ node v22.0.0 (v20+ required)
  ✅ aws CLI v2.15.0
  ✅ gh CLI v2.45.0

📋 Checking credentials...
  ✅ AWS configured (us-east-1, account 123456789)
  ✅ GitHub authenticated (yourname)
```

#### Step 2: Reply Mode + API Keys

Asks you to choose a reply mode, then only asks for the keys that mode requires:

**openclaw mode** (default) — zero X API credentials needed:
- Anthropic API key
- Your X username (for tweet filtering)

**x-api mode** — needs X developer credentials:
- Anthropic API key
- X Bearer Token (validated against the API)
- X OAuth 1.0a credentials (Consumer Key/Secret, Access Token/Secret)

All keys are validated on entry.

#### Step 3: Auto-Configure GitHub

Uses the `gh` CLI to:
1. Check if you already have a `singularity-builds` fork
2. If not, offers to fork `Metatransformer/singularity-builds` for you
3. Derives the GitHub Pages URL automatically

```
🐙 GitHub Setup
  Checking for singularity-builds fork...
  ✅ Found: yourname/singularity-builds
  ✅ GitHub Pages URL: https://yourname.github.io/singularity-builds
```

#### Step 4: Save and Summarize

Everything auto-detected is saved to `.env`:
- `AWS_REGION` → from `aws configure get region`
- `TABLE_NAME` → `singularity-db` (default)
- `GITHUB_TOKEN` → from `gh auth token`
- `GITHUB_REPO` → detected from fork
- `GITHUB_PAGES_URL` → derived from repo
- `OWNER_USERNAME` → from X API `/2/users/me` or manual entry

Things you DON'T configure here (set by other commands):
- `SINGULARITY_DB_URL` → created by `singularityengine deploy`
- `WATCHED_TWEET_ID` → set by `singularityengine watch <tweet_id>`

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  X (Twitter) │────▶│  Tweet Watcher   │────▶│   Code Runner    │
│  @your_bot   │     │  (AWS Lambda)    │     │  (AWS Lambda)    │
└─────────────┘     │  polls every 2m  │     │  Claude builds   │
       ▲            └──────────────────┘     │  single-file app │
       │                                      └────────┬─────────┘
       │            ┌──────────────────┐               │
       │            │    Deployer      │◀──────────────┘
       │            │  (AWS Lambda)    │
       │            │  → GitHub Pages  │
       │            │  → DynamoDB log  │
       │            └────────┬─────────┘
       │                     │
       │            ┌────────▼─────────┐
       └────────────│  Reply Poller    │
                    │  (local node.js) │
                    │  via OpenClaw    │
                    └──────────────────┘
```

### Data Flow

1. **Tweet Watcher** — polls X API for replies to a watched tweet, sanitizes input, rejects injections
2. **Code Runner** — sends sanitized request to Claude, generates a single-file HTML app with SingularityDB for persistence
3. **Deployer** — pushes HTML to GitHub Pages, logs build to DynamoDB, queues reply
4. **Reply Poller** — local process polls DynamoDB reply queue, sends tweet replies via OpenClaw browser automation or X API v2

## Reply Modes

| Mode | Speed | Requirements | Best For |
|------|-------|-------------|----------|
| `openclaw` | ~60s/reply | OpenClaw running locally, zero X API creds | Development, no API write access |
| `x-api` | ~1s/reply | X developer app (bearer + read+write OAuth) | Production |

## Quick Start

```bash
# 1. Install
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash

# 2. Configure (auto-detects deps + credentials)
singularityengine config

# 3. Deploy
singularityengine deploy

# 4. Set the tweet to watch
singularityengine watch 1234567890

# 5. Verify
singularityengine status

# 6. Tweet a build request!
```

## Security

Singularity Engine takes untrusted input from public tweets and generates code. Security is multi-layered:

### 🔒 Environment Variable Isolation
- **Env vars (API keys, tokens) stay in AWS Lambda** — they are never passed to Claude as context and never appear in generated code
- Generated apps run as **static HTML on GitHub Pages** — no server, no `process.env`, no access to any secrets
- The Anthropic API key is used *by* Lambda to call Claude, but the key itself is never included in prompts

### 🛡️ Input Sanitization
- **30+ injection detection patterns** catch prompt injection attempts ("ignore previous instructions", `process.env`, `eval()`, etc.)
- **Content filtering** blocks NSFW, weapons, drugs, hacking tools, phishing requests
- **500 character limit** on build requests
- **HTML stripping** and character allowlisting

### 🔍 Output Scanning
Generated HTML is scanned for dangerous patterns before deployment:
- `process.env`, `require()`, `eval()`, `Function()` — blocked
- `WebSocket`, `EventSource`, `sendBeacon` — exfiltration channels blocked
- `document.cookie`, `localStorage` — storage access blocked
- Unauthorized `fetch()` targets — only SingularityDB API allowed
- Dynamic URL construction — flagged as potential exfiltration

### 🌐 Content Security Policy
Every generated app gets a CSP meta tag injected that restricts `connect-src` to only the SingularityDB API. Even if malicious code slips past the scanner, the **browser blocks** unauthorized network requests.

### ⏱️ Rate Limiting
- 2 builds per user per hour
- 60-second cooldown between replies
- Tweet polling every 2 minutes

### 🗄️ API Protection
- System namespaces (`_system`, `_builds`, `_reply_queue`) are **read-only** via the public API
- All `_`-prefixed namespaces are reserved and blocked from public writes
- 100KB max value size to prevent abuse

📖 **Full security architecture, threat model, and trust boundaries:** [docs/SECURITY.md](docs/SECURITY.md)

## What `singularityengine deploy` Creates

| Resource | Name | Purpose |
|----------|------|---------|
| DynamoDB Table | `singularity-db` | Stores builds, replies, app data |
| IAM Role | `singularity-engine-role` | Lambda execution permissions |
| Lambda | `singularity-tweet-watcher` | Polls X every 2 min |
| Lambda | `singularity-code-runner` | Claude generates apps |
| Lambda | `singularity-deployer` | Pushes to GitHub Pages |
| Lambda | `singularity-db-api` | Public REST API |
| EventBridge | `singularity-tweet-poll` | Triggers watcher every 2 min |
| API Gateway | `singularity-db-api` | HTTP API for SingularityDB |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "AWS credentials not configured" | Run `aws configure` |
| X API 401 | Regenerate Bearer Token at developer.x.com |
| X API 429 | Rate limited — wait and retry |
| GitHub 404 | Check repo exists and PAT has `repo` scope |
| Lambda timeout | Code-runner default is 120s; increase if needed |
| "No new replies" but tweets exist | Verify `WATCHED_TWEET_ID` and keyword "singularityengine" |
| EventBridge not triggering | Run `singularityengine start` |

## Components

| Component | Location | Runtime |
|-----------|----------|---------|
| Tweet Watcher | `aws/tweet-watcher/` | AWS Lambda (EventBridge, every 2 min) |
| Code Runner | `aws/code-runner/` | AWS Lambda |
| Deployer | `aws/deployer/` | AWS Lambda |
| Reply Poller | `poller/` | Local Node.js process |
| Shared Utils | `shared/` | Imported by watcher + runner |
| CLI | `bin/cli.mjs` | Local Node.js |

## Cost

~$0.10 per build (Claude API ~$0.05–0.10, Lambda ~$0.001, DynamoDB ~$0.001, GitHub Pages free).

## License

MIT — see [LICENSE](LICENSE).
