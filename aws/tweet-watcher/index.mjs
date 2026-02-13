/**
 * Tweet Watcher Lambda
 * Polls X API for replies to the watched tweet, sanitizes, and triggers builds.
 * Triggered by EventBridge every 2 minutes.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const TABLE = process.env.TABLE_NAME || "singularity-db";
const CODE_RUNNER_FN = process.env.CODE_RUNNER_FUNCTION || "singularity-code-runner";
const DEPLOYER_FN = process.env.DEPLOYER_FUNCTION || "singularity-deployer";
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;
const WATCHED_TWEET_ID = process.env.WATCHED_TWEET_ID;
const OWNER_USERNAME = process.env.OWNER_USERNAME || "your_x_username"; // Skip self-replies

// --- Injection detection ---
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all|prior)\s+(instructions|prompts|rules)/i,
  /system\s*prompt/i,
  /you\s+are\s+(now|a)\s/i,
  /pretend\s+(you|to\s+be)/i,
  /act\s+as\s+(if|a|an)/i,
  /\bsudo\b/i,
  /\brm\s+-rf\b/i,
  /process\.env/i,
  /require\s*\(\s*['"](fs|child_process|os|net)/i,
  /credentials/i,
  /api[_\s]*key/i,
  /secret[_\s]*key/i,
  /password/i,
  /eval\s*\(/i,
  /exec\s*\(/i,
  /\bmalware\b/i,
  /\bphishing\b/i,
  /\bransomware\b/i,
  /\bkeylogger\b/i,
  /\bcrypto\s*miner\b/i,
  /steal|exfiltrate|scrape\s+user/i,
];

const BLOCKED_REQUESTS = [
  /porn/i, /nsfw/i, /nude/i, /xxx/i, /sex/i,
  /weapon/i, /bomb/i, /drug/i, /hack\s*(er|ing)/i,
  /ddos/i, /exploit/i, /vulnerability\s*scanner/i,
  /fake\s*(login|bank|paypal|amazon)/i,
  /credit\s*card\s*(skimmer|stealer)/i,
];

function sanitize(text) {
  if (!text || text.length > 500) return { safe: false, reason: "too long or empty" };
  
  for (const p of INJECTION_PATTERNS) {
    if (p.test(text)) return { safe: false, reason: "injection detected" };
  }
  for (const p of BLOCKED_REQUESTS) {
    if (p.test(text)) return { safe: false, reason: "blocked content" };
  }

  const cleaned = text
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s.,!?'"():;\-+=#@/&%$*~\[\]{}|\\]/g, "")
    .trim();

  if (cleaned.length < 3) return { safe: false, reason: "too short" };
  return { safe: true, cleaned };
}

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
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "ns = :ns AND begins_with(#k, :prefix)",
    ExpressionAttributeNames: { "#k": "key" },
    ExpressionAttributeValues: { ":ns": "_builds", ":prefix": username },
  }));
  // Check builds in last hour
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const recent = (result.Items || []).filter(i => i.updatedAt > oneHourAgo);
  return recent.length;
}

// --- X API ---
async function fetchReplies(sinceId) {
  if (!WATCHED_TWEET_ID) {
    console.log("No WATCHED_TWEET_ID set");
    return [];
  }

  // Only get direct replies to the watched tweet (not replies to replies)
  const query = `conversation_id:${WATCHED_TWEET_ID} in_reply_to_tweet_id:${WATCHED_TWEET_ID} -is:retweet`;
  const params = new URLSearchParams({
    query,
    max_results: "20",
    "tweet.fields": "author_id,created_at,in_reply_to_user_id",
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
    return [];
  }

  const data = await res.json();
  if (!data.data) return [];

  const users = {};
  for (const user of data.includes?.users || []) {
    users[user.id] = user.username;
  }

  return data.data.map(tweet => ({
    id: tweet.id,
    text: tweet.text,
    authorId: tweet.author_id,
    username: users[tweet.author_id] || "unknown",
    createdAt: tweet.created_at,
  }));
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

    // Rate limit: 2 builds per user per hour (owner exempt)
    const userBuilds = await getUserBuildCount(reply.username);
    if (userBuilds >= 2) {
      console.log(`⏭️ Rate limited @${reply.username} (${userBuilds} builds this hour)`);
      continue;
    }

    // Clean up tweet text — remove @mentions, "build me" prefixes
    const rawText = reply.text.replace(/^(@\w+\s*)+/, "").trim();
    const buildRequest = rawText
      .replace(/^(build\s+me\s+|make\s+me\s+|create\s+|build\s+|i\s+want\s+|can\s+you\s+(build|make)\s+)/i, "")
      .trim();

    // Sanitize
    const check = sanitize(buildRequest);
    if (!check.safe) {
      console.log(`❌ Rejected @${reply.username}: ${check.reason} — "${buildRequest.slice(0, 50)}"`);
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
      });

      if (!deployResult.ok) {
        console.error(`❌ Deploy failed:`, deployResult.error);
        continue;
      }

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
