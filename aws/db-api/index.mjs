/**
 * SingularityDB API Lambda
 * Serves build data from DynamoDB for embedding on websites.
 *
 * Routes:
 *   GET    /api/builds?page=1&per_page=10           — paginated builds list (public gallery)
 *   GET    /api/builds/:id                           — single build by ID
 *   GET    /api/builds/:id/source                    — build source code (auth-gatable)
 *   GET    /api/data/:namespace/:key                 — raw key-value get (SingularityDB)
 *   POST   /api/data/:namespace/:key  {value}        — raw key-value put (SingularityDB)
 *   PUT    /api/data/:namespace/:key  {value}        — raw key-value put (SingularityDB)
 *   DELETE /api/data/:namespace/:key                 — raw key-value delete (SingularityDB)
 *   GET    /api/data/:namespace                      — list keys in namespace
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME || "singularity-db";

// System namespaces that cannot be written to via the public API
const PROTECTED_NAMESPACES = new Set(["_system", "_builds", "_source", "_reply_queue", "_showcase", "_rejected", "_rate_limits"]);

function cors(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
    body: JSON.stringify(body),
  };
}

/** Unwrap values that may have been double-wrapped as {value: actual} from old storage format */
function unwrapValue(val) {
  if (val && typeof val === "object" && "value" in val && Object.keys(val).length === 1) {
    return val.value;
  }
  return val;
}

async function getBuilds(page, perPage, sort = "created_at", search = "") {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "ns = :ns",
    ExpressionAttributeValues: { ":ns": "_showcase" },
  }));

  let items = result.Items || [];

  // Search filter (case-insensitive partial match on name or username)
  if (search) {
    const q = search.toLowerCase();
    items = items.filter((item) => {
      const v = unwrapValue(item.value);
      const name = (v?.name || "").toLowerCase();
      const username = (v?.username || "").toLowerCase();
      return name.includes(q) || username.includes(q);
    });
  }

  // Sort
  if (sort === "coolness") {
    items.sort((a, b) => {
      const va = unwrapValue(a.value);
      const vb = unwrapValue(b.value);
      return (vb?.score || 0) - (va?.score || 0);
    });
  } else {
    items.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  const total = items.length;
  const start = (page - 1) * perPage;
  const paged = items.slice(start, start + perPage);

  const builds = paged.map((item) => {
    const v = unwrapValue(item.value);
    return {
      id: item.key,
      name: v?.name || item.key,
      score: v?.score || v?.coolness || 50,
      query: v?.query || v?.request || "",
      username: v?.username || "",
      channel: v?.channel || "x",
      tweet_url: v?.tweetUrl || v?.tweet_url || "",
      build_url: v?.buildUrl || v?.build_url || v?.url || "",
    };
  });

  return { builds, total, page, per_page: perPage };
}

async function getBuild(id) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { ns: "_showcase", key: id },
  }));
  if (!result.Item) return null;
  const v = unwrapValue(result.Item.value);
  return {
    id: result.Item.key,
    name: v?.name || result.Item.key,
    score: v?.score || v?.coolness || 50,
    query: v?.query || v?.request || "",
    username: v?.username || "",
    channel: v?.channel || "x",
    tweet_url: v?.tweetUrl || v?.tweet_url || "",
    build_url: v?.buildUrl || v?.build_url || v?.url || "",
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

async function deleteData(ns, key) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { ns, key },
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

/** Parse request body, handling base64 encoding from API Gateway v2 */
function parseBody(event) {
  let raw = event.body;
  if (!raw) return {};
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, "base64").toString("utf-8");
  }
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function isProtectedNamespace(ns) {
  return PROTECTED_NAMESPACES.has(ns) || ns.startsWith("_");
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
      const sort = qs.sort === "coolness" ? "coolness" : "created_at";
      const search = (qs.search || "").trim();
      return cors(await getBuilds(page, perPage, sort, search));
    }

    // GET /api/builds/:id/source — private source code (auth-gatable later)
    const sourceMatch = path.match(/^\/api\/builds\/([^/]+)\/source\/?$/);
    if (method === "GET" && sourceMatch) {
      const buildId = decodeURIComponent(sourceMatch[1]);
      const item = await getData("_source", buildId);
      if (!item) return cors({ error: "Source not found" }, 404);
      const v = unwrapValue(item.value);
      return cors({ id: buildId, html: v?.html || v, htmlSize: v?.htmlSize || 0 });
    }

    // GET /api/builds/:id
    const buildMatch = path.match(/^\/api\/builds\/([^/]+)\/?$/);
    if (method === "GET" && buildMatch) {
      const build = await getBuild(decodeURIComponent(buildMatch[1]));
      if (!build) return cors({ error: "Build not found" }, 404);
      return cors(build);
    }

    // Match data routes: /api/data/:namespace/:key
    const dataKeyMatch = path.match(/^\/api\/data\/([^/]+)\/([^/]+)\/?$/);

    // GET /api/data/:namespace/:key
    if (method === "GET" && dataKeyMatch) {
      const item = await getData(decodeURIComponent(dataKeyMatch[1]), decodeURIComponent(dataKeyMatch[2]));
      if (!item) return cors({ error: "Not found" }, 404);
      // Return the unwrapped value directly
      // The stored format is {ns, key, value: {value: actual}, updatedAt} (from client sending {value: v})
      // We unwrap to return just the actual value
      const val = unwrapValue(item.value);
      return cors(val);
    }

    // POST/PUT /api/data/:namespace/:key
    if ((method === "POST" || method === "PUT") && dataKeyMatch) {
      const ns = decodeURIComponent(dataKeyMatch[1]);
      if (isProtectedNamespace(ns)) {
        return cors({ error: "Cannot write to protected namespace" }, 403);
      }
      const body = parseBody(event);
      // Limit value size to prevent abuse (100KB max)
      const bodyStr = JSON.stringify(body);
      if (bodyStr.length > 102400) {
        return cors({ error: "Value too large (max 100KB)" }, 413);
      }
      // Store the value from the body — client sends {value: v}, we store v directly
      const valueToStore = body.value !== undefined ? body.value : body;
      await putData(ns, decodeURIComponent(dataKeyMatch[2]), valueToStore);
      return cors({ ok: true });
    }

    // DELETE /api/data/:namespace/:key
    if (method === "DELETE" && dataKeyMatch) {
      const ns = decodeURIComponent(dataKeyMatch[1]);
      if (isProtectedNamespace(ns)) {
        return cors({ error: "Cannot delete from protected namespace" }, 403);
      }
      await deleteData(ns, decodeURIComponent(dataKeyMatch[2]));
      return cors({ ok: true });
    }

    // GET /api/data/:namespace
    const nsMatch = path.match(/^\/api\/data\/([^/]+)\/?$/);
    if (method === "GET" && nsMatch) {
      const items = await listNamespace(decodeURIComponent(nsMatch[1]));
      return cors(items.map((i) => ({
        key: i.key,
        value: unwrapValue(i.value),
        updatedAt: i.updatedAt,
      })));
    }

    return cors({ error: "Not found", routes: ["GET /api/builds", "GET /api/builds/:id", "GET /api/builds/:id/source", "GET /api/data/:ns/:key", "PUT /api/data/:ns/:key", "DELETE /api/data/:ns/:key", "GET /api/data/:ns"] }, 404);
  } catch (e) {
    console.error(e);
    return cors({ error: e.message }, 500);
  }
}
