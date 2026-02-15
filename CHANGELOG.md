# Changelog

All notable changes to Singularity Engine are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0-beta] — 2026-02-15

### 🚀 Initial Release (Experimental)

**Core Pipeline**
- Tweet-to-app pipeline: tweet watcher → Claude code runner → deployer → X reply
- X API OAuth — bot replies directly to build requests with live app links
- Multi-thread watching — monitor multiple tweet threads simultaneously (comma-separated IDs)
- SingularityDB — persistent DynamoDB key-value store, each app gets its own namespace
- Builds API — `GET /api/builds` with pagination, sort (date/coolness), and search

**Security**
- vard library for prompt injection detection
- Custom pattern matching for malicious requests
- Content-Security-Policy injection into all generated HTML
- Code scanning for dangerous patterns (eval, external fetch, etc.)
- Abuse logging with rejection replies

**CLI**
- `singularityengine config` — interactive setup with dependency auto-detection
- `singularityengine deploy` — one-command AWS deployment (Lambda, DynamoDB, API Gateway, EventBridge)
- `singularityengine watch <id>` — set/show watched tweet threads
- `singularityengine status` — infrastructure health check
- `singularityengine start/stop` — enable/disable tweet polling
- `singularityengine api` — show API spec
- `singularityengine update` — self-update from git
- `singularityengine uninstall` — full AWS teardown

**Infrastructure**
- 4 AWS Lambdas: tweet-watcher, code-runner, deployer, db-api
- EventBridge rule (2-min polling interval)
- DynamoDB on-demand table
- API Gateway HTTP API
- GitHub Pages deployment for generated apps
- Two reply modes: `x-api` (X API OAuth) and `openclaw` (browser-based, zero API keys)

**Rate Limiting**
- 2 builds per user per day
- Owner account exempt

**Website**
- singularityengine.ai landing page with live builds gallery
- Pulls from builds API, dark theme, responsive

**Prompts**
- Dark theme (#0a0a0a) with cyan accents by default
- Loading screens, CSS animations, mobile-responsive
- Game builds: Web Audio API sound effects, keyboard + touch controls, persistent high scores
- "Built by Singularity Engine 🤖" watermark on all apps

**Web Build API (unreleased)**
- `POST /api/build` endpoint for website-triggered builds
- Rate limited by IP, anti-bot token, CORS-restricted
