#!/usr/bin/env node
/**
 * Singularity Engine CLI
 * Usage: singularityengine <command> [options]
 */

import { createInterface } from "readline";
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from "fs";
import { execSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";

// ── ANSI colors ──────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};
const ok = (msg) => console.log(`${c.green}✅ ${msg}${c.reset}`);
const warn = (msg) => console.log(`${c.yellow}⚠️  ${msg}${c.reset}`);
const err = (msg) => console.log(`${c.red}❌ ${msg}${c.reset}`);
const info = (msg) => console.log(`${c.cyan}ℹ️  ${msg}${c.reset}`);
const step = (msg) => console.log(`${c.blue}${msg}${c.reset}`);

// ── Resolve repo root ────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

function ensureRepo() {
  const pkgPath = join(REPO_ROOT, "package.json");
  if (!existsSync(pkgPath)) {
    err("Cannot find singularity-engine repo. Run from within the repo or reinstall.");
    process.exit(1);
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.name !== "singularity-engine") {
      err("This doesn't look like the singularity-engine repo.");
      process.exit(1);
    }
  } catch {
    err("Invalid package.json");
    process.exit(1);
  }
}

// ── .env helpers ─────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = join(REPO_ROOT, ".env");
  const env = {};
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx > 0) {
        env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
      }
    }
  }
  return env;
}

function saveEnv(env) {
  const envPath = join(REPO_ROOT, ".env");
  const content = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";
  writeFileSync(envPath, content);
}

// ── Interactive prompt helper ────────────────────────────────────────────────
function createPrompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, def) =>
    new Promise((resolve) => {
      const prompt = def ? `  ${q} ${c.dim}[${def}]${c.reset}: ` : `  ${q}: `;
      rl.question(prompt, (answer) => resolve(answer.trim() || def || ""));
    });
  const confirm = async (q, def = "N") => {
    const answer = await ask(`${q} (y/N)`, def);
    return answer.toLowerCase() === "y";
  };
  return { rl, ask, confirm };
}

// ── AWS helpers ──────────────────────────────────────────────────────────────
function getAwsClients(env) {
  // Lazy-load AWS SDK to avoid import errors if not installed yet
  return {
    async lambda() {
      const { LambdaClient } = await import("@aws-sdk/client-lambda");
      return new LambdaClient({ region: env.AWS_REGION || "us-east-1" });
    },
    async dynamodb() {
      const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
      return new DynamoDBClient({ region: env.AWS_REGION || "us-east-1" });
    },
    async iam() {
      const { IAMClient } = await import("@aws-sdk/client-iam");
      return new IAMClient({ region: env.AWS_REGION || "us-east-1" });
    },
    async eventbridge() {
      const { EventBridgeClient } = await import("@aws-sdk/client-eventbridge");
      return new EventBridgeClient({ region: env.AWS_REGION || "us-east-1" });
    },
    async sts() {
      const { STSClient } = await import("@aws-sdk/client-sts");
      return new STSClient({ region: env.AWS_REGION || "us-east-1" });
    },
    async apigateway() {
      const { ApiGatewayV2Client } = await import("@aws-sdk/client-apigatewayv2");
      return new ApiGatewayV2Client({ region: env.AWS_REGION || "us-east-1" });
    },
  };
}

// ── Constants ────────────────────────────────────────────────────────────────
const ROLE_NAME = "singularity-engine-role";
const CODE_RUNNER_FN = "singularity-code-runner";
const DEPLOYER_FN = "singularity-deployer";
const WATCHER_FN = "singularity-tweet-watcher";
const DB_API_FN = "singularity-db-api";
const EVENTBRIDGE_RULE = "singularity-tweet-poll";

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

