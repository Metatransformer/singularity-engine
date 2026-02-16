# Architecture Roadmap

> Singularity Engine — from tweet-to-app pipeline to full autonomous build platform.

## Current Architecture (v1)

```
[X/Twitter] → tweet-watcher → code-runner (Claude) → deployer (GitHub Pages) → reply
                                    ↓                      ↓
                              SingularityDB          _builds / _showcase / _source
                              (DynamoDB)
```

- **Single DynamoDB table** (`singularity-db`) with namespace partitioning
- **4 Lambda functions**: tweet-watcher, code-runner, deployer, db-api
- **EventBridge** polls X every 2 minutes
- **API Gateway v2** serves public builds API + SingularityDB key-value store
- **GitHub Pages** hosts deployed apps as static HTML

---

## 1. DB Isolation

### Now: Namespace Partitioning
All data lives in one DynamoDB table with logical namespaces:
- `_builds` — Build metadata (private)
- `_showcase` — Public gallery data (no source code)
- `_source` — HTML source files (private, separate from public data)
- `_system` — Internal state (last processed tweet, etc.)
- `_reply_queue` — Pending replies
- `_rate_limits` — Per-user daily build counts
- `_rejected` — Abuse logs
- User namespaces — Per-app key-value data (SingularityDB)

### Future: Per-App Isolated Storage
- Each generated app gets its own walled-off database namespace
- Migration path: DynamoDB → MongoDB (per-app collections) or Supabase (per-app schemas with RLS)
- App data cannot leak between namespaces
- Admin API for managing app storage quotas

### Future: Multi-Tenant Database
- Dedicated Mongo/Supabase instance per high-value client
- Connection pooling and resource isolation
- Automated provisioning via infrastructure-as-code

---

## 2. Auth Per App

### Roadmap
1. **Phase 1**: Anonymous access (current) — apps use SingularityDB without auth
2. **Phase 2**: API key per app — generated at build time, stored in `_system`
3. **Phase 3**: User auth in generated apps — Supabase Auth integration
   - Login/signup flows injected into generated HTML
   - Row-level security on per-app data
   - OAuth providers (Google, GitHub, X)
4. **Phase 4**: App ownership — users can claim and manage their builds
   - Transfer ownership, delete apps, set visibility
   - Rate limits tied to authenticated users instead of Twitter usernames

---

## 3. Multi-Channel Architecture

### Channel Interface (implemented)
```
shared/channels/base.mjs    — Abstract BaseChannel class
shared/channels/x-twitter.mjs — X/Twitter implementation
```

Every channel implements:
- `pollForRequests()` — Receive triggers from the platform
- `sendReply(request, result)` — Send build result back
- `formatReply(request, result)` — Platform-specific reply formatting

### Planned Channels

| Channel | Trigger | Reply | Status |
|---------|---------|-------|--------|
| **X/Twitter** | Tweet with keyword | Tweet reply with link | Live |
| **API** | POST /api/build | JSON response | Planned |
| **OpenClaw Skills** | Skill invocation | Skill response | Planned |
| **Mesh** | Mesh message | Mesh response | Planned |
| **Discord** | Bot command | Embed with link | Planned |
| **Slack** | Slash command | Block Kit message | Planned |
| **Dashboard** | Web form | Live preview | Planned |

### API Channel Design
```
POST /api/build
{
  "query": "a tetris game",
  "username": "api-user",
  "webhook_url": "https://..."  // optional callback
}

Response:
{
  "build_id": "...",
  "status": "building",
  "poll_url": "/api/build/:id/status"
}
```

---

## 4. K8s / Non-AWS Deployment

### Current: AWS-Native
- Lambda functions with EventBridge triggers
- API Gateway v2 for HTTP routing
- DynamoDB for storage

### Phase 1: Containerize Lambdas
- Each Lambda already has a clean handler export
- Wrap in Express/Fastify server for container deployment
- Docker Compose for local development
- Single `docker-compose up` to run the full pipeline locally

### Phase 2: Abstract Cloud Provider
- Infrastructure adapter layer:
  ```
  shared/infra/aws.mjs     — Current AWS implementation
  shared/infra/k8s.mjs     — Kubernetes (any cloud)
  shared/infra/docker.mjs  — Docker Compose (local dev)
  ```
