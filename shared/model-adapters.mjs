/**
 * Model Adapter Interface
 * Each adapter: { name, generate(systemPrompt, userPrompt, maxTokens) → string }
 * Adapters: claude, grok, gpt
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// --- Claude Adapter ---
const claudeAdapter = {
  name: "claude",
  async generate(systemPrompt, userPrompt, maxTokens = 16000) {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    return message.content[0]?.text;
  },
};

// --- Grok Adapter (OpenAI-compatible, x.ai) ---
const grokAdapter = {
  name: "grok",
  async generate(systemPrompt, userPrompt, maxTokens = 16000) {
    const client = new OpenAI({
      apiKey: process.env.GROK_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
    const response = await client.chat.completions.create({
      model: "grok-3",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content;
  },
};

// --- GPT Adapter ---
const gptAdapter = {
  name: "gpt",
  async generate(systemPrompt, userPrompt, maxTokens = 16000) {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content;
  },
};

// --- Registry ---
const adapters = {
  claude: claudeAdapter,
  grok: grokAdapter,
  gpt: gptAdapter,
};

/**
 * Get a model adapter by name.
 * @param {string} model - "claude" | "grok" | "gpt"
 * @returns {object} adapter with generate(systemPrompt, userPrompt, maxTokens)
 */
export function getAdapter(model = "claude") {
  const adapter = adapters[model.toLowerCase()];
  if (!adapter) throw new Error(`Unknown model adapter: "${model}". Valid: ${Object.keys(adapters).join(", ")}`);
  return adapter;
}

/**
 * Generate text using the specified model.
 * Convenience wrapper around getAdapter().generate().
 */
export async function generateWithModel(model, systemPrompt, userPrompt, maxTokens = 16000) {
  const adapter = getAdapter(model);
  console.log(`🤖 Using model: ${adapter.name}`);
  return adapter.generate(systemPrompt, userPrompt, maxTokens);
}

export default adapters;
