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

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "singularity-db";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "Metatransformer/singularity-builds";
const GITHUB_PAGES_URL = process.env.GITHUB_PAGES_URL || "https://your-org.github.io/singularity-builds";
const RELAY_URL = process.env.RELAY_URL;
const RELAY_SECRET = process.env.RELAY_SECRET;

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
  const path = `apps/${appId}/index.html`;
  const content = Buffer.from(html).toString("base64");

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `🤖 Deploy ${appId}`,
        content,
        branch: "main",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text}`);
  }

  return `${GITHUB_PAGES_URL}/apps/${appId}/`;
}

async function queueReply(tweetId, username, appUrl, request) {
  // Store in DynamoDB reply queue
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ns: "_reply_queue",
      key: `${Date.now()}-${tweetId}`,
      value: {
        tweetId, username, appUrl, request,
        replyText: `@${username} Done! ✨\n\n${appUrl}\n\nBuilt by SingularityEngine 🦀\nhttps://github.com/Metatransformer/singularity-engine`,
      },
      updatedAt: new Date().toISOString(),
      status: "pending",
    },
  }));

  // Also try to notify local relay immediately (best-effort)
  if (RELAY_URL) {
    try {
      await fetch(`${RELAY_URL}/queue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Relay-Secret": RELAY_SECRET,
        },
        body: JSON.stringify({ tweetId, username, appUrl, request }),
      });
    } catch (err) {
      console.log("Relay notification failed (will be picked up by polling):", err.message);
    }
  }
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
