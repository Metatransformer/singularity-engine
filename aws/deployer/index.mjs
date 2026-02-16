/**
 * Deployer Lambda
 * Takes generated HTML, pushes to GitHub Pages, queues reply to local relay.
 * 
 * Flow:
 * 1. Receive HTML + metadata from code runner
 * 2. Push to GitHub repo (metatransformer/singularity-builds)
 * 3. Queue reply to local relay endpoint
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { postReply as xApiPostReply } from "./shared/x-api-client.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "singularity-db";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "Metatransformer/singularity-builds";
const GITHUB_PAGES_URL = process.env.GITHUB_PAGES_URL || "https://your-org.github.io/singularity-builds";
const REPLY_MODE = process.env.REPLY_MODE || "openclaw";
const X_CONSUMER_KEY = process.env.X_CONSUMER_KEY;
const X_CONSUMER_SECRET = process.env.X_CONSUMER_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

function rateCoolness(request, htmlSize) {
  let score = 50; // base
  const lower = request.toLowerCase();
  // Games are cool
  if (/game|tetris|snake|pong|breakout|chess|puzzle/i.test(lower)) score += 25;
  // Interactive/visual apps
  if (/dashboard|visualiz|animation|3d|canvas|chart/i.test(lower)) score += 20;
  // Tools with utility
  if (/calculator|timer|converter|tracker|editor/i.test(lower)) score += 15;
  // Social/collaborative
  if (/social|chat|collab|multi|shared/i.test(lower)) score += 20;
  // Bigger = more complex = cooler
  if (htmlSize > 15000) score += 10;
  if (htmlSize > 25000) score += 10;
  // Cap at 99
  return Math.min(99, Math.max(10, score));
}

async function pushToGitHub(appId, html) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN not configured");
  if (!html || html.length < 50) throw new Error("Generated HTML is too small to deploy");

  const path = `apps/${appId}/index.html`;
  const content = Buffer.from(html).toString("base64");
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Check if file already exists (need SHA for updates)
  let sha;
  try {
    const existing = await fetch(apiUrl, { headers });
    if (existing.ok) {
      const data = await existing.json();
      sha = data.sha;
    }
  } catch {
    // File doesn't exist yet — that's fine
  }

  const body = {
    message: `Deploy ${appId}`,
    content,
    branch: "main",
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return `${GITHUB_PAGES_URL}/apps/${appId}/`;
}

async function queueReply(tweetId, username, appUrl, request) {
  const replyText = `@${username} Done! ✨\n\n${appUrl}\n\nBuilt by SingularityEngine 🦀\nhttps://github.com/Metatransformer/singularity-engine`;

  // Try posting directly via X API if configured
  if (REPLY_MODE === "x-api" && X_CONSUMER_KEY && X_ACCESS_TOKEN) {
    try {
      const result = await xApiPostReply(tweetId, replyText, {
        consumerKey: X_CONSUMER_KEY,
        consumerSecret: X_CONSUMER_SECRET,
        accessToken: X_ACCESS_TOKEN,
        accessTokenSecret: X_ACCESS_TOKEN_SECRET,
      });
      if (result.ok) {
        console.log(`✅ Reply posted via X API: ${result.tweetId}`);
        // Still log to reply queue as "done"
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            ns: "_reply_queue",
            key: `${Date.now()}-${tweetId}`,
            value: { tweetId, username, appUrl, request, replyText, replyTweetId: result.tweetId },
            updatedAt: new Date().toISOString(),
            status: "done",
          },
        }));
        return;
      }
      console.log(`⚠️ X API reply failed: ${result.error}, falling back to queue`);
    } catch (err) {
      console.log(`⚠️ X API reply error: ${err.message}, falling back to queue`);
    }
  }

  // Fallback: queue for local poller pickup
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ns: "_reply_queue",
      key: `${Date.now()}-${tweetId}`,
      value: { tweetId, username, appUrl, request, replyText },
      updatedAt: new Date().toISOString(),
      status: "pending",
    },
  }));
}

export async function handler(event) {
  try {
    const { html, appId, tweetId, username, request } = typeof event.body === "string"
      ? JSON.parse(event.body)
      : event;

    console.log(`📦 Deploying ${appId} for @${username}...`);

    // Push to GitHub Pages
    const appUrl = await pushToGitHub(appId, html);
    console.log(`✅ Deployed: ${appUrl}`);

    // Queue reply
    await queueReply(tweetId, username, appUrl, request);
    console.log(`📬 Reply queued for @${username}`);

    // Log the build
    const now = new Date().toISOString();
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ns: "_builds",
        key: appId,
        value: {
          appId,
          tweetId,
          username,
          request,
          appUrl,
          deployedAt: now,
          htmlSize: html.length,
        },
        updatedAt: now,
      },
    }));

    // Write to _showcase for public gallery (rate coolness based on complexity + fun)
    const score = rateCoolness(request, html.length);
    const name = request.length > 50 ? request.slice(0, 47) + "..." : request;
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ns: "_showcase",
        key: appId,
        value: {
          name,
          score,
          query: request,
          username,
          tweet_url: tweetId ? `https://x.com/${username}/status/${tweetId}` : "",
          build_url: appUrl,
          builtAt: now,
          htmlSize: html.length,
        },
        updatedAt: now,
      },
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, appUrl, appId }),
    };
  } catch (err) {
    console.error("Deploy failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
}
