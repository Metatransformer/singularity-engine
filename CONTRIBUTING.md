# Contributing to Singularity Engine

Thanks for your interest in contributing! This guide covers setup, testing, and deployment so you can start building quickly.

## Prerequisites

- **Node.js** v20+
- **AWS CLI** configured with credentials (`aws configure`)
- **GitHub CLI** (`gh auth login`)
- An **Anthropic API key** (for code generation)

## Quick Setup

```bash
git clone https://github.com/Metatransformer/singularity-engine.git
cd singularity-engine
npm install
cp .env.example .env  # Fill in your keys
```

Or use the interactive wizard:

```bash
node bin/cli.mjs config
```

## Project Structure

```
aws/
  code-runner/run.mjs     # Claude generates HTML apps
  deployer/index.mjs      # Pushes to GitHub Pages, queues replies
  tweet-watcher/index.mjs # Polls X API for build requests
  db-api/index.mjs        # REST API for SingularityDB (key-value store)
shared/
  prompts.mjs             # System prompts for Claude
  security.mjs            # Input sanitization, output scanning
  x-api-client.mjs        # OAuth 1.0a X API client
bin/
  cli.mjs                 # CLI tool (config, deploy, status, etc.)
tests/
  *.unit.test.mjs         # Unit tests (mocked, fast)
  *.integration.test.mjs  # Integration tests (hit live API)
```

## Running Tests

```bash
# All tests (unit + integration)
npm test

# Unit tests only (fast, no network)
npm run test:unit

# Integration tests only (hits live API — needs SINGULARITY_DB_URL in .env)
npm run test:integration
```

Tests use [Vitest](https://vitest.dev/). Integration tests run against the live API Gateway endpoint.

## Making Changes

### Code Changes

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `npm run test:unit` to verify nothing breaks
4. If you changed Lambda logic, run `npm test` (full suite including integration)
5. Commit with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` new feature
   - `fix:` bug fix
   - `test:` new or updated tests
   - `docs:` documentation
   - `chore:` maintenance

### Deploying Lambda Changes

Use the CLI:

```bash
node bin/cli.mjs deploy
```

Or deploy individual functions using the legacy script:

```bash
./deploy-aws.sh
```

The CLI deploy command handles:
- DynamoDB table creation
- IAM role setup
- Lambda packaging with shared modules
- EventBridge schedule for tweet polling
- API Gateway for SingularityDB

### Key Gotchas

1. **SingularityDB client injection**: The code-runner auto-injects the `SingularityDB` class into generated HTML. Claude should NOT define its own — the prompt tells it to use the global `db` variable.

2. **Shared modules in Lambdas**: The deployer and code-runner need `includeShared: true` when packaging. The db-api does NOT need shared modules.

3. **Import path rewriting**: Lambda packages rewrite `../../shared/` to `./shared/` during bundling.

4. **Protected namespaces**: Any namespace starting with `_` is read-only via the public API. Only Lambdas with direct DynamoDB access can write to them.

5. **API response format**: `GET /api/data/:ns/:key` returns the raw value, not `{value: ...}`. The old double-wrapped format is auto-unwrapped.

## Security

The system has multiple defense layers:

- **Input**: [vard](https://www.npmjs.com/package/@andersmyrmel/vard) for prompt injection detection + custom content policy patterns
- **Output**: `scanGeneratedCode()` checks generated HTML for dangerous patterns
- **Runtime**: Content Security Policy (CSP) meta tag restricts network access in deployed apps

If you find a security issue, please report it privately rather than opening a public issue.

## Testing Checklist

Before submitting a PR:

- [ ] `npm run test:unit` passes
- [ ] `npm test` passes (if you changed Lambda/API logic)
- [ ] No new security patterns flagged by `scanGeneratedCode()`
- [ ] Protected namespaces still blocked from public writes
- [ ] If you changed prompts: verify generated apps use `db` variable correctly

## Architecture

```
Tweet/Web Request
  → tweet-watcher (polls X API every 2 min)
  → sanitizeBuildRequest() (input validation)
  → code-runner (Claude generates HTML)
  → scanGeneratedCode() (output validation)
  → deployer (GitHub Pages + reply queue)
  → SingularityDB API (key-value persistence for apps)
```

## Questions?

Open an issue on GitHub or reach out to the maintainers.
