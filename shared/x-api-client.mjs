/**
 * X API v2 Client — OAuth 1.0a tweet posting
 * Zero external dependencies (uses Node.js built-in crypto)
 */

import crypto from "crypto";

const TWEET_URL = "https://api.twitter.com/2/tweets";
const USER_ME_URL = "https://api.twitter.com/2/users/me";

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const paramString = sorted.map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&");
  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
}

function buildOAuthHeader(method, url, credentials) {
  const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = credentials;
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };
  oauthParams.oauth_signature = oauthSign(method, url, oauthParams, consumerSecret, accessTokenSecret);
  return "OAuth " + Object.entries(oauthParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ");
}

/**
 * Post a reply tweet via X API v2
 * @param {string} tweetId - Tweet ID to reply to
 * @param {string} text - Reply text
 * @param {object} credentials - { consumerKey, consumerSecret, accessToken, accessTokenSecret }
 * @returns {{ ok: boolean, tweetId?: string, error?: string }}
 */
export async function postReply(tweetId, text, credentials) {
  try {
    const body = { text, reply: { in_reply_to_tweet_id: tweetId } };
    const auth = buildOAuthHeader("POST", TWEET_URL, credentials);
    const res = await fetch(TWEET_URL, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${JSON.stringify(data)}` };
    }
    return { ok: true, tweetId: data.data?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Post a standalone tweet via X API v2
 * @param {string} text - Tweet text
 * @param {object} credentials - OAuth credentials
 * @returns {{ ok: boolean, tweetId?: string, error?: string }}
 */
export async function postTweet(text, credentials) {
  try {
    const auth = buildOAuthHeader("POST", TWEET_URL, credentials);
    const res = await fetch(TWEET_URL, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${JSON.stringify(data)}` };
    }
    return { ok: true, tweetId: data.data?.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Validate credentials by calling GET /2/users/me
 * @param {object} credentials - OAuth credentials
 * @returns {{ ok: boolean, username?: string, error?: string }}
 */
export async function validateCredentials(credentials) {
  try {
    const auth = buildOAuthHeader("GET", USER_ME_URL, credentials);
    const res = await fetch(USER_ME_URL, {
      headers: { Authorization: auth },
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${JSON.stringify(data)}` };
    }
    return { ok: true, username: data.data?.username };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Load credentials from environment variables
 * @returns {object|null} credentials or null if not configured
 */
export function loadCredentialsFromEnv() {
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) return null;
  return { consumerKey, consumerSecret, accessToken, accessTokenSecret };
}
