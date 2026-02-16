/**
 * Base Channel Interface
 * All channels (X/Twitter, OpenClaw, Mesh, Discord, API, etc.) implement this interface.
 *
 * A channel receives trigger events from its platform and sends replies back.
 * The core pipeline (code-runner -> deployer) is channel-agnostic — it receives
 * a BuildRequest and returns a BuildResult.
 */

/**
 * @typedef {Object} BuildRequest
 * @property {string} query      — The sanitized build request text
 * @property {string} username   — Who triggered the build
 * @property {string} channel    — Channel identifier (e.g. "x", "api", "mesh", "discord")
 * @property {string} [reply_to] — Platform-specific ID to reply to (tweet ID, message ID, etc.)
 * @property {string} [user_url] — URL to the user's profile on the platform
 * @property {Object} [meta]     — Channel-specific metadata
 */

/**
 * @typedef {Object} BuildResult
 * @property {string} build_url  — Deployed URL of the built app
 * @property {string} source     — HTML source code
 * @property {string} app_id     — Unique build identifier
 * @property {number} score      — Coolness score
 */

/**
 * Abstract base class for channels.
 * Subclasses must implement pollForRequests() and sendReply().
 */
export class BaseChannel {
  /**
   * @param {string} name — Channel identifier (e.g. "x", "discord", "api")
   */
  constructor(name) {
    if (new.target === BaseChannel) {
      throw new Error("BaseChannel is abstract — use a concrete channel implementation");
    }
    this.name = name;
  }

  /**
   * Poll for new build requests from this channel.
   * @returns {Promise<BuildRequest[]>} — Array of new build requests
   */
  async pollForRequests() {
    throw new Error("pollForRequests() must be implemented by channel subclass");
  }

  /**
   * Send a reply back to the platform after a build completes.
   * @param {BuildRequest} request — The original request
   * @param {BuildResult} result — The build result
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async sendReply(request, result) {
    throw new Error("sendReply() must be implemented by channel subclass");
  }

  /**
   * Format the reply text for this channel. Can be overridden per-channel.
   * @param {BuildRequest} request
   * @param {BuildResult} result
   * @returns {string}
   */
  formatReply(request, result) {
    return `@${request.username} Done! ✨\n\n${result.build_url}\n\nBuilt by SingularityEngine 🦀`;
  }
}
