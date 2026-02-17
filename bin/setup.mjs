#!/usr/bin/env node
/**
 * Interactive setup for Singularity Engine
 * Simplified for self-hosters: bot identity, AI provider, AWS, GitHub
 */

import { createInterface } from "readline";
import { writeFileSync, existsSync } from "fs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(resolve => {
  const prompt = def ? `${q} [${def}]: ` : `${q}: `;
  rl.question(prompt, answer => resolve(answer.trim() || def || ""));
});

async function main() {
  console.log("🔮 Singularity Engine Setup\n");
  console.log("This will create a .env file with your configuration.\n");

  if (existsSync(".env")) {
    const overwrite = await ask("⚠️  .env already exists. Overwrite? (y/N)", "N");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const config = {};

  // ── Bot Identity ──────────────────────────────────────────────
  console.log("━━━ 🤖 Bot Identity ━━━");
  config.OWNER_USERNAME = await ask("  Your bot's X/Twitter username (without @)");

  console.log("\n  OAuth 1.0a credentials (get these from developer.x.com):");
  config.X_CONSUMER_KEY = await ask("  Consumer Key (API Key)");
  config.X_CONSUMER_SECRET = await ask("  Consumer Secret (API Secret)");
  config.X_ACCESS_TOKEN = await ask("  Access Token");
  config.X_ACCESS_TOKEN_SECRET = await ask("  Access Token Secret");

  // Bearer token derived or entered
  config.X_BEARER_TOKEN = await ask("  Bearer Token (for reading tweets)");

  // Always x-api for self-hosters
  config.REPLY_MODE = "x-api";

  // ── AI Provider ───────────────────────────────────────────────
  console.log("\n━━━ 🧠 AI Provider ━━━");
  console.log("  Choose your AI provider for code generation:");
  console.log("  1) Anthropic (default)");
  console.log("  2) OpenAI");
  const providerChoice = await ask("  Provider (1 or 2)", "1");

  if (providerChoice === "2") {
    config.AI_PROVIDER = "openai";
    config.OPENAI_API_KEY = await ask("  OpenAI API key");
  } else {
    config.AI_PROVIDER = "anthropic";
    config.ANTHROPIC_API_KEY = await ask("  Anthropic API key");
  }

  // ── AWS ───────────────────────────────────────────────────────
  console.log("\n━━━ ☁️  AWS ━━━");
  console.log("  These will be configured automatically by deploy-aws.sh.");
  config.AWS_REGION = await ask("  AWS region", "us-east-1");
  config.TABLE_NAME = await ask("  DynamoDB table name", "singularity-db");

  // ── GitHub ────────────────────────────────────────────────────
  console.log("\n━━━ 🐙 GitHub ━━━");
  config.GITHUB_TOKEN = await ask("  Personal access token (repo scope)");
  config.GITHUB_REPO = await ask("  Builds repo (org/name)", `${config.OWNER_USERNAME}/singularity-builds`);
  config.GITHUB_PAGES_URL = `https://${config.GITHUB_REPO.split("/")[0]}.github.io/${config.GITHUB_REPO.split("/")[1]}`;
  console.log(`  GitHub Pages URL: ${config.GITHUB_PAGES_URL}`);

  // Auto-configured values (set after deploy-aws.sh)
  config.SINGULARITY_DB_URL = "";

  // ── Validation ────────────────────────────────────────────────
  console.log("\n━━━ 🔍 Validating ━━━");

  // Validate X API OAuth credentials
  if (config.X_CONSUMER_KEY) {
    process.stdout.write("  X API OAuth... ");
    try {
      const { validateCredentials } = await import("../shared/x-api-client.mjs");
      const result = await validateCredentials({
        consumerKey: config.X_CONSUMER_KEY,
        consumerSecret: config.X_CONSUMER_SECRET,
        accessToken: config.X_ACCESS_TOKEN,
        accessTokenSecret: config.X_ACCESS_TOKEN_SECRET,
      });
      console.log(result.ok ? `✅ (@${result.username})` : `❌ (${result.error})`);
    } catch (e) {
      console.log(`⚠️  Could not validate (${e.message})`);
    }
  }

  // Validate X bearer token
  if (config.X_BEARER_TOKEN) {
    process.stdout.write("  X Bearer Token... ");
    try {
      const res = await fetch("https://api.twitter.com/2/tweets/search/recent?query=test&max_results=10", {
        headers: { Authorization: `Bearer ${config.X_BEARER_TOKEN}` },
      });
      console.log(res.ok ? "✅" : `❌ (${res.status})`);
    } catch (e) {
      console.log(`❌ (${e.message})`);
    }
  }

  // Validate GitHub token
  if (config.GITHUB_TOKEN) {
    process.stdout.write("  GitHub token... ");
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${config.GITHUB_TOKEN}` },
      });
      if (res.ok) {
        const user = await res.json();
        console.log(`✅ (${user.login})`);
      } else {
        console.log(`❌ (${res.status})`);
      }
    } catch (e) {
      console.log(`❌ (${e.message})`);
    }
  }

  // ── Write .env ────────────────────────────────────────────────
  const envContent = Object.entries(config)
    .filter(([_, v]) => v) // skip empty values
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";

  writeFileSync(".env", envContent);
  console.log("\n✅ .env written!");

  const deploy = await ask("\nRun deploy-aws.sh now? (y/N)", "N");
  if (deploy.toLowerCase() === "y") {
    const { execSync } = await import("child_process");
    execSync("bash deploy-aws.sh", { stdio: "inherit" });
  }

  console.log("\n🎉 Setup complete! Next steps:");
  console.log("  1. Run ./deploy-aws.sh (sets up AWS + updates .env with API URL)");
  console.log("  2. Start poller: node poller/poll-and-reply.mjs");
  console.log("  3. Tweet a build request at your bot!");

  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
