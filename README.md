# 🔮 Singularity Engine

**Tweet an idea. Get a working app.**

Singularity Engine turns a tweet into a deployed, functional web application — with a database, hosting, and a live URL. No code. No deploy. Just describe what you want.

## How It Works

```
 You tweet                    Singularity Engine                    Live app
┌──────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────────┐
│ "build me │───▶│ Parse & │───▶│ Generate│───▶│ Deploy  │───▶│ yourapp.gh   │
│  a todo   │    │ Plan    │    │ Code    │    │ to GH   │    │ -pages.io    │
│  app"     │    │ (Lambda)│    │ (Lambda)│    │ Pages   │    │ + DynamoDB   │
└──────────┘    └─────────┘    └─────────┘    └─────────┘    └──────────────┘
```

## Try It

**Official bot:** Tweet or DM [@SingularityEngn](https://x.com/SingularityEngn) with a build request:

> @SingularityEngn build me a landing page for my startup

> @SingularityEngn make a retro space invaders game

> @SingularityEngn create a pomodoro timer with ambient sounds

You can also tweet [@metatransformr](https://x.com/metatransformr) (the creator) — both accounts can build.

That's it. You'll get a reply with your live app URL.

## Refine & Iterate

Got a build but want changes? **Reply directly to the bot's build tweet** using a refine keyword:

> @SingularityEngn refine make the background dark mode

> @SingularityEngn update add a leaderboard

> @SingularityEngn fix the button is too small

**Refine keywords:** `refine`, `update`, `change`, `modify`, `improve`, `fix`

The engine will fetch your existing app's source code and modify it — same URL, improved app. You can iterate as many times as you want.

**Important:** You must reply to the bot's tweet (the one with your app URL). Using refine keywords on a standalone tweet won't work — the engine needs to know which build to modify.

## Example Builds

| App | Link |
|-----|------|
| 🌀 Fractal Explorer | [showcase-fractal-explorer](https://metatransformer.github.io/singularity-builds/apps/showcase-fractal-explorer/) |
| 🐍 Snake Game | [e2e-test-snake-v2](https://metatransformer.github.io/singularity-builds/apps/e2e-test-snake-v2/) |
| 🎨 Color Picker | [showcase-colorpicker](https://metatransformer.github.io/singularity-builds/apps/showcase-colorpicker/) |
| 📝 Notepad | [showcase-notepad](https://metatransformer.github.io/singularity-builds/apps/showcase-notepad/) |
| 🚀 Galaga Clone | [Bootz_of_Truth-galaga-like-game](https://metatransformer.github.io/singularity-builds/apps/Bootz_of_Truth-galaga-like-game-725435/) |

All apps live at `https://metatransformer.github.io/singularity-builds/apps/{id}/`

## Architecture

```
┌────────────────────────────────────────────────┐
│                 API Gateway                     │
├────────────┬───────────┬───────────┬───────────┤
│  Lambda 1  │ Lambda 2  │ Lambda 3  │ Lambda 4  │
│  Parse &   │ Generate  │ Deploy    │ Data API  │
│  Plan      │ Code      │ to GitHub │ (CRUD)    │
├────────────┴───────────┴───────────┴───────────┤
│              DynamoDB (builds + app data)       │
├────────────────────────────────────────────────┤
│              GitHub Pages (static hosting)      │
└────────────────────────────────────────────────┘
```

- **4 Lambda functions** — parse, generate, deploy, data API
- **DynamoDB** — build metadata + per-app key-value data store
- **API Gateway** — REST endpoints for builds and data
- **GitHub Pages** — zero-config static hosting

## Self-Host

Run your own Singularity Engine bot in minutes:

```bash
# Interactive setup — creates .env with your config
npx singularity-engine init
# or
node bin/setup.mjs
```

You'll need:
- An X/Twitter developer account with API credentials
- An AWS account (for Lambda + DynamoDB)
- A GitHub account (for deploying builds)
- An Anthropic or OpenAI API key

Then deploy:

```bash
./deploy-aws.sh    # Sets up AWS infrastructure
node poller/poll-and-reply.mjs   # Start listening for tweets
```

See [full setup docs](docs/) for details.

## API

### Builds API

```
GET https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com/api/builds
```

Returns all builds with metadata, status, and timestamps.

### Data API

Per-app key-value storage, namespaced by app ID:

```
GET    /api/data/:namespace/:key
PUT    /api/data/:namespace/:key    { "value": ... }
DELETE /api/data/:namespace/:key
```

Apps use this automatically for persistent data (todos, scores, notes, etc).

## Beta Limitations

- **10 builds per user per day** (free tier)
- All source code is **public** (deployed to GitHub Pages)
- Databases may be **wiped** during beta
- No auth/security guarantees yet
- HTML/JS/CSS only (more languages coming)

See [Terms of Service](docs/TOS.md) for full details.

## Multi-Model Support

Singularity Engine supports multiple AI models for code generation:

| Model | Env Var | Provider |
|-------|---------|----------|
| `claude` (default) | `ANTHROPIC_API_KEY` | Anthropic Claude Sonnet |
| `grok` | `GROK_API_KEY` | xAI Grok-3 |
| `gpt` | `OPENAI_API_KEY` | OpenAI GPT-4o |

Set the `MODEL` env var on the code runner Lambda to change the default, or pass `model` in the build request payload.

## Build Iteration

Reply to a build result tweet to iterate on your app! Instead of starting from scratch, Singularity Engine will fetch your existing code and apply the requested changes.

```
You: @SingularityEngn build me a todo app
Bot: Done! ✨ https://...

You (replying to bot): @SingularityEngn make it dark mode with animations
Bot: Done! ✨ https://... (same app, updated)
```

## Documentation

- [Terms of Service](docs/TOS.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture Roadmap](docs/ARCHITECTURE-ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## Built by [@metatransformr](https://x.com/metatransformr)

MIT — You retain full rights to any apps you build.
