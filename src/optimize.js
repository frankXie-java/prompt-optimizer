// Optimize module: assembles LLM messages and extracts optimized prompt from response.
/**
 * System prompt instructing the LLM to output only the optimized prompt.
 * @type {string}
 */
const SYSTEM_PROMPT =
  'You are a prompt optimization expert. Rewrite the user prompt to be clearer, more specific, and more effective. ' +
  'Output ONLY the optimized prompt with no explanation, no preamble, no markdown fences, no extra text.';

/**
 * Builds the OpenAI-format messages array for the chat completions API.
 * @param {string} originalPrompt - the raw prompt to optimize
 * @param {string|null} codebaseContent - optional codebase index document
 * @returns {Array<{role:string, content:string}>} messages array
 */
export function buildMessages(originalPrompt, codebaseContent) {
  let userContent = originalPrompt;
  if (codebaseContent) {
    userContent +=
      '\n\n<codebase>' + codebaseContent + '</codebase>\n\n' +
      'Use the above codebase index to optimize this prompt for the specific codebase.';
  }
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Extracts the optimized prompt from raw LLM response text.
 * Strips markdown code fences if present; trims whitespace.
 * @param {string} raw - raw LLM response
 * @returns {string} clean optimized prompt
 */
export function extractOptimizedPrompt(raw) {
  const trimmed = raw.trim();
  // Match opening fence with optional language tag, content, closing fence
  const fenceMatch = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return trimmed;
}