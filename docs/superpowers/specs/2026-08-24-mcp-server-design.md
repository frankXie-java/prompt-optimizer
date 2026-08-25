# MCP Server Design Document

**Date**: 2026-08-24
**Status**: Approved (pending implementation)
**Author**: frankXie-java

## 1. Background and Goal

`prompt-optimizer` is currently a local Node.js CLI tool (`optimize-prompt`) that optimizes prompts via OpenAI-compatible LLM endpoints. The CLI form requires terminal usage, which is inconvenient for AI-assisted IDE workflows where an AI assistant could invoke the optimizer directly.

**Goal**: Add an MCP (Model Context Protocol) server as a peer distribution form to the CLI. AI IDEs and assistants (Cursor, Claude Desktop, Windsurf, and other MCP-compatible clients) can launch the server via `npx` and call the `optimize_prompt` tool to optimize prompts programmatically.

**Non-goals** (out of scope for this spec):
- VSCode extension (may be added in a future spec)
- Standalone local Web UI (may be added in a future spec)
- Tauri/Electron desktop app (YAGNI — see research notes)
- JetBrains plugin (YAGNI)
- Browser extension (YAGNI)
- npm publishing of the MCP server package (local-path configuration first; publishing is a follow-up task)
- Streaming output (YAGNI, consistent with original CLI design)
- Multi-tool registration (single `optimize_prompt` tool, preserving single-responsibility philosophy)

## 2. Architectural Positioning

The MCP server is a **peer form** to the CLI, not a replacement. Both share the core modules (`config.js`, `llm.js`, `optimize.js`). A new `docs.js` module adds directory-scanning capability shared by both forms.

```
prompt-optimizer/
├── src/
│   ├── config.js          # Shared: config read/write/validation (no functional change; docs_dir is an optional pass-through field)
│   ├── llm.js             # Shared: LLM HTTP client (unchanged)
│   ├── optimize.js        # Shared: message assembly + result extraction (unchanged)
│   ├── docs.js            # NEW: directory scan + document aggregation
│   ├── cli.js             # CLI entry (modified: add --codebase-dir option)
│   └── mcp/
│       ├── server.js      # NEW: MCP server entry (stdio transport)
│       └── tools.js       # NEW: tool registration + core module invocation
├── package.json           # Modified: add bin entry, add MCP SDK + zod deps
└── (existing files unchanged)
```

### Key design decisions

1. **MCP server reuses core pure functions** (`optimize.buildMessages` + `optimize.extractOptimizedPrompt` + `llm.chat`) directly via `import` — does NOT spawn the CLI as a subprocess. Rationale: avoids stdio frame pollution, better performance, simpler error handling.
2. **stdio transport**: JSON-RPC over stdin/stdout. This is what Cursor, Claude Desktop, and Windsurf expect for local MCP servers launched via `npx`.
3. **Single tool**: only `optimize_prompt` is registered, preserving the project's single-responsibility philosophy.
4. **Config reuse**: MCP server reads `~/.config/prompt-optimizer/config.json` at each tool invocation, sharing the same config as the CLI.
5. **Logging via stderr only**: under stdio transport, `console.log` corrupts the JSON-RPC framing on stdout. All logging (scan stats, warnings) MUST use `console.error`.

## 3. Document Directory Scanning

### Motivation

The CLI's existing `--codebase <file>` accepts a single file. For real-world usage with multiple codebase index documents and technical docs spread across a directory, a single-text parameter is insufficient. The design introduces directory scanning that aggregates all `.md` files in a folder for context-aware optimization.

### New module: `src/docs.js`

```javascript
/**
 * Scans a directory recursively for .md files and aggregates them into a single string.
 *
 * Rules:
 * - Recursively traverses subdirectories
 * - Collects only .md and .markdown files
 * - Skips node_modules directories
 * - Skips hidden files and hidden directories (leading dot)
 * - Skips individual files larger than 50KB (recorded in skipped[])
 * - Sorts files by relative path alphabetically (for reproducibility)
 * - Prepends each file's content with a header: "\n## <relative-path>\n\n"
 * - Warns on stderr if total aggregated size exceeds 200KB (does not truncate)
 *
 * @param {string} dirPath - absolute path to docs directory
 * @returns {Promise<{content: string, fileCount: number, skipped: string[], totalBytes: number}>}
 * @throws {Error} if dirPath does not exist or is not a directory
 */
export async function loadDocsFromDir(dirPath) { ... }
```

