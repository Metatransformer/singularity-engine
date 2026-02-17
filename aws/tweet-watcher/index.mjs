/**
 * Tweet Watcher Lambda
 * Polls X API for replies to the watched tweet, sanitizes, and triggers builds.
 * Triggered by EventBridge every 2 minutes.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const TABLE = process.env.TABLE_NAME || "singularity-db";
const CODE_RUNNER_FN = process.env.CODE_RUNNER_FUNCTION || "singularity-code-runner";
const DEPLOYER_FN = process.env.DEPLOYER_FUNCTION || "singularity-deployer";
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
// Support both WATCHED_TWEET_IDS (new, comma-separated) and WATCHED_TWEET_ID (legacy)
const WATCHED_TWEET_ID = process.env.WATCHED_TWEET_IDS || process.env.WATCHED_TWEET_ID;
// X_BOT_USERNAME takes precedence over OWNER_USERNAME (legacy)
const OWNER_USERNAME = process.env.X_BOT_USERNAME || process.env.OWNER_USERNAME || "metatransformr";
// Configurable trigger keyword (default: singularityengine.ai)
const TRIGGER_KEYWORD = process.env.TRIGGER_KEYWORD || "singularityengine.ai";

// --- Security (shared module) ---
import { sanitizeBuildRequest, getRejectionReply, checkTOS } from "./shared/security.mjs";

// --- State management ---
async function getLastProcessedId() {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_system", key: "last_processed_tweet" },
  }));
  return result.Item?.value?.id || "0";
}

async function setLastProcessedId(id) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ns: "_system", key: "last_processed_tweet", value: { id }, updatedAt: new Date().toISOString() },
  }));
}

async function isAlreadyBuilt(tweetId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_builds", key: tweetId },
  }));
  return !!result.Item;
}

async function getUserBuildCount(username) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const rateLimitKey = `${username}:${today}`;
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_rate_limits", key: rateLimitKey },
  }));
  return result.Item?.value?.count || 0;
}

async function incrementUserBuildCount(username) {
  const today = new Date().toISOString().slice(0, 10);
  const rateLimitKey = `${username}:${today}`;
  const current = await getUserBuildCount(username);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ns: "_rate_limits",
      key: rateLimitKey,
      value: { count: current + 1 },
      updatedAt: new Date().toISOString(),
    },
  }));
}

// --- Trigger detection ---
// Two valid triggers:
// 1. Reply to a registered thread containing "<TRIGGER_KEYWORD> <request>"
// 2. @mention of owner containing "<TRIGGER_KEYWORD> <request>"
// Build regex from TRIGGER_KEYWORD env var
function buildTriggerRegex(keyword) {
  const kw = keyword.replace(/\.ai$/i, ""); // strip .ai suffix for flexible matching
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?:\\.ai)?\\s+(.+)`, "i");
}
const TRIGGER_RE = buildTriggerRegex(TRIGGER_KEYWORD);

function extractBuildRequest(text, tweetMeta) {
  // Try standard keyword match first
  const match = text.match(TRIGGER_RE);
  if (match) return match[1].replace(/^(build\s+me\s+|make\s+me\s+|create\s+|build\s+)/i, "").trim();

  // Fallback: X converts singularityengine.ai to a t.co URL.
  // Look for "build me" after any URL or @mention in watched threads.
  const buildMeMatch = text.match(/(?:https?:\/\/t\.co\/\S+|@\w+)\s+build\s+me\s+(.+)/i);
  if (buildMeMatch) return buildMeMatch[1].trim();

  // Last fallback: just "build me <something>" anywhere in a watched thread reply
  const simpleBuildMe = text.match(/build\s+me\s+(?:a\s+)?(.+)/i);
  if (simpleBuildMe && tweetMeta?.conversationId) {
    const watchedIds = (WATCHED_TWEET_ID || "").split(",").map(s => s.trim());
    if (watchedIds.includes(tweetMeta.conversationId)) {
      return simpleBuildMe[1].trim();
    }
  }

  return null;
}

// --- X API ---
async function fetchReplies(sinceId) {
  // Strategy: search for tweets mentioning "singularityengine.ai" that either:
  // - Are in a watched thread (WATCHED_TWEET_ID can be comma-separated for multiple threads)
  // - Or @mention the owner
  const queries = [];

  // Search keyword for X API query (strip .ai for broader matching)
  const searchKeyword = TRIGGER_KEYWORD.replace(/\.ai$/i, "");

  // Support multiple watched threads (comma-separated)
  const watchedIds = (WATCHED_TWEET_ID || "").split(",").map(s => s.trim()).filter(Boolean);
  for (const threadId of watchedIds) {
    // Search with keyword (catches literal text mentions)
    queries.push(`conversation_id:${threadId} "${searchKeyword}" -is:retweet`);
    // Also search for "build me" in watched threads (catches URL-form keyword like t.co links)
    queries.push(`conversation_id:${threadId} "build me" -is:retweet`);
  }

  // Direct @mentions with the keyword
  queries.push(`@${OWNER_USERNAME} "${searchKeyword}" -is:retweet`);
  // Also catch @mentions with "build me" (URL-form keyword)
  queries.push(`@${OWNER_USERNAME} "build me" -is:retweet`);

  const allTweets = [];
  const seenIds = new Set();

  for (const query of queries) {
    const params = new URLSearchParams({
      query,
      max_results: "20",
      "tweet.fields": "author_id,created_at,in_reply_to_user_id,conversation_id",
      "expansions": "author_id",
      "user.fields": "username",
    });
    if (sinceId !== "0") params.set("since_id", sinceId);

    const url = `https://api.twitter.com/2/tweets/search/recent?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`X API error ${res.status}:`, text);
      continue;
    }

    const data = await res.json();
    if (!data.data) continue;

    const users = {};
    for (const user of data.includes?.users || []) {
      users[user.id] = user.username;
    }

    for (const tweet of data.data) {
      if (seenIds.has(tweet.id)) continue;
      seenIds.add(tweet.id);
      allTweets.push({
        id: tweet.id,
        text: tweet.text,
        authorId: tweet.author_id,
        username: users[tweet.author_id] || "unknown",
        createdAt: tweet.created_at,
        conversationId: tweet.conversation_id,
      });
    }
  }

  return allTweets;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").slice(0, 40);
}

async function invokeLambda(functionName, payload) {
  const result = await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "RequestResponse",
    Payload: JSON.stringify(payload),
  }));
  const response = JSON.parse(new TextDecoder().decode(result.Payload));
  if (response.body) return JSON.parse(response.body);
  return response;
}

// --- Main handler ---
export async function handler() {
  console.log("🔍 Checking for new build requests...");

  const sinceId = await getLastProcessedId();
  const replies = await fetchReplies(sinceId);

  if (replies.length === 0) {
    console.log("No new replies");
    return { processed: 0 };
  }

  console.log(`Found ${replies.length} new replies`);
  let processed = 0;
  let lastId = sinceId;

  for (const reply of replies) {
    if (reply.id > lastId) lastId = reply.id;

    // Skip self-replies (bot responses)
    if (reply.username.toLowerCase() === OWNER_USERNAME.toLowerCase()) {
      console.log(`⏭️ Skipping self-reply from @${reply.username}`);
      continue;
    }

    // Skip if already built
    if (await isAlreadyBuilt(reply.id)) {
      console.log(`⏭️ Already built ${reply.id}`);
      continue;
    }

    // Rate limit: 2 builds per user per day (owner exempt)
    const userBuilds = await getUserBuildCount(reply.username);
    if (userBuilds >= 2 && reply.username.toLowerCase() !== OWNER_USERNAME.toLowerCase()) {
      console.log(`⏭️ Rate limited @${reply.username} (${userBuilds} builds today)`);
      // Queue a rate-limit reply so the user knows
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ns: "_reply_queue",
          key: `${Date.now()}-${reply.id}`,
          value: {
            tweetId: reply.id,
            username: reply.username,
            replyText: `@${reply.username} You've hit your daily limit (2 builds/day). Come back tomorrow! 🦀`,
          },
          updatedAt: new Date().toISOString(),
          status: "pending",
        },
      }));
      continue;
    }

    // Must contain "singularityengine <request>" keyword
    const buildRequest = extractBuildRequest(reply.text, reply);
    if (!buildRequest) {
      console.log(`⏭️ No "singularityengine" keyword from @${reply.username}: "${reply.text.slice(0, 60)}"`);
      continue;
    }

    // Sanitize (uses vard + custom patterns)
    const check = sanitizeBuildRequest(buildRequest);
    if (!check.safe) {
      console.log(`❌ Rejected @${reply.username}: ${check.reason} — "${buildRequest.slice(0, 50)}"`);
      
      // Queue a rejection reply so the user knows why
      const rejectionText = getRejectionReply(reply.username, check.category);
      if (rejectionText) {
        await ddb.send(new PutCommand({
          TableName: TABLE,
          Item: {
            ns: "_reply_queue",
            key: `${Date.now()}-${reply.id}`,
            value: { tweetId: reply.id, username: reply.username, replyText: rejectionText },
            updatedAt: new Date().toISOString(),
            status: "pending",
          },
        }));
        console.log(`📬 Rejection reply queued for @${reply.username}`);
      }

      // Log to abuse table for monitoring
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ns: "_rejected",
          key: `${reply.id}`,
          value: { username: reply.username, request: buildRequest.slice(0, 200), reason: check.reason, category: check.category },
          updatedAt: new Date().toISOString(),
        },
      }));
      continue;
    }

    // Layer 2: LLM-based TOS check (Haiku — fast + cheap)
    const tosCheck = await checkTOS(check.cleaned);
    if (!tosCheck.safe) {
      console.log(`❌ TOS violation @${reply.username}: ${tosCheck.reason}`);
      const rejectionText = `@${reply.username} 🦀 Your request was flagged by our content policy. ${tosCheck.reason || "Please try a different idea!"}`;
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ns: "_reply_queue",
          key: `${Date.now()}-${reply.id}`,
          value: { tweetId: reply.id, username: reply.username, replyText: rejectionText },
          updatedAt: new Date().toISOString(),
          status: "pending",
        },
      }));
      await ddb.send(new PutCommand({
        TableName: TABLE,
        Item: {
          ns: "_rejected",
          key: `${reply.id}`,
          value: { username: reply.username, request: check.cleaned.slice(0, 200), reason: tosCheck.reason, category: tosCheck.category },
          updatedAt: new Date().toISOString(),
        },
      }));
      continue;
    }

    const appId = `${reply.username}-${slugify(check.cleaned).slice(0, 25)}-${reply.id.slice(-6)}`;
    console.log(`🔨 Building for @${reply.username}: "${check.cleaned}" (${appId})`);

    try {
      const buildResult = await invokeLambda(CODE_RUNNER_FN, {
        request: check.cleaned,
        appId,
        tweetId: reply.id,
        userId: reply.username,
      });

      if (!buildResult.ok) {
        console.error(`❌ Build failed for @${reply.username}:`, buildResult.error);
        continue;
      }

      const deployResult = await invokeLambda(DEPLOYER_FN, {
        html: buildResult.html,
        appId,
        tweetId: reply.id,
        username: reply.username,
        request: check.cleaned,
        channel: "x",
      });

      if (!deployResult.ok) {
        console.error(`❌ Deploy failed:`, deployResult.error);
        continue;
      }

      await incrementUserBuildCount(reply.username);
      processed++;
      console.log(`✅ @${reply.username}: ${deployResult.appUrl}`);
    } catch (err) {
      console.error(`❌ Error processing @${reply.username}:`, err.message);
    }
  }

  await setLastProcessedId(lastId);
  console.log(`Done. ${processed}/${replies.length} built.`);
  return { processed, total: replies.length };
}
