# Singularity Engine — 3-Month Roadmap

> Living document. Updated 2026-02-16. Priorities may shift based on user feedback.

## Month 1: Infrastructure & Monetization Foundation

- [ ] **CloudFront CDN** for deployed apps (faster loads, custom domains later)
- [ ] **S3 private source storage** — move source out of public GitHub Pages
- [ ] **Per-app API keys** for DynamoDB namespace auth (prevent cross-app data access)
- [ ] **Dashboard MVP** — view your builds, source code, build logs
- [ ] **Pay-for-more-builds** system (Stripe integration, default 2 free/day)
- [ ] **Improved error responses** — structured errors from all Lambdas, user-friendly build failure messages

## Month 2: Developer Experience & Scale

- [ ] **Multi-user auth per app** — session-based authentication (not RLS), let apps have their own users
- [ ] **Per-app API deployments** — each app gets its own API endpoint, not just static files
- [ ] **Environment variables** for private projects (secrets, API keys)
- [ ] **Source code minification** option (opt-in)
- [ ] **DynamoDB limitations analysis** — evaluate migration path to DocumentDB or MongoDB Atlas
- [ ] **Multiple programming languages** — Python, Go beyond just HTML/JS/CSS

## Month 3: Platform & Distribution

- [ ] **Multi-channel input** — build apps from Telegram, Discord, OpenClaw skills, Mesh
- [ ] **Kubernetes / off-AWS portability** — Helm chart, run Singularity Engine anywhere
- [ ] **Paid private projects** — source code hidden, private hosting
- [ ] **Multi-shot iterative builds** — reply to refine, iterate on your app in conversation
- [ ] **Full dashboard with analytics** — traffic, usage stats, build history, cost tracking

---

## How to Influence This Roadmap

Tweet [@metatransformr](https://x.com/metatransformr) or open an issue. The loudest feedback wins.