### Scan rules summary

| Rule | Value | Rationale |
|------|-------|-----------|
| File extensions | `.md`, `.markdown` | Markdown is the dominant tech doc format; narrow scope keeps output predictable |
| Skip directories | `node_modules`, hidden dirs (leading `.`) | Avoid deps and editor/system cruft |
| Skip files | hidden files (leading `.`) | Avoid `.DS_Store`, `.gitkeep`, etc. |
| Single file size limit | 50KB | Prevent one huge doc from consuming the context window |
| Total size warning threshold | 200KB | Alert user to token cost; does not truncate (user decides) |
| Sort order | relative path, alphabetical | Reproducible output for testing and debugging |
| Per-file header | `\n## <relative-path>\n\n` | LLM can attribute content to source files |

### CLI integration

The CLI gains a new `--codebase-dir <path>` option, mutually exclusive with the existing `--codebase <path>`:

```
Options:
  --codebase <path>      path to a single codebase index file (existing, backward-compatible)
  --codebase-dir <path>  path to a directory of .md tech docs (recursive scan)
  -o, --output <path>    output file path (default: stdout)
```

If both `--codebase` and `--codebase-dir` are provided, the CLI prints a red error and exits 1.

## 4. MCP Tool Definition

### Tool: `optimize_prompt`

```typescript
{
  name: "optimize_prompt",
  description: "Optimize a prompt using an OpenAI-compatible LLM. "
             + "Optionally inject technical documentation from a directory for context-aware optimization.",
  inputSchema: {
    prompt: string,        // required: the prompt text to optimize
    docsDir?: string       // optional: absolute path to a directory of .md tech docs
  },
  returns: string          // the optimized prompt text
}
```

### docsDir resolution priority

1. If the tool call passes `docsDir` → scan that directory
2. Else if config has `docs_dir` → scan the configured directory
3. Else → no document context (pure prompt optimization)

### Tool execution flow

```
optimize_prompt({ prompt, docsDir? })
  │
  ├─ 1. getConfigOrThrow() → { base_url, api_key, model, docs_dir? }
  ├─ 2. resolve docsDir: param > config.docs_dir > null
  ├─ 3. if docsDir:
  │      loadDocsFromDir(dirPath) → { content, fileCount, skipped, totalBytes }
  │      console.error(`Loaded ${fileCount} docs, skipped ${skipped.length}, ${totalBytes} bytes`)
  │    else:
  │      content = null
  ├─ 4. buildMessages(prompt, content)
  ├─ 5. chat({ baseURL, apiKey, model, messages })
  ├─ 6. extractOptimizedPrompt(raw)
  └─ 7. return { content: [{ type: "text", text: optimized }] }
```

## 5. Module Structure

### `src/mcp/server.js` — MCP server entry

```javascript
#!/usr/bin/env node
// MCP server entry: stdio transport, registers optimize_prompt tool.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'optimize-prompt-mcp',
  version: '0.1.0',
});

registerTools(server);

await server.connect(new StdioServerTransport());
```

This file is assembly-only (no testable logic). All logic lives in `tools.js` and the shared modules.

### `src/mcp/tools.js` — tool registration

```javascript
import { z } from 'zod';
import { getConfigOrThrow } from '../config.js';
import { buildMessages, extractOptimizedPrompt } from '../optimize.js';
import { chat } from '../llm.js';
import { loadDocsFromDir } from '../docs.js';

/**
 * Registers the optimize_prompt tool on the MCP server.
 * @param {McpServer} server - the MCP server instance
 */
export function registerTools(server) {
  server.registerTool(
    'optimize_prompt',
    {
      description: 'Optimize a prompt using an OpenAI-compatible LLM. '
        + 'Optionally inject technical documentation from a directory for context-aware optimization.',
      inputSchema: {
        prompt: z.string().describe('The prompt text to optimize'),
        docsDir: z.string().optional().describe(
          'Absolute path to a directory of .md tech docs. '
          + 'If omitted, uses docs_dir from config (if set).'
        ),
      },
    },
    async ({ prompt, docsDir }) => {
      // Implementation per execution flow in section 4
      // On success: return { content: [{ type: 'text', text: optimized }] }
      // On error:   return { isError: true, content: [{ type: 'text', text: err.message }] }
    }
  );
}
```

