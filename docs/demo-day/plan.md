# Singularity Engine — Work Plan (Feb 16, 2026)

---

## Part 1: End-to-End Pipeline Test & Build Tracking DB

| # | Task | Details | Status |
|---|------|---------|--------|
| 1.1 | **Stub Input Test (No Twitter)** | Run a non-X input query through the full AWS pipeline. Bypass Twitter entirely — use a stubbed/mock trigger to invoke the build process end-to-end. | 🔲 |
| 1.2 | **Output Delivery** | Upload final deliverable to AWS (S3 or equivalent). Return a direct URL where the output can be verified (e.g., public S3 link or presigned URL). | 🔲 |
| 1.3 | **DynamoDB Build Tracker** | Create a `builds` table that tracks: **build ID**, **channel** (Twitter, API, etc.), **username/URL** of requester, **timestamp**, **deliverable deployment URL**. ⚠️ Do NOT store project file links in this table. | 🔲 |
| 1.4 | **Separate Project Files Collection** | Store raw project files (non-compiled) in a **private/hidden collection** (separate DynamoDB table or S3 bucket). Linkable by build ID for internal lookup only. | 🔲 |
| 1.5 | **Two Artifact Types** | Ensure the system distinguishes: **(a)** project source files (private) and **(b)** compiled/deployed deliverable (public, stored in builds table). | 🔲 |
| 1.6 | **singularityengine.ai API Update** | Update the website API to read from the new DynamoDB builds table. Serve delivered results/builds at new deliverable URLs. Confirm DB-backed builds are working E2E. | 🔲 |

---

## Part 2: Twitter / X E2E Integration & Pluggable Channel Architecture

| # | Task | Details | Status |
|---|------|---------|--------|
| 2.1 | **Direct Tweet Test** | Provide a ready-to-send tweet `@metatransformr` with the trigger keyword to test the full E2E flow (Twitter → AWS pipeline → deliverable). | 🔲 |
| 2.2 | **Bot Account Prep (Demo)** | Architect for using a **dedicated bot account** instead of `@metatransformr`. In that case, the trigger keyword simplifies to just `"build me"`. | 🔲 |
| 2.3 | **Configurable Trigger via CLI** | Make both the **keyword** and the **target account** configurable via CLI flags. Must include ownership verification of the account. | 🔲 |
| 2.4 | **Two Trigger Modes** | Support: **(a)** Direct `@mention` with keyword, and **(b)** keyword detected in watched threads that `@singularityengine` monitors. | 🔲 |
| 2.5 | **Pluggable Channel Interface** | Twitter/X is the **first plug**. Abstract the input channel so future channels (OpenClaw, Mesh, messaging apps, dashboard) can be swapped in via the same interface contract. | 🔲 |

---

## Second Priority: Architecture Commits & Roadmap

> *Can be done tonight if needed. Most is out of launch scope but should be committed to docs/roadmap in the `singularity-engine` repo.*

| # | Architectural TODO | Notes |
|---|-------------------|-------|
| A1 | **Full Architectural Audit** | Best practices review of the entire singularity-engine codebase. |
| A2 | **Prompt Hardening / Security** | Harden all LLM prompts. Use vetted off-the-shelf security tooling. |
| A3 | **Supply Chain Audit** | Check for invalid/insecure npm packages. Validate dependency tree. |
| A4 | **Database Isolation Architecture** | Design how to wall off DynamoDB (or alternative) per-app/per-client. Evaluate: Mongo, Supabase (walled per client) vs. DynamoDB partitioning. Goal: no manual devops provisioning. |
| A5 | **Auth Architecture** | Design per-app authentication layer across all services. |
| A6 | **K8s / Automated Deployment** | Architect for Kubernetes or equivalent. Plan for off-AWS portability. |
| A7 | **Multi-Channel Architecture** | Design for: Twitter, OpenClaw Skills, Mesh direct integration, messaging apps (Telegram, Discord, etc.), Dashboard. |
| A8 | **Dashboard Architecture** | Design admin/user dashboard for build management, monitoring, analytics. |

---

### Key Principles

| Principle | Description |
|-----------|-------------|
| **DB-Backed Builds** | Every build tracked in DynamoDB with full provenance. Public deliverable ≠ private source. |
| **Pluggable Channels** | Twitter is channel #1, but the interface is generic. New channels = new plugs, same pipeline. |
| **Configurable Triggers** | Keyword + account configurable via CLI. Ownership verification required. |
| **Launch vs. Roadmap** | Part 1 + Part 2 = launch scope. Architecture TODOs = committed to roadmap, built later. |
