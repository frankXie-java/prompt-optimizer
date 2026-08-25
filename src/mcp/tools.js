// MCP tools module: registers the optimize_prompt tool and provides a testable handler.
import { z } from 'zod';
import { getConfigOrThrow } from '../config.js';
import { chat } from '../llm.js';
import { buildMessages, extractOptimizedPrompt } from '../optimize.js';
import { loadDocsFromDir } from '../docs.js';

// Default dependencies: wired to real modules for production use.
// Tests inject mock deps to isolate the handler logic.
const defaultDeps = {
  getConfigOrThrow,
  chat,
  loadDocsFromDir,
  buildMessages,
  extractOptimizedPrompt,
};

/**
 * Handles the optimize_prompt tool invocation.
 *
 * Flow:
 * 1. Validate prompt is non-empty
 * 2. Load config (base_url, api_key, model, optional docs_dir)
 * 3. Resolve docsDir: param > config.docs_dir > null
 * 4. If docsDir, scan directory for .md docs
 * 5. Build messages, call LLM, extract optimized prompt
 *
 * @param {object} args - { prompt: string, docsDir?: string }
 * @param {object} deps - injectable dependencies for testing
 * @returns {Promise<{content: Array<{type: string, text: string}>} | {isError: true, content: Array}>}
 */
export async function optimizePromptHandler({ prompt, docsDir }, deps = defaultDeps) {
  const {
    getConfigOrThrow: getConfig,
    chat: callChat,
    loadDocsFromDir: loadDocs,
    buildMessages: buildMsgs,
    extractOptimizedPrompt: extract,
  } = { ...defaultDeps, ...deps };

  try {
    // Validate prompt
    if (!prompt || !prompt.trim()) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'prompt is required' }],
      };
    }

    // Load config
    const cfg = await getConfig();

    // Resolve docsDir: explicit param > config.docs_dir > null
    const resolvedDocsDir = docsDir || cfg.docs_dir || null;

    // Load docs if a directory is resolved
    let docsContent = null;
    if (resolvedDocsDir) {
      const result = await loadDocs(resolvedDocsDir);
      docsContent = result.content || null;
      // Log scan stats to stderr (NEVER stdout — that's the JSON-RPC channel)
      console.error(
        `Loaded ${result.fileCount} docs, skipped ${result.skipped.length}, ${result.totalBytes} bytes`,
      );
    }

    // Build messages, call LLM, extract result
    const messages = buildMsgs(prompt, docsContent);
    const raw = await callChat({
      baseURL: cfg.base_url,
      apiKey: cfg.api_key,
      model: cfg.model,
      messages,
    });
    const optimized = extract(raw);

    return {
      content: [{ type: 'text', text: optimized }],
    };
  } catch (err) {
    // Return error as MCP content so the AI assistant can see and respond to it
    return {
      isError: true,
      content: [{ type: 'text', text: err.message }],
    };
  }
}

/**
 * Registers the optimize_prompt tool on an MCP server instance.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
export function registerTools(server) {
  server.registerTool(
    'optimize_prompt',
    {
      description:
        'Optimize a prompt using an OpenAI-compatible LLM. ' +
        'Optionally inject technical documentation from a directory for context-aware optimization.',
      inputSchema: {
        prompt: z.string().describe('The prompt text to optimize'),
        docsDir: z.string().optional().describe(
          'Absolute path to a directory of .md tech docs. ' +
          'If omitted, uses docs_dir from config (if set).',
        ),
      },
    },
    async (args) => optimizePromptHandler(args),
  );
}
