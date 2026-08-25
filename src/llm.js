// LLM module: calls OpenAI-compatible chat completions endpoint with retry.
import { setTimeout as sleep } from 'node:timers/promises';

// Timeout for a single LLM HTTP request (ms). Prevents indefinite hangs
// that would cause MCP tool calls to exceed the client's execution window.
const REQUEST_TIMEOUT_MS = 30000;

/**
 * Calls the OpenAI-compatible /chat/completions endpoint.
 * Retries once on network error (1s delay). Throws on non-2xx.
 * Each attempt is capped at REQUEST_TIMEOUT_MS via AbortController.
 * @param {object} params
 * @param {string} params.baseURL - e.g. "https://host/v1"
 * @param {string} params.apiKey - API key (sk-...)
 * @param {string} params.model - model name
 * @param {Array<{role:string,content:string}>} params.messages
 * @returns {Promise<string>} assistant message content
 * @throws {Error} on non-2xx response, network failure after retry, or timeout
 */
export async function chat({ baseURL, apiKey, model, messages }) {
  const url = baseURL.replace(/\/$/, '') + '/chat/completions';
  const body = JSON.stringify({ model, messages, temperature: 0.7 });

  for (let attempt = 1; attempt <= 2; attempt++) {
    // Abort the fetch if the LLM endpoint takes too long, preventing
    // the MCP server from hanging beyond the client's tool-call window.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const msg = errBody?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) {
          throw new Error(`API Key invalid or unauthorized: ${msg}`);
        }
        throw new Error(`LLM request failed (${res.status}): ${msg}`);
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        // Include truncated raw response for debugging (spec §6 error matrix)
        const rawSnippet = JSON.stringify(data).slice(0, 500);
        throw new Error(`LLM response missing choices[0].message.content. Raw response (truncated 500 chars): ${rawSnippet}`);
      }
      return content;
    } catch (err) {
      // Treat AbortError as a network error so it triggers retry on the first attempt
      const isTimeout = err.name === 'AbortError';
      const isNetworkError = err instanceof TypeError || isTimeout;
      if (attempt < 2 && isNetworkError) {
        await sleep(1000);
        continue;
      }
      if (isTimeout) {
        throw new Error(`LLM request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      // Wrap network errors with a clearer message (spec §4.3: wrap and throw)
      if (isNetworkError) {
        throw new Error(`Network error contacting LLM: ${err.message}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}