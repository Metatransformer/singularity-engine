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

### GitHub Pages Setup

You need a public repo for deploying built apps. Fork `Metatransformer/singularity-builds` and enable GitHub Pages on the `main` branch. The `config` command will guide you through this.

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

- Input sanitization — injection patterns, blocked content, length limits
- Output scanning — generated HTML scanned for dangerous patterns
- Rate limiting — 2 builds per user per hour
- Sandboxed generation — single-file HTML only, no external deps

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
