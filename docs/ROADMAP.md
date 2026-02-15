# Singularity Engine — Feature Roadmap

## ✅ V1 (Shipped — Launch Ready)
- [x] Tweet-to-app pipeline (tweet watcher → code runner → deployer → reply)
- [x] X API OAuth replies (deployer posts directly)
- [x] Multi-thread watching (comma-separated WATCHED_TWEET_ID)
- [x] SingularityDB (persistent key-value store per app)
- [x] Security: vard prompt injection, input sanitization, CSP injection, code scanning
- [x] Rate limiting (2 builds/user/day)
- [x] CLI tool (config, deploy, watch, status, start, stop)
- [x] Builds API (GET /api/builds with sort/search/pagination)
- [x] singularityengine.ai landing page (live builds gallery)
- [x] Improved prompts (dark theme, animations, watermark, game audio)
- [x] Web build API (POST /api/build — website-triggered builds)

## 🔥 V1.1 — Launch Week (This Week)
- [ ] **Build from website** — Add a build input on singularityengine.ai that calls POST /api/build. Real-time progress spinner → live link when done. No Twitter needed.
- [ ] **Build preview/iframe** — Embed each build as a live iframe thumbnail in the gallery (not just a link)
- [ ] **Social sharing** — OG meta tags per build page (`/apps/:id/` gets its own `<meta>` with screenshot). "Built with Singularity Engine" share card.
- [ ] **Deploy web-builder Lambda** — Wire the new Lambda into deploy-aws.sh, add API Gateway route
- [ ] **Showcase page** — `/showcase` with all builds, filterable by score/category/date, infinite scroll
- [ ] **Build status endpoint** — `GET /api/build/:id/status` for polling during async builds
- [ ] **Error recovery** — If code-runner fails, retry once with a simplified prompt

## 🚀 V2 — Growth Engine
- [ ] **Multi-file apps** — Graduate beyond single HTML. Generate `index.html` + `style.css` + `app.js`. Still hosted on GitHub Pages.
- [ ] **App forking** — "Remix this" button. Take any existing build, add a modification prompt, get a new version.
- [ ] **Build threads** — Iterative building. Reply to a build with "now add dark mode" → updates the same app.
- [ ] **Custom domains** — Users can point their own domain at a build (CNAME → GitHub Pages)
- [ ] **Templates** — Pre-built starting points: "SingularityEngine build me a portfolio like template:developer"
- [ ] **User profiles** — `/u/:username` page showing all builds by that X user, total builds, top scores
- [ ] **Leaderboard** — Top builders by count, top apps by coolness score, weekly highlights
- [ ] **Discord integration** — Same pipeline but triggered from Discord messages

## 🧠 V3 — Platform
- [ ] **Accounts + dashboard** — Sign in with X, manage your builds, edit/delete, custom slugs
- [ ] **Build analytics** — View count, unique visitors per app (injected tracking pixel)
- [ ] **AI app upgrades** — Pay to upgrade a build: add backend (Supabase), auth, custom DB
- [ ] **Marketplace** — Browse/install community builds as templates
- [ ] **API for developers** — Authenticated API for programmatic builds (CI/CD integration, Slack bots, etc.)
- [ ] **Multi-model** — Choose Claude, GPT, Gemini as the builder (compare quality)
- [ ] **Collaborative builds** — Multiple people tweet modifications to the same app thread
- [ ] **Plugin system** — SingularityDB extensions: image upload, real-time sync, auth

## 💰 V4 — Monetization
- [ ] **Pro tier** — More builds/day, priority queue, larger apps, custom domains
- [ ] **Sponsored builds** — Brands pay to have "Built with [Brand]" watermark on viral apps
- [ ] **White-label** — Companies deploy their own branded Singularity Engine
- [ ] **Build-to-deploy** — One-click upgrade from GitHub Pages to Vercel/Netlify with real backend

## 🛡️ Ongoing — Security & Infra
- [ ] WAF on API Gateway (DDOS protection)
- [ ] CloudWatch alarms (Lambda errors, throttles, DynamoDB capacity)
- [ ] CORS lockdown (remove wildcard, allowlist known domains)
- [ ] Abuse monitoring dashboard (rejected builds, repeat offenders)
- [ ] Automated build quality checks (lighthouse score, accessibility)
- [ ] Cost monitoring (per-build Anthropic API cost tracking)
