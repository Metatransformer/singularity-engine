# Detailed Setup Guide

This guide walks through every prerequisite and configuration step in detail.

## Prerequisites

### 1. Node.js v20+

```bash
node --version  # Must be v20 or higher
```

Install via [nvm](https://github.com/nvm-sh/nvm) if needed:
```bash
nvm install 20
nvm use 20
```

### 2. AWS Account & CLI

You need an AWS account with programmatic access configured.

```bash
# Install AWS CLI
brew install awscli  # macOS
# or: curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && unzip awscliv2.zip && sudo ./aws/install

# Configure credentials
aws configure
# Enter: Access Key ID, Secret Access Key, Region (us-east-1), Output format (json)
```

**IAM Permissions Required:**

Your AWS user/role needs these permissions (or use AdministratorAccess for simplicity):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "iam:CreateRole", "iam:GetRole", "iam:AttachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRole", "iam:DeleteRolePolicy", "iam:DetachRolePolicy",
        "dynamodb:CreateTable", "dynamodb:DescribeTable", "dynamodb:DeleteTable",
        "events:PutRule", "events:PutTargets", "events:EnableRule", "events:DisableRule", "events:DescribeRule", "events:RemoveTargets", "events:DeleteRule",
        "apigateway:*",
        "sts:GetCallerIdentity",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

**Recommended region:** `us-east-1` (best Lambda cold start times, all services available).

### 3. X (Twitter) API

You need a **Twitter Developer account** with a project and app.

1. Go to [developer.x.com](https://developer.x.com)
2. Sign up for a developer account (Free tier works for reading)
3. Create a **Project** and an **App**
4. Under your app's **Keys and Tokens**:
   - Copy the **Bearer Token** (used for searching tweets)

**For reply mode `x-api` (recommended for production):**
5. Under **User authentication settings**, enable:
   - **App permissions:** Read and Write
   - **Type of App:** Web App
   - **Callback URL:** `https://localhost` (not actually used)
6. Generate **Access Token and Secret** (under Keys and Tokens)
7. You'll need all four: Consumer Key, Consumer Secret, Access Token, Access Token Secret

**For reply mode `openclaw`:**
- You only need the Bearer Token (read-only)
- Replies are posted via browser automation

### 4. GitHub Setup

1. **Create a builds repo:**
   - Fork [Metatransformer/singularity-builds](https://github.com/Metatransformer/singularity-builds)
   - Or create a new empty repo (e.g., `your-org/singularity-builds`)

2. **Enable GitHub Pages:**
   - Go to repo → Settings → Pages
   - Source: **Deploy from a branch**
   - Branch: **main**, folder: **/ (root)**
   - Save

3. **Create a Personal Access Token:**
   - Go to [github.com/settings/tokens](https://github.com/settings/tokens)
   - Click **Generate new token (classic)**
   - Scopes needed: `repo` (full control of private repositories)
   - Copy the token

### 5. Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Add billing (Claude API calls cost ~$0.05-0.10 per build)

## Configuration (`singularityengine config`)

The config command walks you through setting up all credentials interactively.

```bash
singularityengine config
```

### What It Asks (Step by Step)

#### 📱 X (Twitter) API
| Prompt | What to Enter |
|--------|--------------|
| Bearer token | Your X API Bearer Token (starts with `AAAA...`) |
| Tweet ID to watch | The numeric ID of the tweet to monitor for replies (from the URL) |
| Your X username | Your handle without @ (e.g., `singularityengine`) |

#### ☁️ AWS
| Prompt | What to Enter |
|--------|--------------|
| Region | AWS region (default: `us-east-1`) |
| DynamoDB table name | Name for the data table (default: `singularity-db`) |

#### 🐙 GitHub
| Prompt | What to Enter |
|--------|--------------|
| Personal access token | Your GitHub PAT with `repo` scope |
| Builds repo | `org/repo-name` (e.g., `Metatransformer/singularity-builds`) |
| GitHub Pages URL | Auto-calculated from repo name |

#### 🤖 Anthropic
| Prompt | What to Enter |
|--------|--------------|
| API key | Your Anthropic API key (starts with `sk-ant-...`) |

#### 🗄️ SingularityDB
| Prompt | What to Enter |
|--------|--------------|
| API Gateway URL | Leave blank — this gets set automatically after `deploy` |

#### 📤 Reply Mode
| Prompt | What to Enter |
|--------|--------------|
| Reply mode | `openclaw` (browser automation) or `x-api` (direct API posting) |

If you chose `x-api`, you'll also be asked for OAuth 1.0a credentials (Consumer Key, Consumer Secret, Access Token, Access Token Secret).

After entering everything, the CLI validates your tokens against the actual APIs and writes a `.env` file.

## Deployment (`singularityengine deploy`)

```bash
singularityengine deploy
# or preview first:
singularityengine deploy --dry-run
```

### What It Creates

1. **DynamoDB Table** (`singularity-db`)
   - Partition key: `ns` (namespace)
   - Sort key: `key`
   - Pay-per-request billing

2. **IAM Role** (`singularity-engine-role`)
   - Trusted by Lambda service
   - Permissions: DynamoDB read/write, Lambda invoke, CloudWatch Logs

3. **Lambda Functions:**
   - `singularity-tweet-watcher` (256MB, 5min timeout) — polls X API
   - `singularity-code-runner` (512MB, 2min timeout) — generates apps via Claude
   - `singularity-deployer` (256MB, 30s timeout) — pushes to GitHub Pages
   - `singularity-db-api` (256MB, 10s timeout) — public REST API

4. **EventBridge Rule** (`singularity-tweet-poll`)
   - Triggers tweet-watcher every 2 minutes

5. **API Gateway** (`singularity-db-api`)
   - HTTP API with CORS enabled
   - Routes all `/api/*` requests to the db-api Lambda
   - Auto-deploy stage

The deploy command automatically updates your `.env` with the API Gateway URL.

## Post-Deploy Verification

```bash
singularityengine status
```

This checks:
- All config values are set
- All Lambda functions exist and are configured
- EventBridge rule is enabled
- DynamoDB table exists and shows item counts
- Reply queue depth

## Starting the Reply Poller

After deployment, start the local reply poller:

```bash
# Using X API v2 (fast)
REPLY_MODE=x-api node poller/poll-and-reply.mjs

# Using OpenClaw browser (requires OpenClaw running)
REPLY_MODE=openclaw node poller/poll-and-reply.mjs

# Run once (check queue and exit)
node poller/poll-and-reply.mjs --once
```

## Troubleshooting

### "AWS credentials not configured"
Run `aws configure` and enter your Access Key ID and Secret Access Key.

### "X API error 401"
Your Bearer Token is invalid or expired. Regenerate it at developer.x.com.

### "X API error 429"
Rate limited. The Free tier allows 500K tweets/month read. Wait and try again.

### "GitHub API error 404"
Either the repo doesn't exist or your PAT doesn't have `repo` scope. Check both.

### "GitHub API error 409"
The file already exists at that path. This happens if you rebuild the same app ID. The deployer should handle this automatically.

### Lambda timeout
The code-runner has a 120s timeout. If Claude takes too long, increase it in the Lambda console or redeploy.

### "No new replies" but tweets exist
Check that `WATCHED_TWEET_ID` is correct and that tweets contain the keyword "singularityengine" (case-insensitive).

### EventBridge not triggering
Run `singularityengine start` to ensure the rule is enabled. Check CloudWatch Logs for the tweet-watcher Lambda for errors.

### Reply poller can't connect to DynamoDB
Make sure `SINGULARITY_DB_URL` in your `.env` is set (it should be after `deploy`). Test with:
```bash
curl "$(grep SINGULARITY_DB_URL .env | cut -d= -f2-)/_showcase"
```
