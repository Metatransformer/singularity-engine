/**
 * Web Builder Lambda
 * HTTP endpoint for triggering builds from the website (not just Twitter).
 * POST /api/build { prompt: string }
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const lambda = new LambdaClient({});

const TABLE = process.env.TABLE_NAME || "singularity-db";
const CODE_RUNNER_FN = process.env.CODE_RUNNER_FUNCTION || "singularity-code-runner";
const DEPLOYER_FN = process.env.DEPLOYER_FUNCTION || "singularity-deployer";
const WEB_BUILD_TOKEN = process.env.WEB_BUILD_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://singularityengine.ai,https://metatransformer.github.io").split(",");

function cors(body, status = 200, origin = "*") {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-SE-Token",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function getClientIP(event) {
  return event.requestContext?.http?.sourceIp || 
         event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || 
         "unknown";
}

async function checkRateLimit(ip) {
  const key = `web-${ip}-${new Date().toISOString().slice(0, 10)}`;
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_rate_limits", key },
  }));
  const count = result.Item?.value?.count || 0;
  if (count >= 2) return false;
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ns: "_rate_limits", key, value: { count: count + 1 }, updatedAt: new Date().toISOString() },
  }));
  return true;
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

export async function handler(event) {
  const origin = event.headers?.origin || "";

  // CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return cors({}, 204, origin);
  }

  try {
    // Anti-bot token check
    const token = event.headers?.["x-se-token"] || event.headers?.["X-SE-Token"] || "";
    if (WEB_BUILD_TOKEN && token !== WEB_BUILD_TOKEN) {
      return cors({ ok: false, error: "Unauthorized" }, 401, origin);
    }

    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    const prompt = (body.prompt || "").trim();

    if (!prompt || prompt.length < 3) {
      return cors({ ok: false, error: "Prompt too short (min 3 chars)" }, 400, origin);
    }
    if (prompt.length > 200) {
      return cors({ ok: false, error: "Prompt too long (max 200 chars)" }, 400, origin);
    }

    // Rate limit by IP
    const ip = getClientIP(event);
    const allowed = await checkRateLimit(ip);
    if (!allowed) {
      return cors({ ok: false, error: "Rate limit: 2 builds per day. Come back tomorrow!" }, 429, origin);
    }

    // Sanitize using shared security module
    const { sanitizeBuildRequest } = await import("./shared/security.mjs");
    const check = sanitizeBuildRequest(prompt);
    if (!check.safe) {
      return cors({ ok: false, error: "Request rejected: " + (check.category || "security") }, 400, origin);
    }

    const appId = `web-${slugify(check.cleaned).slice(0, 30)}-${Date.now().toString(36)}`;

    // Build
    const buildResult = await invokeLambda(CODE_RUNNER_FN, {
      request: check.cleaned,
      appId,
      tweetId: `web-${Date.now()}`,
      userId: "web",
    });

    if (!buildResult.ok) {
      return cors({ ok: false, error: "Build failed: " + (buildResult.error || "unknown") }, 500, origin);
    }

    // Deploy
    const deployResult = await invokeLambda(DEPLOYER_FN, {
      html: buildResult.html,
      appId,
      tweetId: `web-${Date.now()}`,
      username: "web",
      request: check.cleaned,
    });

    if (!deployResult.ok) {
      return cors({ ok: false, error: "Deploy failed" }, 500, origin);
    }

    return cors({
      ok: true,
      appId,
      buildUrl: deployResult.appUrl || `https://metatransformer.github.io/singularity-builds/apps/${appId}/`,
      prompt: check.cleaned,
    }, 200, origin);

  } catch (err) {
    console.error("Web build error:", err);
    return cors({ ok: false, error: "Internal error" }, 500, origin);
  }
}
