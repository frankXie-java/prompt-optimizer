// LLM module: calls OpenAI-compatible chat completions endpoint with retry.
import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Calls the OpenAI-compatible /chat/completions endpoint.
 * Retries once on network error (1s delay). Throws on non-2xx.
 * @param {object} params
 * @param {string} params.baseURL - e.g. "https://host/v1"
 * @param {string} params.apiKey - API key (sk-...)
 * @param {string} params.model - model name
 * @param {Array<{role:string,content:string}>} params.messages
 * @returns {Promise<string>} assistant message content
 * @throws {Error} on non-2xx response or network failure after retry
 */
export async function chat({ baseURL, apiKey, model, messages }) {
  const url = baseURL.replace(/\/$/, '') + '/chat/completions';
  const body = JSON.stringify({ model, messages, temperature: 0.7 });

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
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
      // Retry only on network errors (TypeError from fetch), not on HTTP errors
      const isNetworkError = err instanceof TypeError;
      if (attempt < 2 && isNetworkError) {
        await sleep(1000);
        continue;
      }
      // Wrap network errors with a clearer message (spec §4.3: wrap and throw)
      if (isNetworkError) {
        throw new Error(`Network error contacting LLM: ${err.message}`);
      }
      throw err;
    }
  }
}