// ── OS detection ─────────────────────────────────────────────────────────────
function detectOS() {
  const platform = process.platform;
  if (platform === "darwin") return "macos";
  if (platform === "linux") {
    try {
      const release = readFileSync("/etc/os-release", "utf8");
      if (/debian|ubuntu/i.test(release)) return "debian";
    } catch {}
    return "linux";
  }
  return platform;
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { stdio: "pipe", encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

// ── config ───────────────────────────────────────────────────────────────────
async function cmdConfig() {
  ensureRepo();
  const { rl, ask, confirm } = createPrompt();
  const os = detectOS();

  console.log(`\n${c.bold}🦀 Singularity Engine — Setup${c.reset}\n`);

  const existing = loadEnv();
  const config = { ...existing };

  // ═══ Step 1: Dependency Check ═══
  step("📋 Checking dependencies...");

  // Node version
  const nodeVer = process.version;
  const nodeMajor = parseInt(nodeVer.slice(1));
  if (nodeMajor >= 20) {
    console.log(`  ${c.green}✅${c.reset} node ${nodeVer} (v20+ required)`);
  } else {
    console.log(`  ${c.red}❌${c.reset} node ${nodeVer} (v20+ required)`);
    err("Please upgrade Node.js to v20 or later.");
    rl.close();
    return;
  }

  // AWS CLI
  const awsVer = tryExec("aws --version");
  if (awsVer) {
    const ver = awsVer.split(" ")[0]?.replace("aws-cli/", "") || awsVer;
    console.log(`  ${c.green}✅${c.reset} aws CLI v${ver}`);
  } else {
    console.log(`  ${c.red}❌${c.reset} aws CLI not found`);
    const install = await confirm("  Install?", "Y");
    if (install) {
      const cmd = os === "macos" ? "brew install awscli" : os === "debian" ? "sudo apt install -y awscli" : null;
      if (cmd) {
        console.log(`  → ${cmd}`);
        try { execSync(cmd, { stdio: "inherit" }); ok("aws CLI installed"); } catch { err("Failed to install aws CLI. Install manually: https://aws.amazon.com/cli/"); }
      } else {
        info("Install manually: https://aws.amazon.com/cli/");
      }
    }
    if (!tryExec("aws --version")) {
      err("aws CLI is required. Please install it and re-run config.");
      rl.close();
      return;
    }
  }

  // gh CLI
  const ghVer = tryExec("gh --version");
  if (ghVer) {
    const ver = ghVer.match(/gh version ([\d.]+)/)?.[1] || ghVer;
    console.log(`  ${c.green}✅${c.reset} gh CLI v${ver}`);
  } else {
    console.log(`  ${c.red}❌${c.reset} gh CLI not found`);
    const install = await confirm("  Install?", "Y");
    if (install) {
      const cmd = os === "macos" ? "brew install gh" : os === "debian" ? "sudo apt install -y gh" : null;
      if (cmd) {
        console.log(`  → ${cmd}`);
        try { execSync(cmd, { stdio: "inherit" }); ok("gh CLI installed"); } catch { err("Failed to install gh CLI. Install manually: https://cli.github.com"); }
      } else {
        info("Install manually: https://cli.github.com");
      }
    }
    if (!tryExec("gh --version")) {
      err("gh CLI is required. Please install it and re-run config.");
      rl.close();
      return;
    }
  }

  // ═══ Credentials Check ═══
  step("\n📋 Checking credentials...");

  // AWS credentials
  const awsRegion = tryExec("aws configure get region");
  const awsIdentity = tryExec("aws sts get-caller-identity --output json");
  if (awsIdentity) {
    const identity = JSON.parse(awsIdentity);
    const acct = identity.Account;
    console.log(`  ${c.green}✅${c.reset} AWS configured (${awsRegion || "us-east-1"}, account ${acct})`);
    config.AWS_REGION = awsRegion || "us-east-1";
  } else {
    console.log(`  ${c.red}❌${c.reset} AWS not configured`);
    info("Running: aws configure");
    try { execSync("aws configure", { stdio: "inherit" }); } catch {}
    const region2 = tryExec("aws configure get region");
    config.AWS_REGION = region2 || "us-east-1";
  }

  // GitHub auth
  const ghToken = tryExec("gh auth token");
  if (ghToken) {
    const ghUser = tryExec("gh api /user -q .login");
    console.log(`  ${c.green}✅${c.reset} GitHub authenticated (${ghUser || "unknown"})`);
    config.GITHUB_TOKEN = ghToken;
  } else {
    console.log(`  ${c.red}❌${c.reset} GitHub not authenticated`);
    info("Running: gh auth login");
    try { execSync("gh auth login", { stdio: "inherit" }); } catch {}
    const token2 = tryExec("gh auth token");
    if (token2) {
      config.GITHUB_TOKEN = token2;
      ok("GitHub authenticated");
    } else {
      warn("GitHub auth failed — you can set GITHUB_TOKEN manually in .env");
    }
  }

  // ═══ Step 2: API Keys (manual) ═══
  console.log(`\n${c.bold}🔑 API Keys${c.reset} ${c.dim}(these can't be auto-detected)${c.reset}\n`);

  // Anthropic
  const PLACEHOLDERS = new Set([
    "your_x_bearer_token", "your_tweet_id", "your_x_username",
    "your_github_token", "your-org/singularity-builds",
    "https://your-org.github.io/singularity-builds",
    "your_anthropic_api_key",
    "https://your-api-gateway.execute-api.us-east-1.amazonaws.com/api/data",
    "your_consumer_key", "your_consumer_secret",
    "your_access_token", "your_access_token_secret",
  ]);
  const isPlaceholder = (val) => !val || PLACEHOLDERS.has(val) || /^your[_-]/.test(val);

  const existingAnthro = isPlaceholder(config.ANTHROPIC_API_KEY) ? "" : config.ANTHROPIC_API_KEY;
  config.ANTHROPIC_API_KEY = await ask("Anthropic API key", existingAnthro);
  if (config.ANTHROPIC_API_KEY) {
    // Quick validation
    process.stdout.write(`  ${c.dim}Validating...${c.reset} `);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": config.ANTHROPIC_API_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
      });
      console.log(res.ok || res.status === 400 ? `${c.green}✅ Validated${c.reset}` : `${c.red}❌ (${res.status})${c.reset}`);
    } catch (e) {
      console.log(`${c.yellow}⚠️  Could not validate (${e.message})${c.reset}`);
    }
  }

  // Reply Mode
  console.log(`\n${c.bold}📤 Reply Mode${c.reset}`);
  console.log(`  ${c.dim}How should the bot reply to tweets?${c.reset}`);
  console.log(`  1. openclaw — browser automation (no X write access needed)`);
  console.log(`  2. x-api — X API v2 direct posting (fast, needs OAuth)`);
  const modeChoice = await ask("Choice", config.REPLY_MODE === "x-api" ? "2" : "1");
  config.REPLY_MODE = modeChoice === "2" ? "x-api" : "openclaw";

  // X API Bearer token
  console.log(`\n${c.bold}🐦 X API${c.reset}`);
  const existingBearer = isPlaceholder(config.X_BEARER_TOKEN) ? "" : config.X_BEARER_TOKEN;
  config.X_BEARER_TOKEN = await ask("Bearer token (for reading tweets)", existingBearer);

  let detectedUsername = null;
  if (config.X_BEARER_TOKEN) {
    process.stdout.write(`  ${c.dim}Validating...${c.reset} `);
    try {
      // Try /2/users/me first (works with OAuth 2.0 user context tokens)
      const meRes = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${config.X_BEARER_TOKEN}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        detectedUsername = me.data?.username;
        console.log(`${c.green}✅ Validated — authenticated as @${detectedUsername}${c.reset}`);
      } else {
        // Fallback: just check the token works for reading
        const searchRes = await fetch("https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10", {
          headers: { Authorization: `Bearer ${config.X_BEARER_TOKEN}` },
        });
        if (searchRes.ok) {
          console.log(`${c.green}✅ Validated (app-only token, no user context)${c.reset}`);
        } else {
          console.log(`${c.red}❌ (${searchRes.status})${c.reset}`);
        }
      }
    } catch (e) {
      console.log(`${c.red}❌ (${e.message})${c.reset}`);
    }
  }

  // Owner username
  if (detectedUsername) {
    config.OWNER_USERNAME = detectedUsername;
  } else {
    const existingOwner = isPlaceholder(config.OWNER_USERNAME) ? "" : config.OWNER_USERNAME;
    config.OWNER_USERNAME = await ask("Your X username (without @)", existingOwner);
  }

  // X API OAuth (only if x-api mode)
  if (config.REPLY_MODE === "x-api") {
    console.log(`\n${c.bold}🔑 X API OAuth 1.0a${c.reset} ${c.dim}(developer.x.com — needed for posting)${c.reset}`);
    config.X_CONSUMER_KEY = await ask("Consumer Key", isPlaceholder(config.X_CONSUMER_KEY) ? "" : config.X_CONSUMER_KEY);
    config.X_CONSUMER_SECRET = await ask("Consumer Secret", isPlaceholder(config.X_CONSUMER_SECRET) ? "" : config.X_CONSUMER_SECRET);
    config.X_ACCESS_TOKEN = await ask("Access Token", isPlaceholder(config.X_ACCESS_TOKEN) ? "" : config.X_ACCESS_TOKEN);
    config.X_ACCESS_TOKEN_SECRET = await ask("Access Token Secret", isPlaceholder(config.X_ACCESS_TOKEN_SECRET) ? "" : config.X_ACCESS_TOKEN_SECRET);

    if (config.X_CONSUMER_KEY) {
      process.stdout.write(`  ${c.dim}Validating OAuth...${c.reset} `);
      try {
        const { validateCredentials } = await import(join(REPO_ROOT, "shared/x-api-client.mjs"));
        const result = await validateCredentials({
          consumerKey: config.X_CONSUMER_KEY,
          consumerSecret: config.X_CONSUMER_SECRET,
          accessToken: config.X_ACCESS_TOKEN,
          accessTokenSecret: config.X_ACCESS_TOKEN_SECRET,
        });
        console.log(result.ok ? `${c.green}✅ (@${result.username})${c.reset}` : `${c.red}❌ (${result.error})${c.reset}`);
      } catch (e) {
        console.log(`${c.red}❌ (${e.message})${c.reset}`);
      }
    }
  }

  // OpenClaw CDP port (only if openclaw mode, with sensible default)
  if (config.REPLY_MODE === "openclaw") {
    config.OPENCLAW_CDP_PORT = config.OPENCLAW_CDP_PORT || "18800";
  }

  // ═══ Step 3: Auto-Configure GitHub ═══
  console.log(`\n${c.bold}🐙 GitHub Setup${c.reset}`);
  const ghUser = tryExec("gh api /user -q .login");

  if (ghUser) {
    console.log(`  Checking for singularity-builds fork...`);
    const forkCheck = tryExec(`gh api repos/${ghUser}/singularity-builds -q .full_name 2>/dev/null`);
    if (forkCheck) {
      console.log(`  ${c.green}✅${c.reset} Found: ${forkCheck}`);
      config.GITHUB_REPO = forkCheck;
    } else {
      console.log(`  ${c.red}❌${c.reset} Not found.`);
      const doFork = await confirm("  Fork Metatransformer/singularity-builds?", "Y");
      if (doFork) {
        console.log(`  → gh repo fork Metatransformer/singularity-builds --clone=false`);
        try {
          execSync("gh repo fork Metatransformer/singularity-builds --clone=false", { stdio: "pipe" });
          config.GITHUB_REPO = `${ghUser}/singularity-builds`;
          ok(`Forked to ${config.GITHUB_REPO}`);
        } catch (e) {
          warn(`Fork failed: ${e.message}`);
          config.GITHUB_REPO = config.GITHUB_REPO || `${ghUser}/singularity-builds`;
        }
      } else {
        config.GITHUB_REPO = isPlaceholder(config.GITHUB_REPO) ? `${ghUser}/singularity-builds` : config.GITHUB_REPO;
      }
    }
  } else {
    config.GITHUB_REPO = isPlaceholder(config.GITHUB_REPO) ? "Metatransformer/singularity-builds" : config.GITHUB_REPO;
  }

  // Derive Pages URL
  const [repoOwner, repoName] = config.GITHUB_REPO.split("/");
  config.GITHUB_PAGES_URL = `https://${repoOwner}.github.io/${repoName}`;
  console.log(`  ${c.green}✅${c.reset} GitHub Pages URL: ${config.GITHUB_PAGES_URL}`);

  // Auto-set defaults
  config.TABLE_NAME = config.TABLE_NAME || "singularity-db";

  // ═══ Step 4: Save and Summarize ═══
  saveEnv(config);

  // Get AWS account for summary
  let awsAcct = "";
  try {
    const id = JSON.parse(tryExec("aws sts get-caller-identity --output json") || "{}");
    awsAcct = id.Account ? ` (account ${id.Account})` : "";
  } catch {}

  console.log(`\n${c.green}✅ Configuration saved to .env${c.reset}`);
  console.log(`\n${c.bold}📋 Summary:${c.reset}`);
  console.log(`  Anthropic API ${isPlaceholder(config.ANTHROPIC_API_KEY) ? c.red + "❌" : c.green + "✅"}${c.reset}`);
  console.log(`  X API (read)  ${isPlaceholder(config.X_BEARER_TOKEN) ? c.red + "❌" : c.green + "✅"}${c.reset}${config.OWNER_USERNAME ? ` (@${config.OWNER_USERNAME})` : ""}`);
  console.log(`  Reply mode    ${config.REPLY_MODE}`);
  console.log(`  AWS           ${config.AWS_REGION}${awsAcct}`);
  console.log(`  GitHub        ${config.GITHUB_REPO}`);
  console.log(`  Pages URL     ${config.GITHUB_PAGES_URL}`);

  console.log(`\n${c.bold}Next:${c.reset} ${c.cyan}singularityengine deploy${c.reset}\n`);

  rl.close();
}