- Storage adapter: DynamoDB → MongoDB → Postgres
- Queue adapter: EventBridge → Redis/BullMQ → RabbitMQ
- Object storage: GitHub Pages → S3 → GCS → R2

### Phase 3: Kubernetes Deployment
- Helm chart for full platform deployment
- Horizontal pod autoscaling for code-runner (CPU-bound)
- Ingress controller for API routing
- Persistent volumes for build artifacts
- Secrets management (Vault/AWS Secrets Manager)

### Phase 4: Self-Hosted Distribution
- One-command deploy: `singularityengine deploy --target k8s`
- Support: AWS EKS, GKE, AKS, DigitalOcean, bare metal
- Embedded database option (SQLite) for single-node deployments

---

## 5. Dashboard

### Admin Dashboard Features
- **Build Gallery**: Browse all builds with search, filter by channel/score/date
- **Source Viewer**: View/download HTML source for any build
- **Build Triggers**: Manually trigger builds via web form
- **Analytics**: Build counts, channel distribution, popular queries
- **User Management**: View builders, rate limits, abuse logs
- **Configuration**: Update trigger keywords, watched tweets, channel settings
- **Monitoring**: Lambda invocation logs, error rates, latency

### Tech Stack (Proposed)
- Next.js App Router (SSR + API routes)
- Tailwind CSS + shadcn/ui
- Auth: Supabase Auth or NextAuth.js
- Charts: Recharts or Tremor
- Real-time: SSE or polling for live build status

---

## 6. Security

### Current Protections
- Input sanitization via vard + custom regex patterns
- CSP meta tag injection (restricts fetch to API Gateway only)
- Security scanner on generated HTML (blocks eval, Function, etc.)
- Protected DynamoDB namespaces (no public writes to `_system`, `_builds`, etc.)
- Rate limiting (2 builds/user/day)
- Value size limits (100KB max per key)

### Roadmap

#### Prompt Hardening
- Adversarial prompt testing suite (red team the code-runner prompt)
- Output validation: verify HTML structure, check for injection patterns
- Sandboxed execution: run generated code in isolated iframe with CSP
- Token budget enforcement: cap Claude API usage per build

#### Supply Chain Audit
- Lock all dependencies to exact versions
- Automated `npm audit` in CI
- SBOM (Software Bill of Materials) generation
- No CDN/external imports in generated apps (already enforced)

#### NPM Package Verification
- Verify package integrity with `npm integrity` checksums
- Pin transitive dependencies
- Automated PR checks for dependency updates (Dependabot/Renovate)

#### Infrastructure Security
- Lambda function URLs with IAM auth (not public)
- API Gateway request throttling (global + per-IP)
- DynamoDB encryption at rest (enabled by default)
- CloudWatch alarms for anomalous invocation patterns
- VPC isolation for Lambda functions (if needed)

#### Abuse Prevention
- ML-based content classification for build requests
- Image/canvas content scanning for generated apps
- Phishing detection (generated apps mimicking login pages)
- Escalating rate limits (exponential backoff for repeated abuse)

---

## 7. Architectural Audit Checklist

### Pre-Launch
- [x] DB schema separation (public builds vs private source)
- [x] Channel interface abstraction
- [x] Configurable bot account + trigger keyword
- [x] Protected namespace enforcement
- [x] Input sanitization (vard + custom patterns)
- [x] CSP injection in generated apps
- [x] Rate limiting per user
- [ ] Integration tests against live API after deploy
- [ ] Load test: concurrent build requests
- [ ] Error budget monitoring (acceptable failure rate)

### Post-Launch
- [ ] Add API channel (POST /api/build)
- [ ] Dashboard v1 (build gallery + manual triggers)
- [ ] Per-app API keys for SingularityDB access
- [ ] Containerize for local development
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Automated dependency audits
- [ ] Adversarial prompt testing
- [ ] Multi-region deployment

### Scale Milestones
- [ ] 100 builds/day: Current architecture handles this
- [ ] 1,000 builds/day: Need async build queue (SQS/BullMQ)
- [ ] 10,000 builds/day: Need horizontal scaling, build caching
- [ ] 100,000 builds/day: Need dedicated infrastructure, CDN for builds
