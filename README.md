# 🤖 Singularity Engine

**v0.1 Beta (Experimental)**

Tweet a request → AI builds a live web app → deploys it → replies with the link. ~45 seconds.

```
SingularityEngine build me a tetris game with neon visuals
```

> ⚠️ **This is an early experimental release.** Apps are AI-generated, may be buggy, and are deployed as-is. See [Known Limitations](#known-limitations) below.

🌐 [singularityengine.ai](https://singularityengine.ai) · 🐦 [@metatransformr](https://x.com/metatransformr) · 💬 [Discord](https://discord.gg/clawd) · 🏠 [metatransformer.com](https://metatransformer.com)

---

## How It Works

1. **Tweet** — Reply to a [watched thread](https://x.com/metatransformr) or @mention with `SingularityEngine <your app idea>`
2. **Sanitize** — Prompt injection detection, content filtering, rate limiting
3. **Build** — Claude generates a complete single-file HTML app with persistence (SingularityDB)
4. **Deploy** — Pushed to GitHub Pages instantly. You get the live link as a reply.

Every generated app gets its own namespace in SingularityDB (DynamoDB-backed key-value store) for persistent data — leaderboards, saved state, user preferences.

## Try It

Reply to any [@metatransformr](https://x.com/metatransformr) thread with:

```
SingularityEngine build me a pomodoro timer
SingularityEngine make a snake game with high scores
SingularityEngine create a mood tracker
```

Rate limit: **2 builds per user per day** during beta.

## Deploy Your Own

```bash
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash
```

Or manually:

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
npm install
singularityengine config    # Interactive setup — auto-detects deps & credentials
singularityengine deploy    # Deploy to AWS (Lambda, DynamoDB, API Gateway)
singularityengine watch <tweet-id>
singularityengine start
```

### Requirements

| Dependency | Required | Purpose |
|-----------|----------|---------|
| Node.js v20+ | ✅ | Runtime |
| AWS CLI v2 | ✅ | Infrastructure deployment |
| GitHub CLI (`gh`) | ✅ | Auth + GitHub Pages deployment |
| Anthropic API key | ✅ | Claude generates the apps |
| X API keys | Only for `x-api` mode | Tweet reading + reply posting |

**Two reply modes:**
- **`openclaw` mode** (default) — Zero X API credentials needed. Uses [OpenClaw](https://openclaw.ai) browser automation.
- **`x-api` mode** — Uses X API OAuth for reading tweets and posting replies directly.

## CLI Commands

```bash
singularityengine config              # Interactive setup
singularityengine deploy [--dry-run]  # Deploy to AWS
singularityengine watch [tweet-id]    # Set/show watched tweet thread
singularityengine status              # Infrastructure health check
singularityengine start               # Enable tweet polling
singularityengine stop                # Disable polling (keeps infra)
singularityengine api                 # Show API spec
singularityengine update              # Self-update from git
singularityengine uninstall           # Full teardown — delete all AWS resources
```

## Architecture

```
Tweet → Sanitize (vard + custom) → Claude (Sonnet) → Security Scan → CSP Inject → GitHub Pages → Reply
```

- **4 AWS Lambdas:** tweet-watcher, code-runner, deployer, db-api
- **EventBridge:** 2-minute polling interval
- **DynamoDB:** On-demand table for builds, app data, rate limits, state
- **API Gateway:** Public API for builds gallery + SingularityDB
- **GitHub Pages:** Static hosting for generated apps

Full architecture docs: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## API

```bash
# List builds (public gallery)
GET /api/builds?page=1&per_page=10&sort=coolness&search=tetris

# Get single build
GET /api/builds/:id

# SingularityDB (used by generated apps)
GET    /api/data/:namespace/:key            # Returns raw value
PUT    /api/data/:namespace/:key  {value}   # Store a value
DELETE /api/data/:namespace/:key            # Remove a key
GET    /api/data/:namespace                 # List all keys
```

## Known Limitations

- **Single-file apps only** — HTML + inline CSS/JS. No multi-file projects yet.
- **No user accounts** — Anyone can build, nobody can edit or delete.
- **AI-generated code** — Apps may have bugs, visual glitches, or unexpected behavior.
- **No auth on apps** — SingularityDB namespaces are readable/writable by anyone.
- **Rate limits** — 2 builds/user/day. Server costs are currently fronted by [@metatransformr](https://x.com/metatransformr).
- **GitHub Pages only** — No custom domains, no server-side rendering, no backends.

## Roadmap

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full roadmap.

**Current:** v0.1 Beta — tweet simple apps into existence, backed by DynamoDB, no auth, roll your own.

**Next:** Build from website, live previews, social sharing, showcase page, error recovery.

**Then:** Auth & accounts, dashboard, OpenClaw/agent integration, multi-model, plugins.

**Ideation:** Platform, marketplace, monetization, The Mesh, and more. [Open an issue](https://github.com/Metatransformer/singularity-engine/issues) or [join Discord](https://discord.gg/clawd) to shape what gets built.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for detailed release notes.

## Development

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
npm install

# Run unit tests (mocked DynamoDB, no AWS needed)
npm run test:unit

# Run integration tests (requires live API Gateway)
npm run test:integration

# Run all tests
npm test

# Preview deploy without making changes
singularityengine deploy --dry-run
```

### Project Structure

```
aws/
  code-runner/   # Claude code generation Lambda
  db-api/        # REST API for builds + SingularityDB
  deployer/      # GitHub Pages deployment Lambda
  tweet-watcher/ # X API polling + build orchestration Lambda
  web-builder/   # Website-triggered builds (unreleased)
shared/          # Shared modules (prompts, security, X API client)
bin/             # CLI and install scripts
poller/          # Local reply poller (X API or OpenClaw)
tests/           # Unit + integration tests (Vitest)
site/            # Landing page (singularityengine.ai)
docs/            # Architecture, security, setup guides
```

## Contributing

1. Fork the repo
2. Create a feature branch
3. Run `npm test` to verify tests pass
4. Submit a PR

Bug reports and feature requests: [GitHub Issues](https://github.com/Metatransformer/singularity-engine/issues)

## Security

If you discover a security vulnerability, please report it responsibly via [GitHub Security Advisories](https://github.com/Metatransformer/singularity-engine/security/advisories) or email security concerns to the maintainers. Do not open public issues for security vulnerabilities.

See [`docs/SECURITY.md`](docs/SECURITY.md) for details on our security model.

## Legal

### Disclaimer

Singularity Engine is provided **as-is**, without warranty of any kind, express or implied. AI-generated applications may contain bugs, errors, or unexpected behavior. The maintainers are not responsible for the content, functionality, or consequences of any generated application.

### Acceptable Use

By using Singularity Engine, you agree not to:

- Generate applications that are illegal, harmful, abusive, or violate any applicable laws
- Attempt to bypass security measures, rate limits, or content filtering
- Use generated applications to collect personal data without consent
- Generate applications that impersonate individuals or organizations
- Use the service for spam, phishing, malware distribution, or any malicious purpose
- Attempt prompt injection, system prompt extraction, or adversarial attacks against the AI model

Violations may result in permanent rate limiting or blocking. Abuse is logged and monitored.

### Generated Content

Applications generated by Singularity Engine are created by AI (Anthropic Claude) based on user prompts. The maintainers do not review, endorse, or take responsibility for generated content. Generated applications are deployed to GitHub Pages and are publicly accessible.

### Open Source

Singularity Engine is released under the [MIT License](LICENSE). You are free to fork, modify, and deploy your own instance. Self-hosted instances are subject to their own operator's terms and policies.

### Third-Party Services

This software integrates with third-party services (AWS, GitHub, X/Twitter, Anthropic) which have their own terms of service. Users are responsible for compliance with all applicable third-party terms.

---

Built by [metatransformer](https://metatransformer.com) — a coder and an AI building stuff together 🤖

[singularityengine.ai](https://singularityengine.ai) · [@metatransformr](https://x.com/metatransformr) · [Discord](https://discord.gg/clawd) · [metatransformer.com](https://metatransformer.com)