// ── watch ────────────────────────────────────────────────────────────────────
async function cmdWatch(args) {
  ensureRepo();
  const env = loadEnv();
  const tweetId = args[0];

  if (!tweetId) {
    // Show current watched tweet
    const current = env.WATCHED_TWEET_ID;
    const PLACEHOLDERS = new Set(["your_tweet_id"]);
    const isPlaceholder = (val) => !val || PLACEHOLDERS.has(val) || /^your[_-]/.test(val);
    if (isPlaceholder(current)) {
      info("No tweet currently being watched.");
      console.log(`  Usage: ${c.cyan}singularityengine watch <tweet_id>${c.reset}\n`);
      return;
    }
    console.log(`\n  Currently watching tweet ${c.bold}${current}${c.reset}`);

    // Fetch tweet details if bearer token available
    if (env.X_BEARER_TOKEN && !isPlaceholder(env.X_BEARER_TOKEN)) {
      try {
        const res = await fetch(
          `https://api.twitter.com/2/tweets/${current}?expansions=author_id&tweet.fields=public_metrics&user.fields=username`,
          { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const text = data.data?.text || "";
          const username = data.includes?.users?.[0]?.username || "unknown";
          const replies = data.data?.public_metrics?.reply_count || 0;
          console.log(`  "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
          console.log(`  By @${username} (${replies} replies so far)`);
        }
      } catch {}
    }
    console.log();
    return;
  }

  // Set new watched tweet
  env.WATCHED_TWEET_ID = tweetId;
  saveEnv(env);
  ok(`Now watching tweet ${tweetId}`);

  // Fetch tweet details
  const PLACEHOLDERS2 = new Set(["your_x_bearer_token"]);
  if (env.X_BEARER_TOKEN && !PLACEHOLDERS2.has(env.X_BEARER_TOKEN) && !/^your[_-]/.test(env.X_BEARER_TOKEN)) {
    process.stdout.write(`  ${c.dim}Fetching tweet...${c.reset} `);
    try {
      const res = await fetch(
        `https://api.twitter.com/2/tweets/${tweetId}?expansions=author_id&tweet.fields=public_metrics&user.fields=username`,
        { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const text = data.data?.text || "";
        const username = data.includes?.users?.[0]?.username || "unknown";
        const replies = data.data?.public_metrics?.reply_count || 0;
        console.log();
        console.log(`  "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`);
        console.log(`  By @${username} (${replies} replies so far)`);
      } else {
        console.log(`${c.yellow}could not fetch (${res.status})${c.reset}`);
      }
    } catch (e) {
      console.log(`${c.yellow}could not fetch (${e.message})${c.reset}`);
    }
  }
  console.log();
}

// ── deploy ───────────────────────────────────────────────────────────────────
async function cmdDeploy(args) {
  ensureRepo();
  const dryRun = args.includes("--dry-run");
  const env = loadEnv();
  const region = env.AWS_REGION || "us-east-1";
  const tableName = env.TABLE_NAME || "singularity-db";

  console.log(`\n${c.bold}🚀 Deploying Singularity Engine to AWS${c.reset}\n`);

  // Get account ID
  let accountId;
  try {
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const sts = new STSClient({ region });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    accountId = identity.Account;
    info(`Account: ${accountId}`);
    info(`Region: ${region}`);
    info(`Table: ${tableName}`);
  } catch (e) {
    err(`AWS credentials not configured: ${e.message}`);
    console.log(`  Run ${c.cyan}aws configure${c.reset} first.`);
    process.exit(1);
  }

  if (dryRun) warn("DRY RUN — no changes will be made\n");

  const run = async (label, fn) => {
    process.stdout.write(`${c.blue}  ⏳ ${label}...${c.reset} `);
    if (dryRun) {
      console.log(`${c.yellow}[dry-run]${c.reset}`);
      return null;
    }
    try {
      const result = await fn();
      console.log(`${c.green}✅${c.reset}`);
      return result;
    } catch (e) {
      if (e.name === "ResourceConflictException" || e.name === "EntityAlreadyExistsException" || e.name === "ResourceInUseException" || e.message?.includes("already exists")) {
        console.log(`${c.yellow}(exists)${c.reset}`);
        return "exists";
      }
      console.log(`${c.red}❌ ${e.message}${c.reset}`);
      throw e;
    }
  };

  // 1. DynamoDB Table
  step("\n📦 DynamoDB");
  try {
    const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = await import("@aws-sdk/client-dynamodb");
    const ddb = new DynamoDBClient({ region });
    await run("Creating table", async () => {
      try {
        await ddb.send(new DescribeTableCommand({ TableName: tableName }));
        return "exists";
      } catch {
        await ddb.send(new CreateTableCommand({
          TableName: tableName,
          KeySchema: [
            { AttributeName: "pk", KeyType: "HASH" },
            { AttributeName: "sk", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "pk", AttributeType: "S" },
            { AttributeName: "sk", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }));
      }
    });
  } catch (e) {
    if (!dryRun) { err(e.message); process.exit(1); }
  }

  // 2. IAM Role
  step("\n🔐 IAM Role");
  let roleArn;
  try {
    const { IAMClient, CreateRoleCommand, GetRoleCommand, AttachRolePolicyCommand, PutRolePolicyCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({ region });

    const trustPolicy = JSON.stringify({
      Version: "2012-10-17",
      Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }],
    });

    const result = await run("Creating IAM role", async () => {
      try {
        const r = await iam.send(new CreateRoleCommand({
          RoleName: ROLE_NAME,
          AssumeRolePolicyDocument: trustPolicy,
        }));
        return r.Role.Arn;
      } catch (e) {
        if (e.name === "EntityAlreadyExistsException") {
          const r = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
          return r.Role.Arn;
        }
        throw e;
      }
    });

    if (!dryRun) {
      roleArn = typeof result === "string" && result.startsWith("arn:") ? result : `arn:aws:iam::${accountId}:role/${ROLE_NAME}`;
      if (result === "exists") {
        const r = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
        roleArn = r.Role.Arn;
      }

      await run("Attaching policies", async () => {
        await iam.send(new AttachRolePolicyCommand({
          RoleName: ROLE_NAME,
          PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        }));
        await iam.send(new PutRolePolicyCommand({
          RoleName: ROLE_NAME,
          PolicyName: "singularity-engine-policy",
          PolicyDocument: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
                Resource: `arn:aws:dynamodb:${region}:${accountId}:table/${tableName}`,
              },
              {
                Effect: "Allow",
                Action: ["lambda:InvokeFunction"],
                Resource: `arn:aws:lambda:${region}:${accountId}:function:singularity-*`,
              },
            ],
          }),
        }));
      });

      info("Waiting 10s for IAM propagation...");
      await new Promise((r) => setTimeout(r, 10000));
    } else {
      roleArn = `arn:aws:iam::${accountId}:role/${ROLE_NAME}`;
    }
  } catch (e) {
    if (!dryRun) { err(e.message); process.exit(1); }
  }

  // 3. Lambda Functions
  step("\n📦 Lambda Functions");

  const deployLambda = async (fnName, entryFile, includeShared, pkgDeps, envVars, timeout, memorySize) => {
    const { LambdaClient, CreateFunctionCommand, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand, GetFunctionCommand } = await import("@aws-sdk/client-lambda");
    const lambda = new LambdaClient({ region });
    const { execSync } = await import("child_process");
    const { mkdtempSync, cpSync, rmSync } = await import("fs");
    const { tmpdir } = await import("os");
    const tmpDir = mkdtempSync(join(tmpdir(), "se-"));

    try {
      // Copy entry file
      cpSync(join(REPO_ROOT, entryFile), join(tmpDir, "index.mjs"));

      // Fix import paths
      let code = readFileSync(join(tmpDir, "index.mjs"), "utf8");
      code = code.replace(/\.\.\/\.\.\/shared\//g, "./shared/").replace(/\.\.\/shared\//g, "./shared/");
      writeFileSync(join(tmpDir, "index.mjs"), code);

      if (includeShared) {
        mkdirSync(join(tmpDir, "shared"), { recursive: true });
        const sharedDir = join(REPO_ROOT, "shared");
        for (const f of ["prompts.mjs", "security.mjs", "x-api-client.mjs"]) {
          if (existsSync(join(sharedDir, f))) {
            cpSync(join(sharedDir, f), join(tmpDir, "shared", f));
          }
        }
      }

      if (pkgDeps) {
        writeFileSync(join(tmpDir, "package.json"), JSON.stringify({
          name: fnName, version: "1.0.0", type: "module", dependencies: pkgDeps,
        }));
        execSync("npm install --production 2>/dev/null", { cwd: tmpDir, stdio: "pipe" });
      }

      execSync("zip -r function.zip . > /dev/null", { cwd: tmpDir, stdio: "pipe" });
      const zipFile = readFileSync(join(tmpDir, "function.zip"));

      await run(`Deploying ${fnName}`, async () => {
        try {
          await lambda.send(new GetFunctionCommand({ FunctionName: fnName }));
          // Exists — update
          await lambda.send(new UpdateFunctionCodeCommand({
            FunctionName: fnName,
            ZipFile: zipFile,
          }));
          // Wait a moment for code update
          await new Promise((r) => setTimeout(r, 2000));
          await lambda.send(new UpdateFunctionConfigurationCommand({
            FunctionName: fnName,
            Environment: { Variables: envVars },
            Timeout: timeout,
            MemorySize: memorySize,
          }));
        } catch {
          await lambda.send(new CreateFunctionCommand({
            FunctionName: fnName,
            Runtime: "nodejs20.x",
            Handler: "index.handler",
            Role: roleArn,
            Code: { ZipFile: zipFile },
            Environment: { Variables: envVars },
            Timeout: timeout,
            MemorySize: memorySize,
          }));
        }
      });
    } finally {
      execSync(`rm -rf "${tmpDir}"`);
    }
  };

  if (!dryRun) {
    await deployLambda(CODE_RUNNER_FN, "aws/code-runner/run.mjs", true,
      { "@aws-sdk/client-dynamodb": "^3.0.0", "@aws-sdk/lib-dynamodb": "^3.0.0", "@andersmyrmel/vard": "^1.0.0", "@anthropic-ai/sdk": "^0.39.0" },
      { TABLE_NAME: tableName, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || "", SINGULARITY_DB_URL: env.SINGULARITY_DB_URL || "" },
      120, 512);

    await deployLambda(DEPLOYER_FN, "aws/deployer/index.mjs", false,
      { "@aws-sdk/client-dynamodb": "^3.0.0", "@aws-sdk/lib-dynamodb": "^3.0.0" },
      { TABLE_NAME: tableName, GITHUB_REPO: env.GITHUB_REPO || "", GITHUB_TOKEN: env.GITHUB_TOKEN || "", GITHUB_PAGES_URL: env.GITHUB_PAGES_URL || "" },
      30, 256);

    await deployLambda(WATCHER_FN, "aws/tweet-watcher/index.mjs", true,
      { "@aws-sdk/client-dynamodb": "^3.0.0", "@aws-sdk/lib-dynamodb": "^3.0.0", "@aws-sdk/client-lambda": "^3.0.0", "@andersmyrmel/vard": "^1.0.0" },
      { TABLE_NAME: tableName, CODE_RUNNER_FUNCTION: CODE_RUNNER_FN, DEPLOYER_FUNCTION: DEPLOYER_FN, X_BEARER_TOKEN: env.X_BEARER_TOKEN || "", WATCHED_TWEET_ID: env.WATCHED_TWEET_ID || "", OWNER_USERNAME: env.OWNER_USERNAME || "" },
      300, 256);

    await deployLambda(DB_API_FN, "aws/db-api/index.mjs", false,
      { "@aws-sdk/client-dynamodb": "^3.0.0", "@aws-sdk/lib-dynamodb": "^3.0.0" },
      { TABLE_NAME: tableName },
      10, 256);
  } else {
    await run(`Deploying ${CODE_RUNNER_FN}`, async () => {});
    await run(`Deploying ${DEPLOYER_FN}`, async () => {});
    await run(`Deploying ${WATCHER_FN}`, async () => {});
    await run(`Deploying ${DB_API_FN}`, async () => {});
  }

  // 4. EventBridge
  step("\n⏰ EventBridge");
  try {
    const { EventBridgeClient, PutRuleCommand, PutTargetsCommand } = await import("@aws-sdk/client-eventbridge");
    const { LambdaClient, AddPermissionCommand, GetFunctionCommand } = await import("@aws-sdk/client-lambda");

    await run("Creating schedule rule (every 2 min)", async () => {
      const eb = new EventBridgeClient({ region });
      const ruleResult = await eb.send(new PutRuleCommand({
        Name: EVENTBRIDGE_RULE,
        ScheduleExpression: "rate(2 minutes)",
        State: "ENABLED",
      }));

      const lambda = new LambdaClient({ region });
      const fn = await lambda.send(new GetFunctionCommand({ FunctionName: WATCHER_FN }));
      const watcherArn = fn.Configuration.FunctionArn;

      await eb.send(new PutTargetsCommand({
        Rule: EVENTBRIDGE_RULE,
        Targets: [{ Id: "singularity-watcher", Arn: watcherArn }],
      }));

      try {
        await lambda.send(new AddPermissionCommand({
          FunctionName: WATCHER_FN,
          StatementId: "eventbridge-invoke",
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: ruleResult.RuleArn,
        }));
      } catch {} // Permission may already exist
    });
  } catch (e) {
    if (!dryRun) { err(e.message); }
  }

  // 5. API Gateway (SingularityDB)
  step("\n🌐 API Gateway");
  try {
    const { ApiGatewayV2Client, GetApisCommand, CreateApiCommand, CreateRouteCommand, CreateIntegrationCommand, CreateStageCommand, GetStagesCommand } = await import("@aws-sdk/client-apigatewayv2");
    const apigw = new ApiGatewayV2Client({ region });

    await run("Setting up API Gateway", async () => {
      // Check if API already exists
      const apis = await apigw.send(new GetApisCommand({}));
      let api = apis.Items?.find((a) => a.Name === "singularity-db-api");

      if (!api) {
        const result = await apigw.send(new CreateApiCommand({
          Name: "singularity-db-api",
          ProtocolType: "HTTP",
          CorsConfiguration: {
            AllowOrigins: ["*"],
            AllowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            AllowHeaders: ["*"],
          },
        }));
        api = result;

        // Create integration with db-api Lambda
        const { LambdaClient, GetFunctionCommand, AddPermissionCommand: AddPermCmd } = await import("@aws-sdk/client-lambda");
        const lambda = new LambdaClient({ region });
        const fn = await lambda.send(new GetFunctionCommand({ FunctionName: DB_API_FN }));

        // Grant API Gateway permission to invoke the Lambda
        try {
          await lambda.send(new AddPermCmd({
            FunctionName: DB_API_FN,
            StatementId: "apigateway-invoke",
            Action: "lambda:InvokeFunction",
            Principal: "apigateway.amazonaws.com",
          }));
        } catch {} // may already exist

        const integration = await apigw.send(new CreateIntegrationCommand({
          ApiId: api.ApiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: fn.Configuration.FunctionArn,
          PayloadFormatVersion: "2.0",
        }));

        await apigw.send(new CreateRouteCommand({
          ApiId: api.ApiId,
          RouteKey: "ANY /api/{proxy+}",
          Target: `integrations/${integration.IntegrationId}`,
        }));

        // Create $default stage with auto-deploy
        await apigw.send(new CreateStageCommand({
          ApiId: api.ApiId,
          StageName: "$default",
          AutoDeploy: true,
        }));
      }

      const apiUrl = api.ApiEndpoint || `https://${api.ApiId}.execute-api.${region}.amazonaws.com`;
      info(`API Gateway URL: ${apiUrl}/api/data`);

      // Update .env
      const currentEnv = loadEnv();
      currentEnv.SINGULARITY_DB_URL = `${apiUrl}/api/data`;
      saveEnv(currentEnv);
    });
  } catch (e) {
    if (!dryRun) warn(`API Gateway: ${e.message}`);
  }

  console.log(`\n${c.bold}${c.green}════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.green}🎉 Singularity Engine deployed!${c.reset}`);
  console.log(`${c.bold}${c.green}════════════════════════════════════════════${c.reset}\n`);

  console.log(`${c.bold}Lambdas:${c.reset}`);
  console.log(`  • ${WATCHER_FN} (polls X every 2 min)`);
  console.log(`  • ${CODE_RUNNER_FN} (generates apps)`);
  console.log(`  • ${DEPLOYER_FN} (pushes to GitHub Pages)`);
  console.log(`  • ${DB_API_FN} (public builds API)\n`);

  console.log(`${c.bold}Next:${c.reset}`);
  console.log(`  ${c.cyan}singularityengine status${c.reset}  — Verify deployment`);
  console.log(`  ${c.cyan}singularityengine start${c.reset}   — Ensure polling is active`);
  console.log(`  Then tweet a build request! 🚀\n`);
}

// ── status ───────────────────────────────────────────────────────────────────
async function cmdStatus() {
  ensureRepo();
  const env = loadEnv();
  const region = env.AWS_REGION || "us-east-1";
  const tableName = env.TABLE_NAME || "singularity-db";

  console.log(`\n${c.bold}🦀 Singularity Engine — Status${c.reset}\n`);

  // Config status
  step("📋 Configuration");
  // Placeholder values from .env.example that indicate unconfigured
  const PLACEHOLDERS = new Set([
    "your_x_bearer_token", "your_tweet_id", "your_x_username",
    "your_github_token", "your-org/singularity-builds",
    "https://your-org.github.io/singularity-builds",
    "your_anthropic_api_key",
    "https://your-api-gateway.execute-api.us-east-1.amazonaws.com/api/data",
    "your_consumer_key", "your_consumer_secret",
    "your_access_token", "your_access_token_secret",
  ]);
  const isPlaceholder = (val) => !val || PLACEHOLDERS.has(val) || /^your[_-]/.test(val);

  const secrets = [
    "X_BEARER_TOKEN", "WATCHED_TWEET_ID", "OWNER_USERNAME",
    "AWS_REGION", "TABLE_NAME", "GITHUB_TOKEN", "GITHUB_REPO",
    "GITHUB_PAGES_URL", "ANTHROPIC_API_KEY", "SINGULARITY_DB_URL", "REPLY_MODE",
  ];
  for (const key of secrets) {
    const val = env[key];
    const placeholder = isPlaceholder(val);
    const status = placeholder ? `${c.red}❌${c.reset}` : `${c.green}✅${c.reset}`;
    const preview = placeholder ? `${c.dim}(not configured)${c.reset}` : `${c.dim}(${val.slice(0, 8)}...)${c.reset}`;
    console.log(`  ${status} ${key} ${preview}`);
  }

  // AWS infrastructure
  step("\n☁️  AWS Infrastructure");
  try {
    // Lambda functions
    const { LambdaClient, GetFunctionCommand } = await import("@aws-sdk/client-lambda");
    const lambda = new LambdaClient({ region });
    for (const fn of [WATCHER_FN, CODE_RUNNER_FN, DEPLOYER_FN, DB_API_FN]) {
      try {
        const result = await lambda.send(new GetFunctionCommand({ FunctionName: fn }));
        console.log(`  ${c.green}✅${c.reset} Lambda: ${fn} ${c.dim}(${result.Configuration.Runtime}, ${result.Configuration.MemorySize}MB)${c.reset}`);
      } catch {
        console.log(`  ${c.red}❌${c.reset} Lambda: ${fn} ${c.dim}(not found)${c.reset}`);
      }
    }

    // EventBridge
    const { EventBridgeClient, DescribeRuleCommand } = await import("@aws-sdk/client-eventbridge");
    const eb = new EventBridgeClient({ region });
    try {
      const rule = await eb.send(new DescribeRuleCommand({ Name: EVENTBRIDGE_RULE }));
      const running = rule.State === "ENABLED";
      console.log(`  ${running ? c.green + "✅" : c.yellow + "⏸️ "} ${c.reset} EventBridge: ${EVENTBRIDGE_RULE} ${c.dim}(${rule.State})${c.reset}`);
      console.log(`\n${c.bold}🤖 Bot Status: ${running ? c.green + "RUNNING" : c.yellow + "STOPPED"}${c.reset}`);
    } catch {
      console.log(`  ${c.red}❌${c.reset} EventBridge: ${EVENTBRIDGE_RULE} ${c.dim}(not found)${c.reset}`);
      console.log(`\n${c.bold}🤖 Bot Status: ${c.red}NOT DEPLOYED${c.reset}`);
    }

    // DynamoDB
    const { DynamoDBClient, DescribeTableCommand, ScanCommand } = await import("@aws-sdk/client-dynamodb");
    const ddb = new DynamoDBClient({ region });
    try {
      const table = await ddb.send(new DescribeTableCommand({ TableName: tableName }));
      console.log(`\n  ${c.green}✅${c.reset} DynamoDB: ${tableName} ${c.dim}(${table.Table.ItemCount} items)${c.reset}`);

      // Reply queue count
      try {
        const scan = await ddb.send(new ScanCommand({
          TableName: tableName,
          FilterExpression: "begins_with(pk, :ns)",
          ExpressionAttributeValues: { ":ns": { S: "_reply_queue" } },
          Select: "COUNT",
        }));
        console.log(`  ${c.cyan}📬${c.reset} Reply queue: ${scan.Count} pending`);
      } catch {}

      // Showcase count
      try {
        const scan = await ddb.send(new ScanCommand({
          TableName: tableName,
          FilterExpression: "begins_with(pk, :ns)",
          ExpressionAttributeValues: { ":ns": { S: "_showcase" } },
          Select: "COUNT",
        }));
        console.log(`  ${c.cyan}🏗️ ${c.reset} Deployed apps: ${scan.Count}`);
      } catch {}
    } catch {
      console.log(`\n  ${c.red}❌${c.reset} DynamoDB: ${tableName} ${c.dim}(not found)${c.reset}`);
    }
  } catch (e) {
    err(`AWS error: ${e.message}`);
    console.log(`  ${c.dim}Make sure AWS credentials are configured.${c.reset}`);
  }

  // Warnings
  const warnings = [];
  if (isPlaceholder(env.X_BEARER_TOKEN)) warnings.push("X Bearer Token not configured — tweet watching won't work");
  if (isPlaceholder(env.ANTHROPIC_API_KEY)) warnings.push("Anthropic API key not configured — code generation won't work");
  if (isPlaceholder(env.GITHUB_TOKEN)) warnings.push("GitHub token not configured — deployment won't work");
  if (isPlaceholder(env.SINGULARITY_DB_URL)) warnings.push("SingularityDB URL not configured — run deploy first");

  if (warnings.length > 0) {
    console.log(`\n${c.yellow}⚠️  Warnings:${c.reset}`);
    for (const w of warnings) {
      console.log(`  ${c.yellow}• ${w}${c.reset}`);
    }
  }
  console.log();
}

// ── stop ─────────────────────────────────────────────────────────────────────
async function cmdStop() {
  ensureRepo();
  const env = loadEnv();
  const region = env.AWS_REGION || "us-east-1";

  console.log(`\n${c.bold}⏹️  Stopping Singularity Engine...${c.reset}\n`);

  try {
    const { EventBridgeClient, DisableRuleCommand } = await import("@aws-sdk/client-eventbridge");
    const eb = new EventBridgeClient({ region });
    await eb.send(new DisableRuleCommand({ Name: EVENTBRIDGE_RULE }));
    ok("EventBridge rule disabled. Tweet polling stopped.");
    info("Infrastructure is still deployed. Use 'singularityengine start' to resume.");
    info("Use 'singularityengine uninstall' to tear down everything.\n");
  } catch (e) {
    err(`Failed to stop: ${e.message}`);
  }
}

// ── start ────────────────────────────────────────────────────────────────────
async function cmdStart() {
  ensureRepo();
  const env = loadEnv();
  const region = env.AWS_REGION || "us-east-1";

  console.log(`\n${c.bold}▶️  Starting Singularity Engine...${c.reset}\n`);

  try {
    const { EventBridgeClient, EnableRuleCommand } = await import("@aws-sdk/client-eventbridge");
    const eb = new EventBridgeClient({ region });
    await eb.send(new EnableRuleCommand({ Name: EVENTBRIDGE_RULE }));
    ok("EventBridge rule enabled. Tweet polling active!");
    info("The bot will check for new tweets every 2 minutes.\n");
  } catch (e) {
    err(`Failed to start: ${e.message}`);
    info("Have you deployed yet? Run 'singularityengine deploy' first.\n");
  }
}

// ── uninstall ────────────────────────────────────────────────────────────────
async function cmdUninstall() {
  ensureRepo();
  const { rl, ask, confirm } = createPrompt();
  const env = loadEnv();
  const region = env.AWS_REGION || "us-east-1";
  const tableName = env.TABLE_NAME || "singularity-db";

  console.log(`\n${c.bold}${c.red}🗑️  Singularity Engine — Full Teardown${c.reset}\n`);
  warn("This will delete all AWS infrastructure.\n");

  if (!(await confirm("Are you sure you want to continue?"))) {
    console.log("Aborted.");
    rl.close();
    return;
  }

  // EventBridge
  if (await confirm("Delete EventBridge rule?")) {
    try {
      const { EventBridgeClient, RemoveTargetsCommand, DeleteRuleCommand } = await import("@aws-sdk/client-eventbridge");
      const eb = new EventBridgeClient({ region });
      await eb.send(new RemoveTargetsCommand({ Rule: EVENTBRIDGE_RULE, Ids: ["singularity-watcher"] }));
      await eb.send(new DeleteRuleCommand({ Name: EVENTBRIDGE_RULE }));
      ok("EventBridge rule deleted");
    } catch (e) {
      warn(`EventBridge: ${e.message}`);
    }
  }

  // Lambda functions
  if (await confirm("Delete Lambda functions?")) {
    const { LambdaClient, DeleteFunctionCommand } = await import("@aws-sdk/client-lambda");
    const lambda = new LambdaClient({ region });
    for (const fn of [WATCHER_FN, CODE_RUNNER_FN, DEPLOYER_FN, DB_API_FN]) {
      try {
        await lambda.send(new DeleteFunctionCommand({ FunctionName: fn }));
        ok(`Deleted ${fn}`);
      } catch (e) {
        warn(`${fn}: ${e.message}`);
      }
    }
  }

  // API Gateway
  if (await confirm("Delete API Gateway?")) {
    try {
      const { ApiGatewayV2Client, GetApisCommand, DeleteApiCommand } = await import("@aws-sdk/client-apigatewayv2");
      const apigw = new ApiGatewayV2Client({ region });
      const apis = await apigw.send(new GetApisCommand({}));
      const api = apis.Items?.find((a) => a.Name === "singularity-db-api");
      if (api) {
        await apigw.send(new DeleteApiCommand({ ApiId: api.ApiId }));
        ok("API Gateway deleted");
      } else {
        info("API Gateway not found (already deleted?)");
      }
    } catch (e) {
      warn(`API Gateway: ${e.message}`);
    }
  }

  // IAM Role
  if (await confirm("Delete IAM role?")) {
    try {
      const { IAMClient, DeleteRolePolicyCommand, DetachRolePolicyCommand, DeleteRoleCommand } = await import("@aws-sdk/client-iam");
      const iam = new IAMClient({ region });
      try { await iam.send(new DeleteRolePolicyCommand({ RoleName: ROLE_NAME, PolicyName: "singularity-engine-policy" })); } catch {}
      try { await iam.send(new DetachRolePolicyCommand({ RoleName: ROLE_NAME, PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" })); } catch {}
      await iam.send(new DeleteRoleCommand({ RoleName: ROLE_NAME }));
      ok("IAM role deleted");
    } catch (e) {
      warn(`IAM: ${e.message}`);
    }
  }

  // DynamoDB (optional, data loss warning)
  console.log(`\n${c.red}${c.bold}⚠️  DynamoDB table contains your app data and build history.${c.reset}`);
  if (await confirm("Delete DynamoDB table? (DATA LOSS!)")) {
    try {
      const { DynamoDBClient, DeleteTableCommand } = await import("@aws-sdk/client-dynamodb");
      const ddb = new DynamoDBClient({ region });
      await ddb.send(new DeleteTableCommand({ TableName: tableName }));
      ok("DynamoDB table deleted");
    } catch (e) {
      warn(`DynamoDB: ${e.message}`);
    }
  }

  // Remove symlink
  if (await confirm("Remove /usr/local/bin/singularityengine symlink?")) {
    try {
      execSync("rm -f /usr/local/bin/singularityengine");
      ok("Symlink removed");
    } catch (e) {
      warn(`Symlink: ${e.message}`);
    }
  }

  console.log(`\n${c.green}Teardown complete.${c.reset}\n`);
  rl.close();
}

// ── update ───────────────────────────────────────────────────────────────────
async function cmdUpdate() {
  ensureRepo();
  console.log(`\n${c.bold}🔄 Updating Singularity Engine...${c.reset}\n`);

  try {
    step("📥 Pulling latest changes...");
    execSync("git pull origin main", { cwd: REPO_ROOT, stdio: "inherit" });

    step("\n📦 Installing dependencies...");
    execSync("npm install", { cwd: REPO_ROOT, stdio: "inherit" });

    // Re-link
    step("\n🔗 Re-linking CLI...");
    const cliPath = join(REPO_ROOT, "bin/cli.mjs");
    execSync(`chmod +x "${cliPath}"`);
    try {
      execSync(`ln -sf "${cliPath}" /usr/local/bin/singularityengine`);
      ok("Symlink updated");
    } catch {
      warn("Could not update symlink (try with sudo)");
    }

    // Show changelog if exists
    const changelogPath = join(REPO_ROOT, "CHANGELOG.md");
    if (existsSync(changelogPath)) {
      const changelog = readFileSync(changelogPath, "utf8");
      const recent = changelog.split("\n").slice(0, 20).join("\n");
      console.log(`\n${c.bold}📝 Recent Changes:${c.reset}`);
      console.log(`${c.dim}${recent}${c.reset}`);
    }

    ok("\nUpdate complete!\n");
  } catch (e) {
    err(`Update failed: ${e.message}`);
  }
}

// ── api ──────────────────────────────────────────────────────────────────────
function cmdApi() {
  ensureRepo();
  const env = loadEnv();
  const apiUrl = env.SINGULARITY_DB_URL || "https://<your-api-id>.execute-api.<region>.amazonaws.com";
  const baseUrl = apiUrl.replace(/\/api\/data\/?$/, "");

  console.log(`
${c.bold}🌐 Singularity Engine API${c.reset}

Your API URL: ${c.cyan}${baseUrl}${c.reset}

${c.bold}━━━ Public Builds API ━━━${c.reset}

${c.green}GET${c.reset} ${baseUrl}/api/builds?page=1&per_page=10

  Returns paginated list of deployed apps, sorted by coolness score.

  ${c.bold}Response:${c.reset}
  {
    "builds": [
      {
        "id": "tetris-clone",
        "name": "Tetris Clone",
        "score": 92,
        "query": "build me a tetris game",
        "username": "vibecoderjoe",
        "tweet_url": "https://x.com/vibecoderjoe/status/1234567890",
        "build_url": "https://your-org.github.io/singularity-builds/apps/tetris-clone/"
      }
    ],
    "total": 47,
    "page": 1,
    "per_page": 10
  }

${c.green}GET${c.reset} ${baseUrl}/api/builds/:id

  Returns a single build by ID.

${c.bold}━━━ Raw Key-Value API (SingularityDB) ━━━${c.reset}

${c.green}GET${c.reset}  ${baseUrl}/api/data/:namespace/:key     — Read a value
${c.yellow}POST${c.reset} ${baseUrl}/api/data/:namespace/:key     — Write a value (JSON body)
${c.green}GET${c.reset}  ${baseUrl}/api/data/:namespace            — List all keys in namespace

${c.bold}━━━ Embed on Your Website ━━━${c.reset}

  ${c.dim}// Fetch and display your builds${c.reset}
  const res = await fetch("${baseUrl}/api/builds?per_page=20");
  const { builds } = await res.json();
  builds.forEach(b => {
    console.log(\`\${b.name} (score: \${b.score}) → \${b.build_url}\`);
  });

${c.bold}━━━ cURL Examples ━━━${c.reset}

  ${c.dim}# List builds${c.reset}
  curl "${baseUrl}/api/builds?page=1&per_page=10"

  ${c.dim}# Get single build${c.reset}
  curl "${baseUrl}/api/builds/tetris-clone"

  ${c.dim}# Store custom data${c.reset}
  curl -X POST "${baseUrl}/api/data/myapp/settings" \\
    -H "Content-Type: application/json" \\
    -d '{"theme": "dark", "lang": "en"}'
`);
}

// ── help ─────────────────────────────────────────────────────────────────────
function showHelp() {
  console.log(`
${c.bold}🦀 Singularity Engine${c.reset}
${c.dim}Autonomous tweet-to-app pipeline${c.reset}

${c.bold}Usage:${c.reset} singularityengine <command> [options]

${c.bold}Commands:${c.reset}
  ${c.cyan}config${c.reset}      Interactive setup — auto-detects deps & credentials
  ${c.cyan}watch${c.reset}       Set or show the watched tweet ID
  ${c.cyan}deploy${c.reset}      Deploy infrastructure to AWS (Lambda, DynamoDB, EventBridge)
  ${c.cyan}status${c.reset}      Show infrastructure health, config, and bot status
  ${c.cyan}start${c.reset}       Enable tweet polling (resume after stop)
  ${c.cyan}stop${c.reset}        Disable tweet polling (kill switch, keeps infra)
  ${c.cyan}api${c.reset}         Show API spec for embedding builds on your website
  ${c.cyan}uninstall${c.reset}   Full teardown — delete all AWS resources
  ${c.cyan}update${c.reset}      Self-update from git + reinstall deps

${c.bold}Options:${c.reset}
  ${c.cyan}--dry-run${c.reset}   Preview deploy without making changes
  ${c.cyan}--help${c.reset}      Show this help message

${c.bold}Quick Start:${c.reset}
  ${c.dim}$ singularityengine config              # Set up (auto-detects most things)${c.reset}
  ${c.dim}$ singularityengine deploy              # Deploy to AWS${c.reset}
  ${c.dim}$ singularityengine watch 1234567890    # Set tweet to watch${c.reset}
  ${c.dim}$ singularityengine status              # Verify everything works${c.reset}

${c.bold}Docs:${c.reset} https://github.com/Metatransformer/singularity-engine
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "config": await cmdConfig(); break;
  case "watch": await cmdWatch(args.slice(1)); break;
  case "deploy": await cmdDeploy(args.slice(1)); break;
  case "status": await cmdStatus(); break;
  case "stop": await cmdStop(); break;
  case "start": await cmdStart(); break;
  case "api": cmdApi(); break;
  case "uninstall": await cmdUninstall(); break;
  case "update": await cmdUpdate(); break;
  case "--help": case "-h": case "help": showHelp(); break;
  default:
    if (command) err(`Unknown command: ${command}`);
    showHelp();
    break;
}
