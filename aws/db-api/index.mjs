/**
 * MetatransformrDB API Lambda
 * Serves build data from DynamoDB for embedding on websites.
 *
 * Routes:
 *   GET  /api/builds?page=1&per_page=10           — paginated builds list (public gallery)
 *   GET  /api/builds/:id                           — single build by ID
 *   GET  /api/data/:namespace/:key                 — raw key-value get (MetatransformrDB)
 *   POST /api/data/:namespace/:key  {value}        — raw key-value put (MetatransformrDB)
 *   GET  /api/data/:namespace                      — list keys in namespace
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "metatransformr-db";

// System namespaces that cannot be written to via the public API
const PROTECTED_NAMESPACES = new Set(["_system", "_builds", "_reply_queue", "_showcase"]);

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function getBuilds(page, perPage) {
  // Query _showcase namespace, sorted by coolness
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "ns = :ns",
    ExpressionAttributeValues: { ":ns": "_showcase" },
  }));

  const items = (result.Items || [])
    .sort((a, b) => (b.value?.score || 0) - (a.value?.score || 0));

  const total = items.length;
  const start = (page - 1) * perPage;
  const paged = items.slice(start, start + perPage);

  const builds = paged.map((item) => ({
    id: item.key,
    name: item.value?.name || item.key,
    score: item.value?.score || item.value?.coolness || 50,
    query: item.value?.query || item.value?.request || "",
    username: item.value?.username || "",
    tweet_url: item.value?.tweetUrl || item.value?.tweet_url || "",
    build_url: item.value?.buildUrl || item.value?.build_url || item.value?.url || "",
  }));

  return { builds, total, page, per_page: perPage };
}

async function getBuild(id) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_showcase", key: id },
  }));
  if (!result.Item) return null;
  const item = result.Item;
  return {
    id: item.key,
    name: item.value?.name || item.key,
    score: item.value?.score || item.value?.coolness || 50,
    query: item.value?.query || item.value?.request || "",
    username: item.value?.username || "",
    tweet_url: item.value?.tweetUrl || item.value?.tweet_url || "",
    build_url: item.value?.buildUrl || item.value?.build_url || item.value?.url || "",
  };
}

async function getData(ns, key) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns, key },
  }));
  return result.Item || null;
}

async function putData(ns, key, value) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ns, key, value, updatedAt: new Date().toISOString() },
  }));
}

async function listNamespace(ns) {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "ns = :ns",
    ExpressionAttributeValues: { ":ns": ns },
  }));
  return result.Items || [];
}

export async function handler(event) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = event.rawPath || event.path || "/";

  if (method === "OPTIONS") return cors("");

  try {
    // GET /api/builds?page=1&per_page=10
    if (method === "GET" && /^\/api\/builds\/?$/.test(path)) {
      const qs = event.queryStringParameters || {};
      const page = Math.max(1, parseInt(qs.page) || 1);
      const perPage = Math.min(100, Math.max(1, parseInt(qs.per_page) || 10));
      return cors(await getBuilds(page, perPage));
    }

    // GET /api/builds/:id
    const buildMatch = path.match(/^\/api\/builds\/([^/]+)\/?$/);
    if (method === "GET" && buildMatch) {
      const build = await getBuild(decodeURIComponent(buildMatch[1]));
      if (!build) return cors({ error: "Build not found" }, 404);
      return cors(build);
    }

    // GET /api/data/:namespace/:key
    const dataGetMatch = path.match(/^\/api\/data\/([^/]+)\/([^/]+)\/?$/);
    if (method === "GET" && dataGetMatch) {
      const item = await getData(decodeURIComponent(dataGetMatch[1]), decodeURIComponent(dataGetMatch[2]));
      if (!item) return cors({ error: "Not found" }, 404);
      return cors(item.value);
    }

    // POST/PUT /api/data/:namespace/:key
    const dataPostMatch = path.match(/^\/api\/data\/([^/]+)\/([^/]+)\/?$/);
    if ((method === "POST" || method === "PUT") && dataPostMatch) {
      const ns = decodeURIComponent(dataPostMatch[1]);
      // Block writes to system namespaces
      if (PROTECTED_NAMESPACES.has(ns)) {
        return cors({ error: "Cannot write to protected namespace" }, 403);
      }
      // Block namespace names starting with _ (reserved for system)
      if (ns.startsWith("_")) {
        return cors({ error: "Namespaces starting with _ are reserved" }, 403);
      }
      const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      // Limit value size to prevent abuse (100KB max)
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length > 102400) {
        return cors({ error: "Value too large (max 100KB)" }, 413);
      }
      await putData(ns, decodeURIComponent(dataPostMatch[2]), body);
      return cors({ ok: true });
    }

    // GET /api/data/:namespace
    const nsMatch = path.match(/^\/api\/data\/([^/]+)\/?$/);
    if (method === "GET" && nsMatch) {
      const items = await listNamespace(decodeURIComponent(nsMatch[1]));
      return cors(items.map((i) => ({ key: i.key, value: i.value, updatedAt: i.updatedAt })));
    }

    return cors({ error: "Not found", routes: ["GET /api/builds", "GET /api/builds/:id", "GET /api/data/:ns/:key", "POST /api/data/:ns/:key", "GET /api/data/:ns"] }, 404);
  } catch (e) {
    console.error(e);
    return cors({ error: e.message }, 500);
  }
}
