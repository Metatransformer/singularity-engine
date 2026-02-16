# Singularity Engine — Demo Day

**Launch:** Tonight, February 16, 2026 — by midnight CST  
**Author:** Nick Bryant ([@metatransformr](https://x.com/metatransformr))  
**Repo:** [github.com/Metatransformer/singularity-engine](https://github.com/Metatransformer/singularity-engine)  
**Token:** [$singularity-engine on Base](https://dexscreener.com/base/0x06CecE127F81Bf76d388859549A93a120Ec52BA3)

---

## For Users: How to Build Something

### Step 1
Reply to the [launch thread](https://x.com/metatransformr/status/2022500855761572149) or tweet at [@metatransformr](https://x.com/metatransformr) with:

```
@metatransformr singularityengine.ai build me [your idea here]
```

### Step 2
Wait ~2 minutes. The bot detects your tweet, AI generates a full app, deploys it live.

### Step 3
The bot replies to your tweet with a live URL. Click it. Your app is running.

### What Can It Build?
Anything that runs in a browser as a single-page app:

- **Games** — snake with leaderboard, tetris, breakout, puzzle games
- **Productivity** — pomodoro timer, todo list, habit tracker, note-taking app
- **Visualizations** — dashboards, chart builders, sorting algorithm visualizers, fractal generators
- **Tools** — color palette generator, JSON formatter, regex tester, QR code generator

Every app gets a **persistent NoSQL backend** — your data survives across sessions.

### Limits
- **2 builds per user per day** (resets midnight UTC)
- Trigger keyword: `singularityengine.ai`

---

## Today's Plan

### Morning (done)
- [x] Overnight bot swarm committed 11 patches to singularity-engine + 7 phases to the-mesh
- [x] Anthropic API key verified funded and working
- [x] E2E pipeline test passed: code-runner → deployer → GitHub Pages → builds API
- [x] X API OAuth credentials configured on deployer Lambda
- [x] Code-runner timeout bumped to 180s for complex builds
- [x] 90 unit tests passing across 4 test files

### Afternoon (in progress)
- [ ] Seed 3-5 fresh showcase builds (games, tools, visualizations)
- [ ] Real X tweet E2E test (tweet → full pipeline → reply)
- [ ] Verify DB-backed apps work (data persists across page loads)
- [ ] Update metatransformer.com builds gallery with fresh builds
- [ ] Architecture roadmap committed to repo (docs/ARCHITECTURE-ROADMAP.md)

### Evening (launch)
- [ ] Final smoke test of full pipeline
- [ ] Compose launch tweet + thread
- [ ] **Launch** 🚀
- [ ] Monitor first wave of builds, fix anything that breaks live

### Budget
$10K USD personal infrastructure budget allocated for launch and sustained operation.

---

## For Developers: Architecture

### How It Works
```
Tweet with "singularityengine.ai" + idea
    ↓
Tweet Watcher Lambda (polls every 2 min via EventBridge)
    ↓  validates trigger keyword, rate limits (2/user/day)
Code Runner Lambda (Claude Sonnet, 180s timeout)
    ↓  generates single-page HTML app
    ↓  injects SingularityDB client (auto-injected, not AI-generated)
    ↓  security scanner checks for malicious patterns
Deployer Lambda
    ↓  pushes to GitHub Pages (Metatransformer/singularity-builds)
    ↓  writes build metadata to DynamoDB (_builds + _showcase)
    ↓  replies to tweet via X API OAuth
User gets live URL
```

### Stack
| Component | Technology |
|---|---|
| Code generation | Claude Sonnet via Anthropic API |
| Orchestration | AWS Lambda × 4 |
| Database | DynamoDB (single-table, namespace/key schema) |
| API | API Gateway HTTP v2 |
| Hosting | GitHub Pages |
| Replies | X API OAuth 1.0a |
| Scheduling | EventBridge (2-min poll) |
| Security | Custom scanner (XSS, eval, fetch, injection patterns) |

### APIs

**Builds API** — public, read-only
```
GET https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com/api/builds
    ?per_page=10&page=1

→ {builds: [{id, name, score, query, username, tweet_url, build_url}], total, page, per_page}
```

**Data API** — per-app NoSQL storage (used by generated apps)
```
GET    /api/data/:namespace/:key     → read value
PUT    /api/data/:namespace/:key     → write {value: ...}
GET    /api/data/:namespace          → list all keys
DELETE /api/data/:namespace/:key     → delete
```

Protected namespaces (`_system`, `_builds`, `_showcase`, `_reply_queue`, `_rate_limits`, `_rejected`) blocked from public writes.

### Self-Host Your Own
```bash
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash
singularityengine config    # set AWS creds, Anthropic key, GitHub token, X OAuth
singularityengine deploy    # deploy all 4 Lambdas + DynamoDB + API Gateway
singularityengine start     # enable tweet watcher
singularityengine status    # check everything
```

Requires: AWS account, Anthropic API key, GitHub token, X API OAuth credentials.  
Full guide: [docs/SETUP.md](./SETUP.md)

### Roadmap
See [docs/ARCHITECTURE-ROADMAP.md](./ARCHITECTURE-ROADMAP.md) for:
- Per-app database isolation
- Authentication layer
- Multi-channel support (OpenClaw, Mesh, Discord, Telegram, Dashboard)
- Kubernetes / off-AWS portability
- Pluggable channel interface architecture

---

## The Bigger Picture

Singularity Engine is the **creation layer** of the Metatransformer ecosystem.  
[The Mesh](https://github.com/Metatransformer/the-mesh) is the **inhabitation layer**.

SE builds the tools. The Mesh is where they live.

- [Token Transparency Statement](../token-press-release.md)
- [The Federated Agent Mesh (manifesto)](https://x.com/metatransformr/status/2023288262278762646)
- [The LLM Is the Transistor (thesis)](https://x.com/metatransformr/status/2023272380374941993)
- [metatransformer.com](https://metatransformer.com)

---

*MIT Licensed. One human + one AI swarm. Built in public.*
