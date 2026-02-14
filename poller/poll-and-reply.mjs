#!/usr/bin/env node
/**
 * SingularityEngine Reply Poller
 * Polls DynamoDB _reply_queue, replies via OpenClaw browser tool (CDP on :18800).
 * No relay server, no inbound connections. Just outbound HTTPS.
 *
 * Usage: node poll-and-reply.mjs [--once] [--interval 30]
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { postReply as xApiPostReply, loadCredentialsFromEnv } from "../shared/x-api-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.SINGULARITY_DB_URL || "https://your-api-gateway.execute-api.us-east-1.amazonaws.com/api/data";
const INTERVAL_MS = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--interval") || "45") * 1000;
const ONCE = process.argv.includes("--once");
const REPLY_MODE = process.env.REPLY_MODE || "openclaw";
const COOLDOWN_MS = 60_000;
const DONE_DIR = join(__dirname, "done");
const PENDING_DIR = join(__dirname, "pending-replies");

if (!existsSync(DONE_DIR)) mkdirSync(DONE_DIR, { recursive: true });
if (!existsSync(PENDING_DIR)) mkdirSync(PENDING_DIR, { recursive: true });

let lastReplyAt = 0;

function isDone(queueKey) {
  return existsSync(join(DONE_DIR, `${queueKey.replace(/[/\\:]/g, "_")}.done`));
}

function markLocalDone(queueKey) {
  writeFileSync(join(DONE_DIR, `${queueKey.replace(/[/\\:]/g, "_")}.done`), new Date().toISOString());
}

async function fetchPendingReplies() {
  const res = await fetch(`${API}/_reply_queue`);
  const data = await res.json();
  if (!data.keys?.length) return [];

  const items = [];
  for (const k of data.keys) {
    if (isDone(k.key)) continue;
    const r = await fetch(`${API}/_reply_queue/${k.key}`);
    const d = await r.json();
    if (d.value) {
      // Skip showcase items (those are pre-built, not real tweet replies)
      if (d.value.tweetId === "showcase") {
        markLocalDone(k.key);
        continue;
      }
      items.push({ queueKey: k.key, ...d.value });
    }
  }
  return items;
}

async function markDone(queueKey) {
  markLocalDone(queueKey);
  // Also update in DynamoDB
  try {
    const res = await fetch(`${API}/_reply_queue/${queueKey}`);
    const data = await res.json();
    await fetch(`${API}/_reply_queue/${queueKey}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: { ...data.value, repliedAt: new Date().toISOString() }, status: "done" }),
    });
  } catch (err) {
    console.log(`  ⚠️ DynamoDB update failed (local marked done): ${err.message}`);
  }
}

async function replyViaXApi(item) {
  const { tweetId, username, appUrl, request } = item;
  const replyText = item.replyText || `@${username} Done! ✨\n\n${appUrl}\n\nBuilt by SingularityEngine 🦀\nhttps://github.com/Metatransformer/singularity-engine`;
  console.log(`  🐦 [x-api] Replying to @${username} (tweet ${tweetId})`);

  const creds = loadCredentialsFromEnv();
  if (!creds) {
    console.error("  ❌ X API credentials not configured. Set X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
    return false;
  }

  const result = await xApiPostReply(tweetId, replyText, creds);
  if (result.ok) {
    console.log(`  ✅ Reply posted: ${result.tweetId}`);
    return true;
  } else {
    console.error(`  ❌ X API error: ${result.error}`);
    return false;
  }
}

async function replyViaCDP(item) {
  const { tweetId, username, appUrl, request } = item;
  const ownerUsername = process.env.OWNER_USERNAME || "your_x_username";
  const tweetUrl = `https://x.com/${ownerUsername}/status/${tweetId}`;
  const replyText = item.replyText || `@${username} Done! ✨\n\n${appUrl}\n\nBuilt by SingularityEngine 🦀\nhttps://github.com/Metatransformer/singularity-engine`;

  console.log(`  🐦 Replying to @${username} → ${tweetUrl}`);

  try {
    // Get available tabs from OpenClaw browser
    const tabsRes = await fetch("http://127.0.0.1:18800/json");
    const tabs = await tabsRes.json();

    // Find or create a tab for X
    let targetId = null;
    const xTab = tabs.find(t => t.type === "page" && t.url.includes("x.com"));
    if (xTab) {
      targetId = xTab.id;
    }

    // Navigate to the tweet
    const navUrl = `http://127.0.0.1:18800/json/new?${encodeURIComponent(tweetUrl)}`;
    const newTab = await (await fetch(navUrl)).json();
    targetId = newTab.id;

    // Wait for page load
    await new Promise(r => setTimeout(r, 5000));

    // Use the OpenClaw browser tool via openclaw CLI for the actual typing
    // This is more reliable than raw CDP for X's contentEditable
    const replyJson = JSON.stringify({ tweetUrl, replyText, targetId });
    writeFileSync(join(PENDING_DIR, `${tweetId}.json`), JSON.stringify({
      tweetId, tweetUrl, username, replyText, appUrl, request,
      cdpTargetId: targetId,
      createdAt: new Date().toISOString(),
    }, null, 2));

    console.log(`  📝 Queued for OpenClaw browser reply: ${tweetId}`);
    return true; // Will be picked up by cron/heartbeat for actual browser automation
  } catch (err) {
    console.error(`  ❌ CDP connection failed: ${err.message}`);
    // Still save the reply file
    writeFileSync(join(PENDING_DIR, `${tweetId}.json`), JSON.stringify({
      tweetId, tweetUrl: `https://x.com/${process.env.OWNER_USERNAME || "your_x_username"}/status/${tweetId}`,
      username, replyText, appUrl, request,
      createdAt: new Date().toISOString(),
    }, null, 2));
    return true; // Saved for pickup
  }
}

async function poll() {
  try {
    const pending = await fetchPendingReplies();
    if (pending.length === 0) {
      process.stdout.write(".");
      return;
    }

    console.log(`\n📬 ${pending.length} pending replies`);

    for (const item of pending) {
      const timeSinceLast = Date.now() - lastReplyAt;
      if (timeSinceLast < COOLDOWN_MS) {
        const wait = COOLDOWN_MS - timeSinceLast;
        console.log(`  ⏳ Cooldown ${(wait / 1000).toFixed(0)}s...`);
        await new Promise(r => setTimeout(r, wait));
      }

      const saved = REPLY_MODE === "x-api" ? await replyViaXApi(item) : await replyViaCDP(item);
      if (saved) {
        await markDone(item.queueKey);
        lastReplyAt = Date.now();
      }
    }
  } catch (err) {
    console.error(`\n❌ Poll error: ${err.message}`);
  }
}

// Check for pending reply files and process them via OpenClaw
async function processPendingFiles() {
  if (!existsSync(PENDING_DIR)) return;
  const files = readdirSync(PENDING_DIR).filter(f => f.endsWith(".json"));
  if (files.length === 0) return;

  console.log(`\n📂 ${files.length} pending reply files to process`);
  // These will be picked up by the OpenClaw heartbeat/cron
  // Just log them for visibility
  for (const f of files) {
    const data = JSON.parse(readFileSync(join(PENDING_DIR, f), "utf-8"));
    console.log(`  📝 ${f}: @${data.username} → ${data.appUrl}`);
  }
}

// Main
console.log(`🚀 SingularityEngine Reply Poller`);
console.log(`   API: ${API}`);
console.log(`   Interval: ${INTERVAL_MS / 1000}s`);
console.log(`   Mode: ${ONCE ? "once" : "continuous"}`);
console.log(`   Reply mode: ${REPLY_MODE} ${REPLY_MODE === "x-api" ? "(X API v2 direct)" : "(OpenClaw browser)"}`);
console.log(`   Pending dir: ${PENDING_DIR}\n`);

if (ONCE) {
  await poll();
  await processPendingFiles();
  console.log("\nDone.");
} else {
  await poll();
  setInterval(poll, INTERVAL_MS);
  console.log("Polling...");
}
