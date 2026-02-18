# Environment Variables

## Model Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MODEL` | AI model to use: `claude`, `grok`, `gpt` | `claude` |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude builds) | — |
| `GROK_API_KEY` | xAI API key (for Grok builds) | — |
| `OPENAI_API_KEY` | OpenAI API key (for GPT builds) | — |

## Tweet Watcher

| Variable | Description | Default |
|----------|-------------|---------|
| `X_BEARER_TOKEN` | X/Twitter API Bearer token | — |
| `WATCHED_TWEET_IDS` | Comma-separated tweet IDs to watch for replies | — |
| `WATCHED_TWEET_ID` | (Legacy) Single watched tweet ID | — |
| `OWNER_USERNAME` | Bot owner's X username | `metatransformr` |
| `X_BOT_USERNAMES` | Comma-separated bot usernames (skipped to avoid self-reply) | `singularityengn` |
| `TRIGGER_KEYWORD` | Keyword that triggers builds | `singularityengine.ai` |
| `TABLE_NAME` | DynamoDB table name | `singularity-db` |
| `CODE_RUNNER_FUNCTION` | Code runner Lambda function name | `singularity-code-runner` |
| `DEPLOYER_FUNCTION` | Deployer Lambda function name | `singularity-deployer` |

## Code Runner

| Variable | Description | Default |
|----------|-------------|---------|
| `BUILD_REQUEST` | Build request text (Docker entrypoint mode) | — |
| `APP_ID` | App namespace ID | `app-{timestamp}` |
| `BUILD_ENGINE` | Build engine identifier | `default` |
| `EXISTING_CODE` | Existing HTML for iteration mode (Docker entrypoint) | — |
| `SINGULARITY_DB_URL` | SingularityDB API endpoint | (from prompts.mjs) |

## Deployer

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub personal access token | — |
| `GITHUB_REPO` | GitHub repo for deployments | `Metatransformer/singularity-builds` |
| `GITHUB_PAGES_URL` | Base URL for GitHub Pages | `https://your-org.github.io/singularity-builds` |
| `REPLY_MODE` | How to post replies: `openclaw`, `x-api` | `openclaw` |
| `X_CONSUMER_KEY` | X API consumer key (for direct replies) | — |
| `X_CONSUMER_SECRET` | X API consumer secret | — |
| `X_ACCESS_TOKEN` | X API access token | — |
| `X_ACCESS_TOKEN_SECRET` | X API access token secret | — |

## DB API

| Variable | Description | Default |
|----------|-------------|---------|
| `TABLE_NAME` | DynamoDB table name | `singularity-db` |
