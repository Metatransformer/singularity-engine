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

## CLI Commands

```bash
singularityengine config      # Interactive setup — API keys, tokens, settings
singularityengine deploy      # Deploy to AWS (Lambda, DynamoDB, EventBridge, API Gateway)
singularityengine status      # Infrastructure health, config, bot status
singularityengine start       # Enable tweet polling
singularityengine stop        # Disable tweet polling (keeps infra)
singularityengine update      # Self-update from git
singularityengine uninstall   # Full teardown — delete all AWS resources
```

### Deploy Options

```bash
singularityengine deploy --dry-run   # Preview without making changes
```

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

## Prerequisites

- **Node.js** v20+
- **AWS Account** — Lambda, DynamoDB, EventBridge, IAM
- **X (Twitter) API** — Bearer token with search/read access
- **GitHub** — Personal access token with repo write access
- **Anthropic API** — Claude API key

## Quick Start

```bash
# 1. Install
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash

# 2. Configure
singularityengine config

# 3. Deploy
singularityengine deploy

# 4. Verify
singularityengine status

# 5. Tweet a build request!
```

## Detailed Setup

### AWS Setup

1. **Create an AWS account** at [aws.amazon.com](https://aws.amazon.com) if you don't have one
2. **Install the AWS CLI** and configure credentials:
   ```bash
   aws configure
   # Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output (json)
   ```
3. **IAM permissions needed:** Lambda full access, DynamoDB, EventBridge, API Gateway, IAM role management, STS, CloudWatch Logs. Use `AdministratorAccess` for simplicity, or see [docs/SETUP.md](docs/SETUP.md) for a minimal policy.
4. **Recommended region:** `us-east-1`

### X (Twitter) API Setup

1. Sign up at [developer.x.com](https://developer.x.com) (Free tier works for reading)
2. Create a **Project** → **App**
3. Copy the **Bearer Token** from Keys and Tokens
4. *(For `x-api` reply mode only)* Enable Read+Write permissions, then generate **Access Token and Secret**

### GitHub Setup

1. **Fork** [Metatransformer/singularity-builds](https://github.com/Metatransformer/singularity-builds) (or create a new empty repo)
2. **Enable GitHub Pages:** Repo → Settings → Pages → Deploy from branch `main` / root
3. **Create a PAT:** [github.com/settings/tokens](https://github.com/settings/tokens) → Generate new token (classic) → scope: `repo`

### Anthropic API Setup

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Add billing (~$0.05-0.10 per build)

### What `singularityengine config` Asks

| Section | Prompt | What to Enter |
|---------|--------|--------------|
| **X API** | Bearer token | Your X API Bearer Token |
| | Tweet ID to watch | Numeric tweet ID from the URL of the tweet to monitor |
| | Your X username | Handle without @ |
| **AWS** | Region | `us-east-1` (default) |
| | DynamoDB table name | `singularity-db` (default) |
| **GitHub** | Personal access token | Your PAT with `repo` scope |
| | Builds repo | `org/repo-name` format |
| | GitHub Pages URL | Auto-calculated |
| **Anthropic** | API key | Starts with `sk-ant-...` |
| **SingularityDB** | API Gateway URL | Leave blank (set by `deploy`) |
| **Reply Mode** | Mode | `openclaw` or `x-api` |

The CLI validates all tokens after entry.

### What `singularityengine deploy` Creates

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

### Troubleshooting

| Problem | Solution |
|---------|----------|
| "AWS credentials not configured" | Run `aws configure` |
| X API 401 | Regenerate Bearer Token at developer.x.com |
| X API 429 | Rate limited — wait and retry |
| GitHub 404 | Check repo exists and PAT has `repo` scope |
| Lambda timeout | Code-runner default is 120s; increase if needed |
| "No new replies" but tweets exist | Verify `WATCHED_TWEET_ID` and keyword "singularityengine" |
| EventBridge not triggering | Run `singularityengine start` |

📖 **Full setup guide:** [docs/SETUP.md](docs/SETUP.md)

## Reply Modes

Set `REPLY_MODE` during config.

| Mode | Speed | Requirements | Best For |
|------|-------|-------------|----------|
| `openclaw` | ~60s/reply | OpenClaw running locally | Development, no API write access |
| `x-api` | ~1s/reply | X developer app (read+write) | Production |

## Components

| Component | Location | Runtime |
|-----------|----------|---------|
| Tweet Watcher | `aws/tweet-watcher/` | AWS Lambda (EventBridge, every 2 min) |
| Code Runner | `aws/code-runner/` | AWS Lambda |
| Deployer | `aws/deployer/` | AWS Lambda |
| Reply Poller | `poller/` | Local Node.js process |
| Shared Utils | `shared/` | Imported by watcher + runner |
| CLI | `bin/cli.mjs` | Local Node.js |

## Environment Variables

All configured via `singularityengine config` and stored in `.env`:

| Variable | Description |
|----------|-------------|
| `X_BEARER_TOKEN` | X API bearer token |
| `WATCHED_TWEET_ID` | Tweet ID to monitor |
| `OWNER_USERNAME` | Your X username |
| `AWS_REGION` | AWS region (default: us-east-1) |
| `TABLE_NAME` | DynamoDB table name |
| `ANTHROPIC_API_KEY` | Claude API key |
| `SINGULARITY_DB_URL` | API Gateway URL (set by deploy) |
| `GITHUB_TOKEN` | GitHub PAT |
| `GITHUB_REPO` | Builds repo (e.g., `org/builds`) |
| `GITHUB_PAGES_URL` | Pages base URL |
| `REPLY_MODE` | `openclaw` or `x-api` |

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

📖 **Full details:** [docs/SECURITY.md](docs/SECURITY.md)

## Cost

~$0.10 per build (Claude API ~$0.05–0.10, Lambda ~$0.001, DynamoDB ~$0.001, GitHub Pages free).

## Developer Guide

### Project Structure

```
singularity-engine/
├── bin/
│   ├── cli.mjs          # Main CLI entry point
│   ├── install.sh        # One-liner installer
│   └── setup.mjs         # Legacy interactive setup
├── aws/
│   ├── code-runner/      # Lambda: generates apps with Claude
│   ├── deployer/         # Lambda: pushes to GitHub Pages
│   └── tweet-watcher/    # Lambda: polls X for build requests
├── shared/
│   ├── prompts.mjs       # System prompts for Claude
│   ├── security.mjs      # Input/output sanitization
│   └── x-api-client.mjs  # X API OAuth client
├── poller/
│   └── poll-and-reply.mjs  # Local reply poller
├── deploy-aws.sh         # Legacy bash deployer (use CLI instead)
└── package.json
```

### Customization

- **Prompts** (`shared/prompts.mjs`) — Change Claude's behavior, default theme, coding style
- **Security** (`shared/security.mjs`) — Add/remove injection patterns, adjust output scanner
- **Rate limits** (`aws/tweet-watcher/index.mjs`) — Change builds per user per hour

### Local Development

```bash
# Run setup interactively
node bin/cli.mjs config

# Deploy with dry-run to preview
node bin/cli.mjs deploy --dry-run

# Check status
node bin/cli.mjs status

# Start the local reply poller
node poller/poll-and-reply.mjs
```

## License

MIT — see [LICENSE](LICENSE).
