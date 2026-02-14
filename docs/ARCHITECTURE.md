# Architecture

## Pipeline Overview

```
Tweet → Sanitize → Claude → Scan → Deploy → Reply
```

Metatransformr OS is a serverless pipeline that converts tweets into live web applications. The entire system runs on AWS Lambda with GitHub Pages for hosting generated apps.

## Components

### 1. Tweet Watcher (`aws/tweet-watcher/index.mjs`)
**Runtime:** AWS Lambda, triggered by EventBridge every 2 minutes

**What it does:**
1. Queries X API for tweets containing "metatransformr" that are either:
   - Replies to a watched thread (`WATCHED_TWEET_ID`)
   - @mentions of the owner
2. Filters out self-replies, already-built tweets, and rate-limited users
3. Extracts the build request (everything after "metatransformr")
4. Sanitizes input through injection detection and content filtering
5. Invokes the Code Runner Lambda with the sanitized request
6. Invokes the Deployer Lambda with the generated HTML

**State:** Tracks `last_processed_tweet` in DynamoDB to avoid reprocessing.

### 2. Code Runner (`aws/code-runner/run.mjs`)
**Runtime:** AWS Lambda (512MB, 120s timeout)

**What it does:**
1. Receives a sanitized build request + app ID
2. Sends a carefully crafted prompt to Claude (Sonnet) with:
   - System prompt defining strict rules (single HTML file, no external deps, etc.)
   - MetatransformrDB client code for persistence
   - The user's request
3. Extracts HTML from Claude's response
4. Injects a Content-Security-Policy meta tag
5. Scans the output for dangerous patterns
6. Returns the HTML or throws on critical violations

**Key design:** Claude only sees the sanitized tweet text. No env vars, API keys, or system information is included in the prompt.

### 3. Deployer (`aws/deployer/index.mjs`)
**Runtime:** AWS Lambda (256MB, 30s timeout)

**What it does:**
1. Receives generated HTML + metadata
2. Pushes to GitHub Pages repo via GitHub API (`PUT /repos/:owner/:repo/contents/:path`)
3. Logs the build to DynamoDB (`_builds` namespace)
4. Rates the app's "coolness" for the showcase gallery
5. Writes to `_showcase` namespace for the public API
6. Queues a reply in `_reply_queue` namespace
7. Optionally notifies the local relay for immediate reply

### 4. Reply Poller (`poller/poll-and-reply.mjs`)
**Runtime:** Local Node.js process (runs on your machine)

**What it does:**
1. Polls DynamoDB `_reply_queue` for pending replies
2. Posts replies to X via either:
   - **X API v2** (OAuth 1.0a, direct posting)
   - **OpenClaw browser automation** (CDP-based, for when you don't have API write access)
3. Marks replies as done in both local state and DynamoDB
4. Enforces a 60-second cooldown between replies

**Why local?** X API write access requires OAuth User Context (not just Bearer token). The poller runs locally where your OAuth credentials live. It can also use OpenClaw's browser to post replies without API write access at all.

### 5. DB API (`aws/db-api/index.mjs`)
**Runtime:** AWS Lambda behind API Gateway

**What it does:**
- Provides a public REST API for:
  - Querying deployed builds (paginated, sorted by coolness)
  - Key-value storage for generated apps (MetatransformrDB)
- Protects system namespaces from public writes
- Enables embedding a build gallery on any website

### 6. Shared Utilities (`shared/`)

| File | Purpose |
|------|---------|
| `prompts.mjs` | System prompt for Claude, user prompt builder |
| `security.mjs` | Input sanitization + output scanning |
| `x-api-client.mjs` | OAuth 1.0a client for X API v2 |

### 7. CLI (`bin/cli.mjs`)
Full-featured CLI for setup, deployment, and management. Handles:
- Interactive configuration
- AWS resource provisioning (IAM, Lambda, DynamoDB, EventBridge, API Gateway)
- Infrastructure status checks
- Start/stop polling
- Full teardown

## Data Model (DynamoDB)

Single table design with `ns` (namespace) partition key and `key` sort key.

| Namespace | Purpose | Schema |
|-----------|---------|--------|
| `_system` | System state | `last_processed_tweet` |
| `_builds` | Build log | `{appId, tweetId, username, request, appUrl, htmlSize}` |
| `_showcase` | Public gallery | `{name, score, query, username, tweet_url, build_url}` |
| `_reply_queue` | Pending replies | `{tweetId, username, appUrl, replyText, status}` |
| `<app-id>` | App data (MetatransformrDB) | User-defined key-value pairs |

## Generated App Model

Every generated app is:
- A **single HTML file** with inline CSS and JavaScript
- Hosted on **GitHub Pages** (static, no server)
- Restricted by **Content Security Policy** to only connect to the MetatransformrDB API
- Given a **unique namespace** in MetatransformrDB for persistence

Apps can read/write data through the MetatransformrDB client class, which is included in every generated app by Claude.

## Cost Structure

| Component | Cost per Build |
|-----------|---------------|
| Claude API (Sonnet) | ~$0.05–0.10 |
| Lambda (3 invocations) | ~$0.001 |
| DynamoDB (5-10 operations) | ~$0.001 |
| API Gateway | ~$0.000001 |
| GitHub Pages | Free |
| EventBridge (polling) | ~$1/month fixed |
| **Total per build** | **~$0.05–0.10** |
