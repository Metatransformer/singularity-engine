# Singularity Engine — Architecture Roadmap

**Last updated:** February 16, 2026  
**Status:** Living document — updated as architecture evolves

---

## Current Architecture (v0.1 — Launch)

```
                    ┌─────────────────┐
                    │   X / Twitter    │  ← Channel #1
                    └────────┬────────┘
                             │ poll (2 min)
                    ┌────────▼────────┐
                    │  Tweet Watcher   │  Lambda (300s)
                    │  - trigger detect│
                    │  - rate limit    │
                    │  - sanitize      │
                    └────────┬────────┘
                             │ invoke
                    ┌────────▼────────┐
                    │   Code Runner    │  Lambda (180s, 512MB)
                    │  - Claude Sonnet │
                    │  - HTML gen      │
                    │  - DB injection  │
                    │  - security scan │
                    └────────┬────────┘
                             │ invoke
                    ┌────────▼────────┐
                    │    Deployer      │  Lambda (30s)
                    │  - GitHub Pages  │
                    │  - DynamoDB log  │
                    │  - X API reply   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        GitHub Pages    DynamoDB      X API Reply
        (hosting)     (build log)    (user notification)
```

**Single DynamoDB table** (`singularity-db`) with namespace/key schema:
- `_builds` — build metadata (public)
- `_showcase` — curated gallery data (public)
- `_source` — raw HTML source (private, planned)
- `_reply_queue` — pending X replies (internal)
- `_rate_limits` — per-user daily limits (internal)
- `_rejected` — blocked/failed builds (internal)
- `_system` — system state (internal)
- `{app-id}` — per-app user data (public read/write)

---

## A1: Full Architectural Audit

### Current Strengths
- Clean Lambda separation (single responsibility per function)
- Security scanner catches common injection patterns
- SingularityDB client auto-injected (not AI-generated)
- CSP headers restrict runtime fetch to API Gateway only
- Rate limiting per user per day

### Known Gaps
- No input validation on Data API beyond namespace protection
- No request signing or API authentication
- No build queue (concurrent builds could collide on GitHub API)
- No retry logic on Lambda invocations
- No dead letter queue for failed builds
- Deployer timeout (30s) may be tight for GitHub API under load

### Recommended Actions
1. Add API Gateway request validation (JSON schema)
2. Implement SQS queue between tweet-watcher and code-runner for backpressure
3. Add DLQ for failed code-runner invocations
4. Implement idempotency keys on deployer writes
5. Add CloudWatch alarms for error rates and latency

---

## A2: Prompt Hardening & Security

### Current State
- Custom `security.mjs` scanner checks for: eval(), Function(), fetch to non-API URLs, script injection, iframe, innerHTML patterns
- SingularityDB class stripping prevents AI from generating its own DB client
- CSP meta tag injected into all generated apps

### Roadmap
1. **Adopt OWASP LLM Top 10** as security framework
2. **Prompt injection defense**: Add instruction hierarchy markers, output format validation
3. **Output sandboxing**: Consider iframe sandbox attributes on GitHub Pages
4. **Content policy**: Define what SE will/won't build (no auth flows, no crypto wallets, no data exfiltration)
5. **Evaluate vetted tools**: Consider integrating Rebuff (prompt injection detection) or similar

---

## A3: Supply Chain Audit

### Current Dependencies
- `@anthropic-ai/sdk` — Anthropic's official SDK (trusted)
- `@aws-sdk/*` — AWS official SDKs (trusted)
- `dotenv` — env loading (widely used, low risk)
- `vitest` — test runner (dev only)
- `oauth-1.0a` + `crypto` — X API signing (small surface)

### Recommended Actions
1. Run `npm audit` and fix any vulnerabilities
2. Pin exact versions in package-lock.json (already done)
3. Add `npm audit` to CI pipeline
4. Consider `socket.dev` or `snyk` for ongoing monitoring
5. Minimize transitive dependencies

---

## A4: Database Isolation Architecture

### Current Model
All apps share one DynamoDB table, isolated by namespace (partition key). Any app can read/write any non-protected namespace if they know the name.

### Short-term (v0.2)
- **Namespace scoping**: Apps can only write to their own namespace (enforced by API Gateway authorizer or Lambda logic)
- **Read isolation**: Apps get a scoped API URL that only allows access to their namespace
- **Source separation**: Raw HTML stored in `_source` namespace, not exposed via public API

### Medium-term (v0.3)
- **Per-app API keys**: Generated at build time, scoped to single namespace
- **Rate limiting per namespace**: Prevent abuse of data API
- **TTL on data**: Auto-expire old app data (configurable)

### Long-term (v1.0) — Full Isolation Options

| Option | Pros | Cons |
|---|---|---|
| **DynamoDB + strict namespace scoping** | Zero provisioning, scales infinitely, pay-per-request | Shared table, blast radius if table throttled |
| **DynamoDB per-app table** | Full isolation | Provisioning overhead, 2500 table limit per account |
| **Supabase per-app project** | Full Postgres, auth built-in, realtime | Provisioning required, cost per project, API to manage |
| **MongoDB Atlas per-app** | Flexible schema, generous free tier | Provisioning via API, connection management |
| **Cloudflare D1 per-app** | SQLite, edge-local, zero cold start | Limited to Cloudflare ecosystem |
| **Turso per-app** | libSQL (SQLite fork), edge replicas | Newer, smaller community |

