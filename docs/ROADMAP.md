# Singularity Engine — Roadmap

## v0.1 Beta (Current — Experimental) 🧪

**Tweet simple apps into existence.**

This is an early, experimental release. Expect bugs, rough edges, and rapid iteration. You're seeing the machine learn to walk.

**What's in v0.1:**
- Tweet `SingularityEngine build me a <thing>` → AI builds a live web app in ~45 seconds
- Single-page HTML/CSS/JS apps (no frameworks, no external deps)
- Persistent data via SingularityDB (DynamoDB-backed key-value store per app)
- No auth required — open to anyone on X
- Deployed to GitHub Pages via @metatransformr's account
- Server costs fronted by [@metatransformr](https://x.com/metatransformr)
- Rate limited: 2 builds per user per day
- Security: prompt injection detection, code scanning, CSP injection
- Self-hostable — clone the repo and deploy your own in minutes

**Known limitations:**
- Single-file apps only (no multi-file projects yet)
- No user accounts or auth
- Apps may be buggy (AI-generated, not human-reviewed)
- No edit/delete — builds are permanent once deployed
- Rate limits are per-user, not per-app

**Get help:** [Discord](https://discord.gg/clawd) · [GitHub Issues](https://github.com/Metatransformer/singularity-engine/issues)

---

## Post-Launch (v0.2) — Early Roadmap 🛠️

- **Build from website** — Trigger builds directly from singularityengine.ai (no Twitter needed)
- **Live iframe previews** — See apps running inside the gallery, not just links
- **Social share cards** — OG meta tags per build with auto-generated preview images
- **Showcase page** — Browse all builds with filtering, search, and infinite scroll
- **Error recovery** — Auto-retry failed builds with simplified prompts
- **Build status polling** — Real-time progress tracking for in-flight builds

---

## Next (v0.3) — Accounts & Integrations 🔐

- **Auth & accounts** — Sign in with X, manage your builds
- **Dashboard** — Edit, delete, rename, set custom slugs
- **OpenClaw / agent integration** — Let AI agents trigger builds programmatically
- **Multi-model** — Choose Claude, GPT, or Gemini as the builder
- **Plugin system** — Extend SingularityDB with image upload, real-time sync, auth

---

## Ideation (Considering) 💡

These are ideas we're exploring. No commitments — join the conversation to shape what gets built.

- **Platform** — Marketplace for community-built templates, collaborative builds, analytics
- **Monetization** — Pro tier, sponsored builds, white-label, build-to-deploy upgrades
- **The Mesh** — Decentralized agent coordination layer (may ship alongside or under the metatransformer umbrella)
- **Multi-file apps** — Generate full projects (HTML + CSS + JS), not just single files
- **App forking / remixing** — "Remix this" button to iterate on any existing build
- **Build threads** — Reply to a build with "now add dark mode" → updates the same app
- **Custom domains** — Point your own domain at a build
- **Discord / Slack integration** — Same pipeline, different surfaces

**Have an idea?** [Open a GitHub issue](https://github.com/Metatransformer/singularity-engine/issues) or [join our Discord](https://discord.gg/clawd).
