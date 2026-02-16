# Singularity Engine — Demo Launch Day

**Status:** TO BE LAUNCHED TONIGHT BY MIDNIGHT CST (February 16, 2026)  
**Author:** Nick Bryant (@metatransformr)  
**Repo:** [github.com/Metatransformer/singularity-engine](https://github.com/Metatransformer/singularity-engine)

---

## What Is Singularity Engine?

An autonomous tweet-to-app pipeline. You describe what you want → AI builds it → deploys it live → replies with the URL.

**Tweet an idea. Get back a working app.**

Games, productivity tools, visualizations, bots — anything that runs in a browser. Each app gets a persistent NoSQL backend (DynamoDB) so your data survives across sessions.

---

## How It Works

```
You tweet @metatransformr with "singularityengine.ai" + your idea
    ↓
Tweet watcher detects it (polls every 2 min)
    ↓
Code runner (Claude) generates a full single-page app
    ↓
Security scanner checks for malicious code
    ↓
Deployer pushes to GitHub Pages
    ↓
Bot replies to your tweet with the live URL
```

**Stack:** AWS Lambda × 4, DynamoDB, API Gateway, GitHub Pages, X API OAuth

---

## Demo Use Cases

These are the kinds of things Singularity Engine builds:

### Games
- Snake with persistent leaderboard
- Tron lightcycle vs AI
- Tetris with high scores
- Breakout with level progression

### Productivity
- Pomodoro timer with session history
- Todo list with categories
- Habit tracker with streaks
- Markdown note-taking app

### Visualizations
- Real-time data dashboard
- Interactive chart builder
- Sorting algorithm visualizer
- Fractal generator

### Tools
- Color palette generator
- JSON formatter/validator
- Regex tester
- QR code generator

---

## Rate Limits

- **2 builds per user per day** (resets at midnight UTC)
- Trigger keyword: `singularityengine.ai` (in reply to a watched thread or @metatransformr)

---

## Self-Host Your Own Instance

```bash
# One-liner install
curl -fsSL https://raw.githubusercontent.com/Metatransformer/singularity-engine/main/bin/install.sh | bash

# Configure
singularityengine config

# Deploy to your AWS account
singularityengine deploy

# Start the tweet watcher
singularityengine start

# Check status
singularityengine status
```

Requires: AWS account, Anthropic API key, GitHub token, X API OAuth credentials.

Full setup guide: [docs/SETUP.md](./SETUP.md)

---

## Builds API

All builds are queryable via public API:

```
GET https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com/api/builds
```

Returns:
```json
{
  "builds": [
    {
      "id": "build-123",
      "name": "Snake Game",
      "score": 85,
      "query": "build me a snake game with leaderboard",
      "username": "someuser",
      "tweet_url": "https://x.com/...",
      "build_url": "https://metatransformer.github.io/singularity-builds/..."
    }
  ],
  "total": 6,
  "page": 1,
  "per_page": 10
}
```

---

## Data API

Every generated app gets its own NoSQL namespace. Apps can store and retrieve data:

```
GET  /api/data/:namespace/:key     → read
PUT  /api/data/:namespace/:key     → write
GET  /api/data/:namespace          → list all keys
DELETE /api/data/:namespace/:key   → delete
```

Protected namespaces (`_system`, `_builds`, `_showcase`, `_reply_queue`, `_rate_limits`, `_rejected`) are blocked from public writes.

---

## Launch Checklist

- [ ] Verify Anthropic API key is funded on code-runner Lambda
- [ ] Run end-to-end pipeline test (tweet → build → deploy → reply)
- [ ] Verify builds API returns correct data
- [ ] Verify data API read/write/list/delete cycle
- [ ] Test rate limiting (3rd request in a day should be rejected)
- [ ] Verify security scanner catches malicious patterns
- [ ] Test self-host CLI: `singularityengine config && singularityengine deploy`
- [ ] Seed 2-3 fresh showcase builds
- [ ] Update metatransformer.com builds gallery
- [ ] Compose launch tweet
- [ ] Launch 🚀

---

## The Bigger Picture

Singularity Engine is the **creation layer** of the Metatransformer ecosystem.

[The Mesh](https://github.com/Metatransformer/the-mesh) is the **inhabitation layer** — a federated 3D metaverse where AI agents and humans coexist.

SE builds the tools. The Mesh is where they live.

- [Token Transparency Statement](../token-press-release.md)
- [The Federated Agent Mesh Manifesto](https://x.com/metatransformr/status/2023288262278762646)
- [The LLM Is the Transistor (thesis)](https://x.com/metatransformr/status/2023272380374941993)

---

*MIT Licensed. Built by one human + one AI swarm.*
