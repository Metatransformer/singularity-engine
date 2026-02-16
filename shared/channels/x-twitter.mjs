/**
 * X/Twitter Channel Implementation
 * Handles polling X API for build requests and posting replies.
 */

import { BaseChannel } from "./base.mjs";
import { sanitizeBuildRequest, getRejectionReply } from "../security.mjs";

const TRIGGER_RE_DEFAULT = /singularityengine(?:\.ai)?\s+(.+)/i;

export class XTwitterChannel extends BaseChannel {
  /**
   * @param {Object} config
   * @param {string} config.bearerToken    — X API bearer token for reading
   * @param {string} config.ownerUsername   — Bot owner username (skip self-replies)
   * @param {string} [config.triggerKeyword] — Keyword to watch for (default: singularityengine)
   * @param {string[]} [config.watchedTweetIds] — Tweet thread IDs to watch
   * @param {Object} [config.oauthCredentials] — OAuth 1.0a creds for posting replies
   */
  constructor(config) {
    super("x");
    this.bearerToken = config.bearerToken;
    this.ownerUsername = config.ownerUsername;
    this.watchedTweetIds = config.watchedTweetIds || [];
    this.oauthCredentials = config.oauthCredentials || null;

    // Build trigger regex from keyword
    const keyword = config.triggerKeyword || "singularityengine";
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Allow optional .ai suffix if keyword is "singularityengine"
    if (keyword.toLowerCase() === "singularityengine" || keyword.toLowerCase() === "singularityengine.ai") {
      this.triggerRe = TRIGGER_RE_DEFAULT;
    } else {
      this.triggerRe = new RegExp(`${escaped}\\s+(.+)`, "i");
    }
  }

  /**
   * Extract build request from tweet text using the trigger keyword.
   * @param {string} text
   * @returns {string|null} — Cleaned build request or null
   */
  extractBuildRequest(text) {
    const match = text.match(this.triggerRe);
    if (!match) return null;
    return match[1].replace(/^(build\s+me\s+|make\s+me\s+|create\s+|build\s+)/i, "").trim();
  }

  /**
   * Poll X API for new tweets matching our trigger.
   * @param {string} sinceId — Only return tweets after this ID
   * @returns {Promise<Array<{id, text, username, createdAt, conversationId}>>}
   */
  async fetchReplies(sinceId) {
    const queries = [];

    for (const threadId of this.watchedTweetIds) {
      const keyword = this.triggerRe === TRIGGER_RE_DEFAULT ? "singularityengine" : this.triggerRe.source.split("\\s")[0];
      queries.push(`conversation_id:${threadId} "${keyword}" -is:retweet`);
    }

    queries.push(`@${this.ownerUsername} "singularityengine" -is:retweet`);

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
        headers: { Authorization: `Bearer ${this.bearerToken}` },
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

  /**
   * Convert raw tweet data into a BuildRequest.
   * @param {Object} tweet — Raw tweet from fetchReplies
   * @returns {import('./base.mjs').BuildRequest|null}
   */
  toBuildRequest(tweet) {
    const rawRequest = this.extractBuildRequest(tweet.text);
    if (!rawRequest) return null;

    const check = sanitizeBuildRequest(rawRequest);
    if (!check.safe) {
      return { _rejected: true, reason: check.reason, category: check.category, username: tweet.username, id: tweet.id, rawRequest };
    }

    return {
      query: check.cleaned,
      username: tweet.username,
      channel: "x",
      reply_to: tweet.id,
      user_url: `https://x.com/${tweet.username}`,
      meta: {
        tweetId: tweet.id,
        conversationId: tweet.conversationId,
        authorId: tweet.authorId,
      },
    };
  }

  /**
   * Format reply for X/Twitter (includes attribution link).
   */
  formatReply(request, result) {
    return `@${request.username} Done! ✨\n\n${result.build_url}\n\nBuilt by SingularityEngine 🦀\nhttps://github.com/Metatransformer/singularity-engine`;
  }
}
