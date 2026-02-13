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

  console.log("\n🌐 OpenClaw (optional)");
  config.OPENCLAW_CDP_PORT = await ask("  CDP port", "18800");

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
