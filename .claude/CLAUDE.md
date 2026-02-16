# Singularity Engine — Claude Code Rules

## Architecture Overview

Single-pipeline system: Tweet/web request → code-runner (Claude) → deployer (GitHub Pages) → reply
- **DynamoDB table**: `singularity-db` (partition: `ns`, sort: `key`)
- **API Gateway**: HTTP API v2 at `https://8mag3jdi5f.execute-api.us-east-1.amazonaws.com`
- **Lambdas**: code-runner, deployer, tweet-watcher, db-api (web-builder not deployed)

## Data Layer Rules

### SingularityDB Client Injection
- The SingularityDB client is **auto-injected** by the code-runner Lambda, not by Claude
- `buildSingularityDBScript(apiUrl, namespace)` generates the `<script>` block
- The code-runner strips any SingularityDB class Claude generates and injects the real one
- The prompt tells Claude to use the global `db` variable — never create its own instance

### API Response Format
- `GET /api/data/:ns/:key` returns the raw value (not wrapped in `{value: ...}`)
- `PUT /api/data/:ns/:key` expects `{value: v}` body, stores `v` directly
- `GET /api/data/:ns` returns `[{key, value, updatedAt}]` with unwrapped values
- `DELETE /api/data/:ns/:key` removes the key
- Old double-wrapped values (`{value: {value: actual}}`) are auto-unwrapped via `unwrapValue()`

### Protected Namespaces
- `_system`, `_builds`, `_reply_queue`, `_showcase`, `_rejected`, `_rate_limits` — blocked from public writes
- Any namespace starting with `_` is reserved

## Deploy Rules

### Lambda Deployment
- Use the CLI: `node bin/cli.mjs deploy`
- Or deploy individual Lambdas via AWS CLI (see deploy patterns below)
- **deployer Lambda** requires `includeShared: true` (needs x-api-client.mjs)
- **code-runner Lambda** requires `includeShared: true` (needs prompts.mjs + security.mjs)
- **db-api Lambda** does NOT need shared modules
- Import path fix: `../../shared/` → `./shared/` in Lambda packages

### Pre-Deploy Verification
1. Run unit tests: `npm run test:unit`
2. Run integration tests: `npm run test:integration`
3. Deploy Lambda
4. Wait 5 seconds for Lambda to stabilize
5. Re-run integration tests against live API
6. Verify a test build if code-runner changed

## Testing

- **Unit tests**: `tests/db-api.unit.test.mjs` — mock DynamoDB, test handler logic
- **Integration tests**: `tests/db-api.integration.test.mjs` — hit live API, full data lifecycle
- Run all: `npm test`
- Always test data round-trips: PUT → GET → LIST → DELETE → verify 404

## Common Pitfalls

1. **Don't trust Claude to copy URLs** — it rewrites SingularityDB classes with wrong/placeholder URLs. Always auto-inject.
2. **cors() must JSON.stringify all values** — raw strings break `r.json()` in browsers
3. **API Gateway v2 handles CORS** at the gateway level — Lambda CORS headers may not appear in responses but CORS still works
4. **base64 bodies** — API Gateway v2 may base64-encode request bodies. Always check `event.isBase64Encoded`
5. **Deployer needs shared modules** — the `includeShared` flag in CLI deploy must be `true` for deployer
6. **Import name mismatch** — deployer imports `postReply as xApiPostReply` from x-api-client.mjs
