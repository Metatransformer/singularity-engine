# Singularity Engine

**v0.1 Beta (Experimental)**

Tweet a request → AI builds a live web app → deploys it → replies with the link. ~60 seconds.

```
@metatransformr singularityengine.ai build me a tetris game with neon visuals
```

> **This is an early experimental release.** Apps are AI-generated, may be buggy, and are deployed as-is. See [Known Limitations](#known-limitations) below.

🌐 [singularityengine.ai](https://singularityengine.ai) · 🐦 [@metatransformr](https://x.com/metatransformr) · 💬 [Discord](https://discord.gg/CYp4wJvFQF) · 🏠 [metatransformer.com](https://metatransformer.com)

---

## Why This Exists

We're at the knee of the curve. AI agents can write code, deploy it, and operate autonomously — but there's no infrastructure for them to discover each other, coordinate, or be held accountable. Singularity Engine is the **creation layer** — a working proof of concept for autonomous AI that turns natural language into deployed software at near-zero marginal cost. [The Mesh](https://github.com/Metatransformer/the-mesh) is the **inhabitation layer** — a federated agent infrastructure protocol where agents and humans coexist with cryptographic identity and human oversight.

Together they form the [Metatransformer](https://metatransformer.com) ecosystem: open-source infrastructure for Human-AI Synthesis.

Read the full thesis: **[The Transformer Is the Transistor](docs/articles/the-transformer-is-the-transistor.md)** ([view on X](https://x.com/metatransformr/status/2022949168998756595))

---

## Try the Demo

Reply to any [@metatransformr](https://x.com/metatransformr) thread on X with:

```
@metatransformr singularityengine.ai build me a pomodoro timer
@metatransformr singularityengine.ai make a snake game with high scores
@metatransformr singularityengine.ai create a mood tracker
```

The bot detects your tweet, AI generates a full single-page app with persistent NoSQL storage, deploys it to GitHub Pages, and replies with the live link. ~2 minutes end-to-end.

Rate limit: **2 builds per user per day** during beta.

Full demo walkthrough: [`docs/DEMO.md`](docs/DEMO.md)

---

## How It Works

1. **Tweet** — Reply to a [watched thread](https://x.com/metatransformr) with `singularityengine.ai` + your app idea
2. **Sanitize** — Prompt injection detection, content filtering, rate limiting
3. **Build** — Claude generates a complete single-file HTML app with persistence (SingularityDB)
4. **Deploy** — Pushed to GitHub Pages instantly. You get the live link as a reply.

Every generated app gets its own namespace in SingularityDB (DynamoDB-backed key-value store) for persistent data — leaderboards, saved state, user preferences.

---

## Deploy Your Own

Clone the repo and run your own instance:

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
npm install
singularityengine config    # Interactive setup — auto-detects deps & credentials
singularityengine deploy    # Deploy to AWS (Lambda, DynamoDB, API Gateway)
singularityengine watch <tweet-id>
singularityengine start
```

Or one-liner install:

```bash
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash
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

Full setup guide: [`docs/SETUP.md`](docs/SETUP.md)

---

## The Mesh — Federated Agent Infrastructure

[**The Mesh**](https://github.com/Metatransformer/the-mesh) is a federated agent infrastructure protocol — self-hosted, open-source, model-agnostic. A persistent, decentralized network where AI agents and humans coexist as first-class citizens, communicating through open protocols (MCP, A2A), maintaining cryptographic identity (DIDs, UCANs), and governed by humans who retain authority over every consequential decision.

Singularity Engine builds the tools. The Mesh is where they live.

Read the manifesto: **[The Federated Agent Mesh](docs/articles/the-federated-agent-mesh.md)** ([view on X](https://x.com/metatransformr/status/2023288262278762646))

---

## DeFi and the $singularity-engine Token

DeFi is real infrastructure for agentic systems. Machine-to-machine payments (Coinbase x402), agent wallets, and decentralized compute markets are not speculative — they're shipping now. The **$singularity-engine** token on the BASE network exists as an early community experiment to fund open-source agent infrastructure into existence without VC dependency.

- **Contract:** [`0x06CecE127F81Bf76d388859549A93a120Ec52BA3`](https://dexscreener.com/base/0x06CecE127F81Bf76d388859549A93a120Ec52BA3)
- **Network:** BASE (sub-cent transactions, 200ms blocks)
- **Full transparency statement:** [`token-press-release.md`](token-press-release.md)
- **Bankr.bot partnership:** [Press release on X](https://x.com/metatransformr/status/2023205508812001524)
- **Token utility thesis:** [Thread on X](https://x.com/metatransformr/status/2022885459823657464)

> **Nothing here is financial advice.** The token is early, has limited liquidity, and utility depends entirely on future development. Always verify on [basescan.org](https://basescan.org) before any interaction. Read the [full transparency statement](token-press-release.md).

---

## Who We're Looking For

This is an open-source project built in public. We're looking for:

- **A co-founder** with go-to-market, enterprise sales, or developer relations experience
- **Developers** — distributed systems, real-time networking, security, agent frameworks
- **Infrastructure partners** interested in decentralized mesh hosting
- **Community members** who believe agents and humans need better shared environments

Join the community: [Discord](https://discord.gg/CYp4wJvFQF) · [@metatransformr on X](https://x.com/metatransformr)

---

## Documentation

### Articles
- **[The Transformer Is the Transistor](docs/articles/the-transformer-is-the-transistor.md)** — Full thesis on why the transformer is a universal primitive generating a new intelligence stack, and what infrastructure is missing ([X thread](https://x.com/metatransformr/status/2022949168998756595))
- **[The Federated Agent Mesh](docs/articles/the-federated-agent-mesh.md)** — Manifesto for a federated agent infrastructure protocol with human oversight, cryptographic identity, and model-agnostic design ([X thread](https://x.com/metatransformr/status/2023288262278762646))

### Project Docs
- [`docs/DEMO.md`](docs/DEMO.md) — Demo day walkthrough (users, developers, architecture)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture
- [`docs/ARCHITECTURE-ROADMAP.md`](docs/ARCHITECTURE-ROADMAP.md) — Architecture TODOs and priority matrix (A1–A8)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Product roadmap (v0.1 → v1.0)
- [`docs/SECURITY.md`](docs/SECURITY.md) — Security model
- [`docs/SETUP.md`](docs/SETUP.md) — Full setup and deployment guide
- [`docs/PRE-LAUNCH-CHECKLIST.md`](docs/PRE-LAUNCH-CHECKLIST.md) — Launch checklist
- [`token-press-release.md`](token-press-release.md) — Token transparency statement and commitments

### Related Repos
- **[The Mesh](https://github.com/Metatransformer/the-mesh)** — Federated agent infrastructure protocol (WIP/pre-alpha)
- **[Singularity Engine](https://github.com/Metatransformer/singularity-engine)** — This repo — autonomous tweet-to-app pipeline

---

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
docs/            # Architecture, security, setup guides, articles
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

Built by [Nick Bryant](https://metatransformer.com) — a coder and an AI building stuff together

[singularityengine.ai](https://singularityengine.ai) · [@metatransformr](https://x.com/metatransformr) · [Discord](https://discord.gg/CYp4wJvFQF) · [metatransformer.com](https://metatransformer.com)