### `src/config.js` — modification

- `getConfigOrThrow()`: no change to validation (docs_dir is optional, not validated)
- `loadConfig()` / `saveConfig()`: no change (already pass through all fields)
- `cli.js runInit()`: add an optional prompt `docs_dir (optional, press Enter to skip):`

### `src/cli.js` — modification

- Add `--codebase-dir <path>` option via commander
- Add mutual-exclusion check with `--codebase`
- In `runOptimize()`: if `--codebase-dir` set, call `loadDocsFromDir()` instead of reading single file

## 6. Error Handling

MCP server error handling differs from CLI: it must NOT call `process.exit()`. Instead it returns a JSON-RPC error content so the AI assistant can see the error and decide next steps.

| Scenario | CLI behavior | MCP server behavior |
|----------|--------------|---------------------|
| Config missing or invalid fields | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'Config not found. Run optimize-prompt init.' }] }` |
| `docsDir` does not exist | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'Directory not found: <path>' }] }` |
| `docsDir` is not a directory | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'Not a directory: <path>' }] }` |
| Directory has no .md files | warning (stderr) + proceed without docs | warning (stderr) + proceed without docs (not an error) |
| `prompt` is empty | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'prompt is required' }] }` |
| LLM 401/403 | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'API Key invalid or unauthorized: <msg>' }] }` |
| LLM network error | retry once (1s) + exit 1 | retry once (1s) + `{ isError: true, content: [{ type: 'text', text: 'Network error contacting LLM: <msg>' }] }` |
| LLM response missing content | `chalk.red` + exit 1 | `{ isError: true, content: [{ type: 'text', text: 'LLM response missing content. Raw (truncated 500 chars): <snippet>' }] }` |
| Both `--codebase` and `--codebase-dir` given | `chalk.red` + exit 1 | N/A (MCP has no such options) |

### Key error-handling principles

- MCP server logs (scan stats, warnings) go to `console.error` (stderr) only — NEVER `console.log` (stdout is the JSON-RPC channel)
- MCP server does NOT use `chalk` (ANSI codes may render poorly in some MCP clients' error displays)
- CLI retains its existing `chalk.red` + `exit(1)` behavior unchanged
- `docsDir` pointing to a directory with zero `.md` files is NOT an error — the tool proceeds without document context, logging a warning to stderr

## 7. Testing Strategy

Continues the project's TDD tradition (`node:test`, no e2e tests).

### New test files

| File | Coverage | Estimated test count |
|------|----------|---------------------|
| `src/docs.test.js` | `loadDocsFromDir`: empty dir, multiple files, skip >50KB, skip non-.md, skip node_modules, skip hidden files, sort by name, dir-not-exists throws, not-a-dir throws | 8 |
| `src/mcp/tools.test.js` | tool registration, success path (mock chat), docsDir resolution priority (param > config), config-missing returns isError, LLM failure returns isError, empty prompt returns isError | 6 |

### `docs.test.js` key tests

Uses `os.tmpdir()` + `fs.mkdtempSync` to construct isolated directory trees:

```javascript
test('loadDocsFromDir aggregates .md files sorted by relative path', ...)
test('loadDocsFromDir skips files larger than 50KB', ...)
test('loadDocsFromDir skips node_modules and hidden files/dirs', ...)
test('loadDocsFromDir throws when directory does not exist', ...)
test('loadDocsFromDir returns empty content for dir with no .md files', ...)
test('loadDocsFromDir prepends file path header to each doc', ...)
test('loadDocsFromDir warns on stderr when total > 200KB', ...)
test('loadDocsFromDir accepts .markdown extension as well as .md', ...)
```

### `mcp/tools.test.js` key tests

Mocks `getConfigOrThrow`, `chat`, and `loadDocsFromDir`:

```javascript
test('optimize_prompt tool returns optimized text on success', ...)
test('optimize_prompt tool uses docsDir param over config.docs_dir', ...)
test('optimize_prompt tool uses config.docs_dir when param omitted', ...)
test('optimize_prompt tool returns isError when config missing', ...)
test('optimize_prompt tool returns isError when LLM throws', ...)
test('optimize_prompt tool returns isError when prompt is empty', ...)
```

### MCP server entry (`server.js`)

NOT tested directly. It is assembly-only code (import SDK + connect). All testable logic lives in `tools.js` and shared modules. stdio e2e tests are explicitly out of scope (complex, brittle, CI-unfriendly).

### CI matrix

Unchanged: Node 20/22/24 via `.github/workflows/test.yml`. 

**Test script update required**: the current `npm test` script (`node --test src/*.test.js`) uses a single-level glob that will NOT discover `src/mcp/tools.test.js`. The script must be updated to recurse into subdirectories. Recommended approach: `node --test src/` (passing a directory makes Node recursively discover `*.test.js` files, supported on Node 20.9+). This change is part of the implementation plan.

## 8. Configuration and Installation

### Config file change

`~/.config/prompt-optimizer/config.json` gains an optional field:

```json
{
  "base_url": "https://...",
  "api_key": "sk-...",
  "model": "gpt-4o",
  "docs_dir": "/path/to/docs"
}
```

- `docs_dir` is fully optional; absence preserves current behavior
- `getConfigOrThrow()` does NOT validate `docs_dir` (not required)
- `optimize-prompt init` adds one optional prompt: `docs_dir (optional, press Enter to skip):`

### package.json changes

```json
{
  "bin": {
    "optimize-prompt": "src/cli.js",
    "optimize-prompt-mcp": "src/mcp/server.js"
  },
  "dependencies": {
    "chalk": "^6.0.0",
    "commander": "^15.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  }
}
```

New dependencies:
- `@modelcontextprotocol/sdk` — official MCP TypeScript SDK
- `zod` — schema validation (required by MCP SDK for tool input schema definitions)

The MCP server does NOT use `chalk` (stdio mode; ANSI codes could corrupt JSON-RPC rendering in some clients).

### MCP client configuration (for local development, pre-publish)

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "optimize-prompt": {
      "command": "node",
      "args": ["/absolute/path/to/prompt-optimizer/src/mcp/server.js"]
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "optimize-prompt": {
      "command": "node",
      "args": ["/absolute/path/to/prompt-optimizer/src/mcp/server.js"]
    }
  }
}
```

### npm publishing (out of scope for this spec)

After this spec is implemented and validated, a follow-up task will publish to npm so `npx optimize-prompt-mcp` works without a local path. This spec covers local-path configuration only.

## 9. Research Notes (for reference)

The following options were evaluated and explicitly rejected for this spec (see brainstorming session for full analysis):

| Option | Effort | Verdict |
|--------|--------|---------|
| VSCode extension | M (2-5 days MVP) | Deferred — future spec |
| Local Web UI | S-M (2-4 days) | Deferred — future spec |
| Tauri desktop app | M-L | Rejected (YAGNI) |
| Electron desktop app | M-L | Rejected (YAGNI) |
| JetBrains plugin | L | Rejected (YAGNI) |
| Browser extension | M | Rejected (YAGNI) |

MCP server was chosen as the first implementation because: lowest effort (S), highest reach (Cursor/Claude Desktop/Windsurf + future MCP clients), 100% code reuse, and no marketplace/publisher account needed for local-path usage.

## 10. Implementation Order (rough — detailed plan delegated to writing-plans)

1. `src/docs.js` + `src/docs.test.js` (TDD, independently testable)
2. `src/mcp/tools.js` + `src/mcp/tools.test.js` (TDD, mock dependencies)
3. `src/mcp/server.js` (assembly only, no tests)
4. `src/config.js` modification (add docs_dir to init prompt)
5. `src/cli.js` modification (add --codebase-dir, mutual exclusion)
6. `package.json` (add bin entry + dependencies)
7. `npm install` + `npm test` (verify all tests pass)
8. Manual smoke test with a real MCP client (Cursor or Claude Desktop)
9. README update (MCP server usage section)