**Recommendation:** Stay on DynamoDB with strict namespace scoping for v0.2-0.3. Evaluate Cloudflare D1 or Turso for v1.0 if per-app isolation becomes critical. Both offer programmatic database creation via API with no manual devops.

---

## A5: Auth Architecture

### Current State
No authentication. All apps and APIs are public.

### Roadmap

**Phase 1 — API Keys (v0.2)**
- Generate API key per build at deploy time
- Inject into app as environment variable
- Data API validates key → namespace mapping

**Phase 2 — User Auth in Generated Apps (v0.3)**
- Integrate Supabase Auth or Clerk as auth provider
- Code-runner generates apps with optional auth flows
- Auth state stored per-app, not globally

**Phase 3 — Builder Auth (v1.0)**
- GitHub OAuth for builders (view your builds, manage data)
- Dashboard login for analytics and management
- API tokens for programmatic access

---

## A6: Kubernetes & Off-AWS Portability

### Current State
Tightly coupled to AWS: Lambda, DynamoDB, API Gateway, EventBridge.

### Abstraction Strategy

```
                ┌──────────────────────┐
                │   Platform Adapter    │
                ├──────────────────────┤
                │ AWS Lambda           │  ← current
                │ Docker + K8s         │  ← planned
                │ Cloudflare Workers   │  ← possible
                │ Fly.io               │  ← possible
                └──────────────────────┘
```

**Phase 1 — Containerize (v0.3)**
- Dockerize each Lambda as standalone container
- docker-compose for local development
- Same containers deployable to ECS, Cloud Run, or K8s

**Phase 2 — Abstract Cloud Services (v0.5)**
- `StorageAdapter` interface: DynamoDB, Postgres, D1, Turso
- `DeployAdapter` interface: GitHub Pages, Cloudflare Pages, Vercel, S3
- `QueueAdapter` interface: SQS, Redis, BullMQ
- `SchedulerAdapter` interface: EventBridge, cron, BullMQ

**Phase 3 — Helm Chart (v1.0)**
- `helm install singularity-engine` on any K8s cluster
- Configurable backends via values.yaml
- Auto-scaling based on build queue depth

---

## A7: Multi-Channel Architecture

### Pluggable Channel Interface

```javascript
// shared/channels/base.mjs
export class Channel {
  async listen()          {} // Start receiving triggers
  async reply(buildResult){} // Send result back to user
  get name()              {} // Channel identifier
}
```

### Planned Channels

| Channel | Trigger | Reply | Priority |
|---|---|---|---|
| **X / Twitter** | Keyword in tweet/reply | X API reply | ✅ Launch |
| **Web API** | POST /api/build | JSON response | v0.2 |
| **OpenClaw Skill** | Agent invocation | Agent message | v0.3 |
| **The Mesh** | In-world command | In-world deploy | v0.5 |
| **Discord** | Bot command | Channel message | v0.3 |
| **Telegram** | Bot command | Chat message | v0.3 |
| **Dashboard** | UI form | UI update | v0.4 |
| **CLI** | Terminal command | Terminal output | v0.2 |

### Architecture
```
Channel Adapter → Normalize to {query, username, channel, reply_to}
    ↓
Build Pipeline (channel-agnostic)
    ↓
Channel Adapter ← Send result via channel-specific reply
```

---

## A8: Dashboard Architecture

### Planned Features

**Builder Dashboard (v0.4)**
- View all your builds (filter by date, status, channel)
- Fork/remix existing builds
- View build source code
- Re-deploy or delete builds
- Usage analytics (builds/day, data usage)

**Admin Dashboard (v0.5)**
- All builds across all users
- Moderation tools (flag, remove builds)
- System health (Lambda metrics, DynamoDB capacity, error rates)
- Cost tracking (API calls, storage, compute)

**Tech Stack Options**
- Next.js + Supabase Auth (matches SMBCP stack)
- Remix + Cloudflare (edge-first)
- Plain React + API Gateway (minimal)

**Recommendation:** Next.js deployed on Vercel, using the existing builds API. Auth via GitHub OAuth. Start simple — build list + detail view + fork button.

---

## Priority Matrix

| Item | Launch | v0.2 | v0.3 | v0.5 | v1.0 |
|---|---|---|---|---|---|
| X/Twitter channel | ✅ | | | | |
| DynamoDB namespace isolation | | ✅ | | | |
| Source file separation | | ✅ | | | |
| Web API channel | | ✅ | | | |
| CLI channel | | ✅ | | | |
| Per-app API keys | | | ✅ | | |
| Discord/Telegram channels | | | ✅ | | |
| OpenClaw Skill channel | | | ✅ | | |
| Docker containers | | | ✅ | | |
| Builder dashboard | | | | ✅ | |
| Mesh integration | | | | ✅ | |
| K8s Helm chart | | | | | ✅ |
| Full DB isolation | | | | | ✅ |
| User auth in apps | | | ✅ | | |

---

*This roadmap is version-controlled. Updates committed with change history.*
