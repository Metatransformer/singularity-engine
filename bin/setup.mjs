#!/usr/bin/env node
/**
 * Interactive setup for Singularity Engine
 * Prompts for config values, validates tokens, writes .env
 */

import { createInterface } from "readline";
import { writeFileSync, existsSync } from "fs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q, def) => new Promise(resolve => {
  const prompt = def ? `${q} [${def}]: ` : `${q}: `;
  rl.question(prompt, answer => resolve(answer.trim() || def || ""));
});

async function main() {
  console.log("🦀 Singularity Engine Setup\n");

  if (existsSync(".env")) {
    const overwrite = await ask("⚠️  .env already exists. Overwrite? (y/N)", "N");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  const config = {};

  console.log("\n📱 X (Twitter) API");
  config.X_BEARER_TOKEN = await ask("  Bearer token");
  config.WATCHED_TWEET_ID = await ask("  Tweet ID to watch for replies");
  config.OWNER_USERNAME = await ask("  Your X username (without @)");

  console.log("\n☁️  AWS");
  config.AWS_REGION = await ask("  Region", "us-east-1");
  config.TABLE_NAME = await ask("  DynamoDB table name", "singularity-db");

  console.log("\n🐙 GitHub");
  config.GITHUB_TOKEN = await ask("  Personal access token (repo scope)");
  config.GITHUB_REPO = await ask("  Builds repo (org/name)", "your-org/singularity-builds");
  config.GITHUB_PAGES_URL = await ask("  GitHub Pages URL", `https://${config.GITHUB_REPO.split("/")[0]}.github.io/${config.GITHUB_REPO.split("/")[1]}`);

  console.log("\n🤖 Anthropic");
  config.ANTHROPIC_API_KEY = await ask("  API key");

  console.log("\n🗄️  SingularityDB");
  config.SINGULARITY_DB_URL = await ask("  API Gateway URL (set after deploy-aws.sh)");

  console.log("\n📤 Reply Mode");
  console.log("  openclaw = browser automation (default, no API write access needed)");
  console.log("  x-api    = X API v2 direct posting (fast, scalable)");
  config.REPLY_MODE = await ask("  Reply mode", "openclaw");

  if (config.REPLY_MODE === "x-api") {
    console.log("\n🔑 X API OAuth 1.0a (get these from developer.x.com)");
    config.X_CONSUMER_KEY = await ask("  Consumer Key (API Key)");
    config.X_CONSUMER_SECRET = await ask("  Consumer Secret (API Secret)");
    config.X_ACCESS_TOKEN = await ask("  Access Token");
    config.X_ACCESS_TOKEN_SECRET = await ask("  Access Token Secret");
  }

  console.log("\n🌐 OpenClaw (optional, used for openclaw reply mode)");
  config.OPENCLAW_CDP_PORT = await ask("  CDP port", "18800");

  // Validate X API OAuth credentials
  if (config.REPLY_MODE === "x-api" && config.X_CONSUMER_KEY) {
    process.stdout.write("🔍 Validating X API OAuth credentials... ");
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
      console.log(`❌ (${e.message})`);
    }
  }

  // Validate X token
  if (config.X_BEARER_TOKEN) {
    process.stdout.write("\n🔍 Validating X API token... ");
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
    process.stdout.write("🔍 Validating GitHub token... ");
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

  // Write .env
  const envContent = Object.entries(config)
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
  console.log("  1. Run ./deploy-aws.sh (if you haven't)");
  console.log("  2. Set Lambda env vars (script prints commands)");
  console.log("  3. Start poller: node poller/poll-and-reply.mjs");
  console.log("  4. Tweet a build request!");

  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
