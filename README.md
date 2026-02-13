# 🦀 Singularity Engine

**Autonomous tweet-to-app pipeline.** Tweet a request → AI builds it → deploys live → replies with link.

> "build me a todo app" → 45 seconds later → live app + reply

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
4. **Reply Poller** — local process polls DynamoDB reply queue, sends tweet replies via OpenClaw browser automation

## Prerequisites

- **AWS Account** — Lambda, DynamoDB, EventBridge, IAM
- **X (Twitter) API** — Bearer token with search/read access
- **GitHub** — Personal access token with repo write access
- **Anthropic API** — Claude API key
- **Node.js** — v20+
- **OpenClaw** — (optional) for automated tweet replies via browser

## Quick Start

### 1. Clone

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Create GitHub Pages repo

Create a public repo (e.g., `your-org/singularity-builds`) with GitHub Pages enabled on the `main` branch.

### 4. Deploy AWS infrastructure

```bash
# Preview what will be created
./deploy-aws.sh --dry-run

# Deploy
./deploy-aws.sh
```

Then set Lambda environment variables (the script prints the commands).

### 5. Start the poller

```bash
node poller/poll-and-reply.mjs
```

### 6. Tweet!

Reply to your watched tweet with a build request:
> "build me a snake game"

## Components

| Component | Location | Runtime |
|-----------|----------|---------|
| Tweet Watcher | `aws/tweet-watcher/` | AWS Lambda (EventBridge, every 2 min) |
| Code Runner | `aws/code-runner/` | AWS Lambda or Docker |
| Deployer | `aws/deployer/` | AWS Lambda |
| Reply Poller | `poller/` | Local Node.js process |
| Shared Utils | `shared/` | Imported by watcher + runner |

## Security

- **Input sanitization** — injection patterns, blocked content, length limits (`shared/security.mjs`)
- **Output scanning** — generated HTML scanned for dangerous patterns (eval, fetch to unauthorized URLs, etc.)
- **Rate limiting** — 2 builds per user per hour
- **Sandboxed generation** — Claude generates only single-file HTML with no external dependencies
- **SingularityDB only** — apps can only persist data via the provided API (no localStorage, cookies, etc.)

## Customization

### Prompts (`shared/prompts.mjs`)

Edit the system prompt to change Claude's behavior — default theme, coding style, allowed patterns.

### Security rules (`shared/security.mjs`)

Add/remove injection patterns or blocked content categories. Adjust the output scanner allowlist.

### Build limits

In `aws/tweet-watcher/index.mjs`:
- `getUserBuildCount` — change rate limit (default: 2/hour)
- `sanitize` — adjust input length limit (default: 500 chars)

## Reply Modes

The poller supports two modes for sending tweet replies. Set `REPLY_MODE` in `.env`.

### OpenClaw (Default)

```
REPLY_MODE=openclaw
```

- **How it works:** Poller saves reply files to `pending-replies/`, OpenClaw heartbeat picks them up and uses browser automation to post replies
- **Pros:** No X API write access needed, works with any X account
- **Cons:** Slow (~60s per reply), requires OpenClaw running locally, not scalable

### X API v2 (Recommended for production)

```
REPLY_MODE=x-api
```

- **How it works:** Poller posts replies directly via X API v2 with OAuth 1.0a
- **Pros:** Fast (~1s per reply), scalable, reliable, no browser needed
- **Cons:** Needs X developer app with read+write permissions

**Setup:**

1. Go to [developer.x.com](https://developer.x.com)
2. Create a project and app (or use existing)
3. Set app permissions to **Read and Write**
4. Generate Access Token and Secret (with read+write scope)
5. Add all 4 values to `.env`:
   ```
   X_CONSUMER_KEY=...
   X_CONSUMER_SECRET=...
   X_ACCESS_TOKEN=...
   X_ACCESS_TOKEN_SECRET=...
   ```
6. Set `REPLY_MODE=x-api`

**Rate limits:** Free tier = 500 posts/month. Basic ($200/mo) = 3,000 posts/month.

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `X_BEARER_TOKEN` | Tweet Watcher | X API bearer token |
| `WATCHED_TWEET_ID` | Tweet Watcher | Tweet ID to monitor for replies |
| `OWNER_USERNAME` | Tweet Watcher, Poller | Your X username (to skip self-replies) |
| `TABLE_NAME` | All Lambdas | DynamoDB table name |
| `ANTHROPIC_API_KEY` | Code Runner | Claude API key |
| `SINGULARITY_DB_URL` | Code Runner, Poller | SingularityDB API Gateway URL |
| `GITHUB_TOKEN` | Deployer | GitHub PAT with repo access |
| `GITHUB_REPO` | Deployer | Target repo (e.g., `org/builds`) |
| `GITHUB_PAGES_URL` | Deployer | Pages base URL |
| `REPLY_MODE` | Poller | `openclaw` (default) or `x-api` |
| `X_CONSUMER_KEY` | Poller | OAuth 1.0a consumer key (x-api mode) |
| `X_CONSUMER_SECRET` | Poller | OAuth 1.0a consumer secret (x-api mode) |
| `X_ACCESS_TOKEN` | Poller | OAuth 1.0a access token (x-api mode) |
| `X_ACCESS_TOKEN_SECRET` | Poller | OAuth 1.0a access token secret (x-api mode) |
| `OPENCLAW_CDP_PORT` | Poller | CDP port for browser automation (openclaw mode) |

## Cost

Approximate per-build cost:
- Claude API (Sonnet): ~$0.05–0.10
- AWS Lambda: ~$0.001
- DynamoDB: ~$0.001
- GitHub Pages: free

**~$0.10 per build** at typical usage.

## License

MIT — see [LICENSE](LICENSE).
