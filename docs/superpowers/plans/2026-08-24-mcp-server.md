# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MCP server (`optimize-prompt-mcp`) as a peer distribution form to the existing CLI, enabling AI IDEs (Cursor, Claude Desktop, Windsurf) to invoke prompt optimization programmatically. Also add directory-scanning document context for both CLI and MCP.

**Architecture:** New `src/docs.js` module provides recursive `.md` directory scanning shared by both CLI and MCP. New `src/mcp/` directory contains `server.js` (stdio transport entry) and `tools.js` (tool registration with dependency-injected handler for testability). Core modules (`config.js`, `llm.js`, `optimize.js`) remain unchanged except `cli.js` gains `--codebase-dir` and `config.js` init gains optional `docs_dir` prompt.

**Tech Stack:** Node.js >= 20 ESM, `@modelcontextprotocol/sdk` (MCP TS SDK), `zod` (schema validation for MCP tool inputs), `node:test` (testing), `chalk`/`commander` (existing CLI deps).

## Global Constraints

- Node.js >= 20 runtime, ESM modules (`"type": "module"`)
- Existing production deps: `commander`, `chalk` — NEW production deps: `@modelcontextprotocol/sdk`, `zod`
- All code comments in English (AGENTS.md rule 1.1)
- Functions: camelCase, single responsibility, <50 lines, ≤4 params
- No `console.log` in MCP server code (stdout is JSON-RPC channel); use `console.error` only
- MCP server does NOT use `chalk` (ANSI codes may corrupt JSON-RPC rendering)
- No auto-commit; user commits manually (AGENTS.md rule 7.1)
- Conventional Commits format: `<type>(<scope>): <subject>`
- Project root: `/Users/ts-yinjun.xie/prompt-optimizer`
- Tests: `node:test`, TDD (red-green-refactor)
- Config at `~/.config/prompt-optimizer/config.json` (0600 perms), shared by CLI and MCP

---

### Task 1: Implement docs.js module (TDD)

**Files:**
- Create: `src/docs.js`
- Test: `src/docs.test.js`

**Interfaces:**
- Produces: `loadDocsFromDir(dirPath: string) → Promise<{content: string, fileCount: number, skipped: string[], totalBytes: number}>`
  - `content`: aggregated markdown from all `.md`/`.markdown` files, each prefixed with `\n## <relative-path>\n\n`
  - `fileCount`: number of files successfully read
  - `skipped`: array of relative paths of files skipped (>50KB)
  - `totalBytes`: total bytes of content read (excludes skipped files)
- Throws: `Error` if `dirPath` does not exist (`Directory not found: <path>`) or is not a directory (`Not a directory: <path>`)

- [ ] **Step 1: Write failing tests for loadDocsFromDir**

Write `/Users/ts-yinjun.xie/prompt-optimizer/src/docs.test.js`:

```javascript
// Tests for docs module: loadDocsFromDir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDocsFromDir } from './docs.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Helper: create an isolated temp directory tree for each test
function withTempDir(fn) {
  return async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-docs-test-'));
    try {
      await fn(tmpDir);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

// Helper: write a file inside a base dir, creating subdirs as needed
function writeFile(base, relPath, content) {
  const fullPath = path.join(base, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('loadDocsFromDir throws when directory does not exist', async () => {
  await assert.rejects(
    () => loadDocsFromDir('/nonexistent/path/xyz'),
    /Directory not found/,
  );
});

test('loadDocsFromDir throws when path is not a directory', withTempDir(async (tmp) => {
  const filePath = path.join(tmp, 'file.txt');
  fs.writeFileSync(filePath, 'hello');
  await assert.rejects(
    () => loadDocsFromDir(filePath),
    /Not a directory/,
  );
}));

test('loadDocsFromDir returns empty content for dir with no .md files', withTempDir(async (tmp) => {
  writeFile(tmp, 'readme.txt', 'not markdown');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.content, '');
  assert.equal(result.fileCount, 0);
  assert.deepEqual(result.skipped, []);
  assert.equal(result.totalBytes, 0);
}));

test('loadDocsFromDir aggregates .md files with path headers', withTempDir(async (tmp) => {
  writeFile(tmp, 'a.md', 'Content A');
  writeFile(tmp, 'b.md', 'Content B');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.fileCount, 2);
  assert.ok(result.content.includes('## a.md'));
  assert.ok(result.content.includes('Content A'));
  assert.ok(result.content.includes('## b.md'));
  assert.ok(result.content.includes('Content B'));
}));

test('loadDocsFromDir sorts files by relative path alphabetically', withTempDir(async (tmp) => {
  writeFile(tmp, 'zebra.md', 'Z');
  writeFile(tmp, 'alpha.md', 'A');
  writeFile(tmp, 'mid.md', 'M');
  const result = await loadDocsFromDir(tmp);
  const aPos = result.content.indexOf('## alpha.md');
  const mPos = result.content.indexOf('## mid.md');
  const zPos = result.content.indexOf('## zebra.md');
  assert.ok(aPos < mPos && mPos < zPos, 'files should be sorted alphabetically');
}));

test('loadDocsFromDir skips files larger than 50KB', withTempDir(async (tmp) => {
  const bigContent = 'x'.repeat(51 * 1024);
  writeFile(tmp, 'big.md', bigContent);
  writeFile(tmp, 'small.md', 'small');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.fileCount, 1);
  assert.deepEqual(result.skipped, ['big.md']);
  assert.ok(result.content.includes('small'));
  assert.ok(!result.content.includes('big'));
}));

test('loadDocsFromDir skips node_modules and hidden files/dirs', withTempDir(async (tmp) => {
  writeFile(tmp, 'visible.md', 'visible');
  writeFile(tmp, '.hidden.md', 'hidden');
  writeFile(tmp, 'node_modules/dep.md', 'dep');
  writeFile(tmp, '.hiddendir/inner.md', 'inner');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.fileCount, 1);
  assert.ok(result.content.includes('visible'));
  assert.ok(!result.content.includes('hidden'));
  assert.ok(!result.content.includes('dep'));
  assert.ok(!result.content.includes('inner'));
}));

test('loadDocsFromDir accepts .markdown extension as well as .md', withTempDir(async (tmp) => {
  writeFile(tmp, 'a.md', 'md content');
  writeFile(tmp, 'b.markdown', 'markdown content');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.fileCount, 2);
  assert.ok(result.content.includes('md content'));
  assert.ok(result.content.includes('markdown content'));
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && node --test src/docs.test.js`
Expected: FAIL with "Cannot find module './docs.js'"

- [ ] **Step 3: Implement docs.js**

Write `/Users/ts-yinjun.xie/prompt-optimizer/src/docs.js`:

```javascript
// Docs module: recursively scans a directory for .md files and aggregates them.
import fs from 'node:fs/promises';
import path from 'node:path';

// Skip directories with these names
const SKIP_DIRS = new Set(['node_modules']);

// Single file size limit: 50KB
const MAX_FILE_SIZE = 50 * 1024;

// Total size warning threshold: 200KB
const WARN_TOTAL_SIZE = 200 * 1024;

// Valid markdown extensions
const MD_EXTENSIONS = new Set(['.md', '.markdown']);

/**
 * Recursively walks a directory and collects .md/.markdown file paths.
 * Skips node_modules, hidden files, and hidden directories.
 * @param {string} dir - current directory being walked
 * @param {string} baseDir - root directory for computing relative paths
 * @returns {Promise<Array<{fullPath: string, relativePath: string}>>}
 */
async function walkDir(dir, baseDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      files.push(...await walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      if (entry.name.startsWith('.')) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MD_EXTENSIONS.has(ext)) continue;
      files.push({ fullPath, relativePath: path.relative(baseDir, fullPath) });
    }
  }
  return files;
}

/**
 * Scans a directory recursively for .md files and aggregates them into a single string.
 *
 * Rules:
 * - Collects only .md and .markdown files
 * - Skips node_modules directories and hidden files/dirs (leading dot)
 * - Skips individual files larger than 50KB (recorded in skipped[])
 * - Sorts files by relative path alphabetically (for reproducibility)
 * - Prepends each file's content with a header: "\n## <relative-path>\n\n"
 * - Warns on stderr if total aggregated size exceeds 200KB (does not truncate)
 *
 * @param {string} dirPath - absolute path to docs directory
 * @returns {Promise<{content: string, fileCount: number, skipped: string[], totalBytes: number}>}
 * @throws {Error} if dirPath does not exist or is not a directory
 */
export async function loadDocsFromDir(dirPath) {
  // Validate path exists and is a directory
  let stat;
  try {
    stat = await fs.stat(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  // Collect and sort files
  const files = await walkDir(dirPath, dirPath);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Read files, skip oversized ones
  const skipped = [];
  let content = '';
  let totalBytes = 0;
  let fileCount = 0;

  for (const file of files) {
    const fileStat = await fs.stat(file.fullPath);
    if (fileStat.size > MAX_FILE_SIZE) {
      skipped.push(file.relativePath);
      continue;
    }
    const fileContent = await fs.readFile(file.fullPath, 'utf8');
    content += `\n## ${file.relativePath}\n\n${fileContent}`;
    totalBytes += fileStat.size;
    fileCount++;
  }

  // Warn on stderr if total exceeds threshold (stderr is safe for both CLI and MCP)
  if (totalBytes > WARN_TOTAL_SIZE) {
    console.error(
      `Warning: total docs size (${Math.round(totalBytes / 1024)}KB) exceeds 200KB, may increase token cost.`,
    );
  }

  return { content, fileCount, skipped, totalBytes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && node --test src/docs.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (15 existing + 8 new = 23 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add src/docs.js src/docs.test.js
git commit -m "feat(docs): add recursive .md directory scanning module

loadDocsFromDir scans a directory for .md/.markdown files, skips
node_modules/hidden files/dirs, skips files >50KB, sorts by relative
path, and warns on stderr when total >200KB. Shared by CLI and MCP."
```

---

### Task 2: Update test script to discover subdirectories

**Files:**
- Modify: `package.json` (line 10: test script)

**Interfaces:**
- No code interfaces changed; this is a build configuration update

- [ ] **Step 1: Update the test script in package.json**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`, change line 10 from:

```json
    "test": "node --test src/*.test.js"
```

to:

```json
    "test": "node --test src/"
```

Rationale: `src/*.test.js` is a single-level glob that cannot discover `src/mcp/tools.test.js` (a subdirectory). Passing a directory (`src/`) makes Node recursively discover all `*.test.js` files. Supported on Node 20.9+.

- [ ] **Step 2: Run full test suite to verify all tests still pass**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (23 tests — same as before, confirming no test files lost)

- [ ] **Step 3: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add package.json
git commit -m "build(test): use directory-based test discovery for subdirectory support

Change test script from 'node --test src/*.test.js' to 'node --test src/'
so future test files in subdirectories (e.g. src/mcp/) are auto-discovered."
```

---

### Task 3: Add MCP SDK and zod dependencies

**Files:**
- Modify: `package.json` (dependencies + bin entry)

**Interfaces:**
- No code interfaces; this installs the MCP SDK and zod, and adds the MCP bin entry

- [ ] **Step 1: Update package.json**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`. Make two changes:

1. Add `optimize-prompt-mcp` to the `bin` field:

```json
  "bin": {
    "optimize-prompt": "src/cli.js",
    "optimize-prompt-mcp": "src/mcp/server.js"
  },
```

2. Add two dependencies to the `dependencies` object:

```json
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "chalk": "^6.0.0",
    "commander": "^15.0.0",
    "zod": "^3.23.0"
  }
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm install`
Expected: `node_modules/` updated, `@modelcontextprotocol/sdk` and `zod` installed, `package-lock.json` updated.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (23 tests, no regressions from dependency addition)

- [ ] **Step 4: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add package.json package-lock.json
git commit -m "build(deps): add @modelcontextprotocol/sdk and zod for MCP server

Adds MCP TypeScript SDK and zod schema validation as production deps.
Adds optimize-prompt-mcp bin entry pointing to src/mcp/server.js."
```

---

### Task 4: Implement MCP tools module (TDD)

**Files:**
- Create: `src/mcp/tools.js`
- Test: `src/mcp/tools.test.js`

**Interfaces:**
- Consumes (from earlier tasks):
  - `getConfigOrThrow()` from `../config.js` → `Promise<{base_url, api_key, model, docs_dir?}>`
  - `chat({baseURL, apiKey, model, messages})` from `../llm.js` → `Promise<string>`
  - `buildMessages(prompt, codebaseContent)` from `../optimize.js` → `Array<{role, content}>`
  - `extractOptimizedPrompt(raw)` from `../optimize.js` → `string`
  - `loadDocsFromDir(dirPath)` from `../docs.js` → `Promise<{content, fileCount, skipped, totalBytes}>`
- Produces:
  - `optimizePromptHandler({prompt, docsDir}, deps) → Promise<{content: [{type, text}]} | {isError: true, content: [{type, text}]}>` — pure handler function with injectable deps for testing
  - `registerTools(server)` → `void` — registers the `optimize_prompt` tool on an MCP server instance

- [ ] **Step 1: Write failing tests for optimizePromptHandler**

Write `/Users/ts-yinjun.xie/prompt-optimizer/src/mcp/tools.test.js`:

```javascript
// Tests for MCP tools module: optimizePromptHandler
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizePromptHandler } from './tools.js';

// Helper: build mock dependencies for the handler
function makeMocks(overrides = {}) {
  return {
    getConfigOrThrow: async () => ({
      base_url: 'https://x/v1',
      api_key: 'sk-test',
      model: 'gpt-4o',
      ...overrides.config,
    }),
    chat: async () => overrides.chatReturn ?? 'optimized prompt',
    loadDocsFromDir: async () => overrides.docsResult ?? {
      content: 'docs content',
      fileCount: 1,
      skipped: [],
      totalBytes: 100,
    },
    buildMessages: (prompt, docs) => [
      { role: 'system', content: 'system' },
      { role: 'user', content: prompt },
    ],
    extractOptimizedPrompt: (raw) => raw.trim(),
    ...overrides.fns,
  };
}

test('optimizePromptHandler returns optimized text on success', async () => {
  const deps = makeMocks();
  const result = await optimizePromptHandler({ prompt: 'test prompt' }, deps);
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].type, 'text');
  assert.equal(result.content[0].text, 'optimized prompt');
});

test('optimizePromptHandler uses docsDir param over config.docs_dir', async () => {
  let calledPath = null;
  const deps = makeMocks({
    config: { docs_dir: '/from/config' },
    fns: {
      loadDocsFromDir: async (dirPath) => {
        calledPath = dirPath;
        return { content: 'docs', fileCount: 1, skipped: [], totalBytes: 50 };
      },
    },
  });
  await optimizePromptHandler({ prompt: 'test', docsDir: '/from/param' }, deps);
  assert.equal(calledPath, '/from/param');
});

test('optimizePromptHandler uses config.docs_dir when param omitted', async () => {
  let calledPath = null;
  const deps = makeMocks({
    config: { docs_dir: '/from/config' },
    fns: {
      loadDocsFromDir: async (dirPath) => {
        calledPath = dirPath;
        return { content: 'docs', fileCount: 1, skipped: [], totalBytes: 50 };
      },
    },
  });
  await optimizePromptHandler({ prompt: 'test' }, deps);
  assert.equal(calledPath, '/from/config');
});

test('optimizePromptHandler skips docs loading when no docsDir anywhere', async () => {
  let docsCalled = false;
  const deps = makeMocks({
    config: {},
    fns: {
      loadDocsFromDir: async () => { docsCalled = true; return { content: '', fileCount: 0, skipped: [], totalBytes: 0 }; },
    },
  });
  await optimizePromptHandler({ prompt: 'test' }, deps);
  assert.equal(docsCalled, false);
});

test('optimizePromptHandler returns isError when config missing', async () => {
  const deps = makeMocks({
    fns: {
      getConfigOrThrow: async () => { throw new Error('Config not found. Run `optimize-prompt init`.'); },
    },
  });
  const result = await optimizePromptHandler({ prompt: 'test' }, deps);
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Config not found'));
});

test('optimizePromptHandler returns isError when LLM throws', async () => {
  const deps = makeMocks({
    fns: {
      chat: async () => { throw new Error('Network error contacting LLM: timeout'); },
    },
  });
  const result = await optimizePromptHandler({ prompt: 'test' }, deps);
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Network error'));
});

test('optimizePromptHandler returns isError when prompt is empty', async () => {
  const deps = makeMocks();
  const result = await optimizePromptHandler({ prompt: '' }, deps);
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'prompt is required');
});

test('optimizePromptHandler returns isError when prompt is whitespace only', async () => {
  const deps = makeMocks();
  const result = await optimizePromptHandler({ prompt: '   ' }, deps);
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'prompt is required');
});

test('optimizePromptHandler returns isError when loadDocsFromDir throws', async () => {
  const deps = makeMocks({
    fns: {
      loadDocsFromDir: async () => { throw new Error('Directory not found: /bad/path'); },
    },
  });
  const result = await optimizePromptHandler({ prompt: 'test', docsDir: '/bad/path' }, deps);
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes('Directory not found'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && node --test src/mcp/tools.test.js`
Expected: FAIL with "Cannot find module './tools.js'"

- [ ] **Step 3: Implement tools.js**

Write `/Users/ts-yinjun.xie/prompt-optimizer/src/mcp/tools.js`:

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && node --test src/mcp/tools.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (23 previous + 9 new = 32 tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add src/mcp/tools.js src/mcp/tools.test.js
git commit -m "feat(mcp): add optimize_prompt tool handler with dependency injection

optimizePromptHandler is a pure function with injectable deps for
testability. registerTools wires it to real modules. Handler validates
prompt, resolves docsDir (param > config > null), loads docs, calls LLM,
and returns MCP content or isError on failure."
```

---

### Task 5: Create MCP server entry point

**Files:**
- Create: `src/mcp/server.js`

**Interfaces:**
- Consumes: `registerTools(server)` from `./tools.js`, `McpServer` and `StdioServerTransport` from MCP SDK
- Produces: executable `src/mcp/server.js` that starts a stdio MCP server

- [ ] **Step 1: Write server.js**

Write `/Users/ts-yinjun.xie/prompt-optimizer/src/mcp/server.js`:

```javascript
#!/usr/bin/env node
// MCP server entry: stdio transport, registers optimize_prompt tool.
// Launched by AI IDEs (Cursor, Claude Desktop, Windsurf) via node/npx.
// IMPORTANT: never use console.log here — stdout is the JSON-RPC channel.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';

const server = new McpServer({
  name: 'optimize-prompt-mcp',
  version: '0.1.0',
});

registerTools(server);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 2: Make server.js executable**

Run: `chmod +x /Users/ts-yinjun.xie/prompt-optimizer/src/mcp/server.js`

- [ ] **Step 3: Verify the server starts without syntax errors**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && timeout 2 node src/mcp/server.js 2>&1 || true`
Expected: No error output. The server starts and waits for JSON-RPC input on stdin. The `timeout 2` kills it after 2 seconds. (If the MCP SDK prints a startup message, it goes to stderr.)

- [ ] **Step 4: Run full test suite to verify no regressions**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (32 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add src/mcp/server.js
git commit -m "feat(mcp): add stdio MCP server entry point

Assembly-only file: creates McpServer, registers optimize_prompt tool,
connects StdioServerTransport. No console.log (stdout is JSON-RPC channel)."
```

---

### Task 6: Add docs_dir to CLI init command

**Files:**
- Modify: `src/cli.js` (lines 70-77: add optional docs_dir prompt after model prompt)

**Interfaces:**
- No new function signatures; extends `runInit()` to collect and save optional `docs_dir`

- [ ] **Step 1: Add docs_dir prompt to runInit()**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/src/cli.js`. Find this block (lines 70-78):

```javascript
      const base_url = await nextAnswer('base_url (e.g. https://host/v1): ', rl);
      const api_key = await nextAnswer('api_key (sk-...): ', rl);
      const model = await nextAnswer('model name: ', rl);
      if (!base_url || !api_key || !model) {
        console.error(chalk.red('All fields are required.'));
        process.exit(1);
      }
      await saveConfig({ base_url, api_key, model });
      console.log(chalk.green('Config saved.'));
```

Replace with:

```javascript
      const base_url = await nextAnswer('base_url (e.g. https://host/v1): ', rl);
      const api_key = await nextAnswer('api_key (sk-...): ', rl);
      const model = await nextAnswer('model name: ', rl);
      if (!base_url || !api_key || !model) {
        console.error(chalk.red('All fields are required.'));
        process.exit(1);
      }
      const docs_dir = await nextAnswer('docs_dir (optional, press Enter to skip): ', rl);
      await saveConfig({ base_url, api_key, model, ...(docs_dir ? { docs_dir } : {}) });
      console.log(chalk.green('Config saved.'));
```

- [ ] **Step 2: Run full test suite to verify no regressions**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (32 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add src/cli.js
git commit -m "feat(cli): add optional docs_dir prompt to init command

Init now asks for docs_dir after model. Empty input skips the field,
preserving backward compatibility with existing configs."
```

---

### Task 7: Add --codebase-dir option to CLI

**Files:**
- Modify: `src/cli.js` (add import for docs.js, add --codebase-dir option, add mutual-exclusion check, add directory-scanning logic in runOptimize)

**Interfaces:**
- Consumes: `loadDocsFromDir(dirPath)` from `./docs.js`
- No new exports; extends `runOptimize()` to handle `--codebase-dir`

- [ ] **Step 1: Add import for docs.js**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/src/cli.js`. Find the import block at the top (lines 9-11):

```javascript
import { loadConfig, saveConfig, getConfigOrThrow } from './config.js';
import { buildMessages, extractOptimizedPrompt } from './optimize.js';
import { chat } from './llm.js';
```

Replace with:

```javascript
import { loadConfig, saveConfig, getConfigOrThrow } from './config.js';
import { buildMessages, extractOptimizedPrompt } from './optimize.js';
import { chat } from './llm.js';
import { loadDocsFromDir } from './docs.js';
```

- [ ] **Step 2: Add mutual-exclusion check and directory-scanning logic in runOptimize()**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/src/cli.js`. In `runOptimize()`, find the block that handles `opts.codebase` (lines 116-132):

```javascript
    let codebaseContent = null;
    if (opts.codebase) {
      try {
        const stat = await fs.stat(opts.codebase);
        if (!stat.isFile()) {
          console.error(chalk.red(`--codebase path is not a file: ${opts.codebase}`));
          process.exit(1);
        }
        if (stat.size > 100 * 1024) {
          console.warn(chalk.yellow(`Warning: codebase file is large (${Math.round(stat.size / 1024)}KB), may increase token cost.`));
        }
        codebaseContent = await fs.readFile(opts.codebase, 'utf8');
      } catch (err) {
        console.error(chalk.red(`--codebase file not found: ${opts.codebase}`));
        process.exit(1);
      }
    }
```

Replace with:

```javascript
    // --codebase and --codebase-dir are mutually exclusive
    if (opts.codebase && opts.codebaseDir) {
      console.error(chalk.red('Cannot use both --codebase and --codebase-dir. Choose one.'));
      process.exit(1);
    }

    let codebaseContent = null;
    if (opts.codebase) {
      try {
        const stat = await fs.stat(opts.codebase);
        if (!stat.isFile()) {
          console.error(chalk.red(`--codebase path is not a file: ${opts.codebase}`));
          process.exit(1);
        }
        if (stat.size > 100 * 1024) {
          console.warn(chalk.yellow(`Warning: codebase file is large (${Math.round(stat.size / 1024)}KB), may increase token cost.`));
        }
        codebaseContent = await fs.readFile(opts.codebase, 'utf8');
      } catch (err) {
        console.error(chalk.red(`--codebase file not found: ${opts.codebase}`));
        process.exit(1);
      }
    } else if (opts.codebaseDir) {
      try {
        const result = await loadDocsFromDir(opts.codebaseDir);
        codebaseContent = result.content || null;
        console.log(chalk.gray(`Loaded ${result.fileCount} docs, skipped ${result.skipped.length} files from ${opts.codebaseDir}`));
      } catch (err) {
        console.error(chalk.red(`--codebase-dir error: ${err.message}`));
        process.exit(1);
      }
    }
```

- [ ] **Step 3: Add --codebase-dir to commander options**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/src/cli.js`. Find the commander option block (lines 163-168):

```javascript
program
  .name('optimize-prompt')
  .description('Optimize prompts via an OpenAI-compatible LLM endpoint.')
  .option('--codebase <path>', 'path to codebase index document')
  .option('-o, --output <path>', 'output file path (default: stdout)')
  .action(runOptimize);
```

Replace with:

```javascript
program
  .name('optimize-prompt')
  .description('Optimize prompts via an OpenAI-compatible LLM endpoint.')
  .option('--codebase <path>', 'path to a single codebase index file')
  .option('--codebase-dir <path>', 'path to a directory of .md tech docs (recursive scan)')
  .option('-o, --output <path>', 'output file path (default: stdout)')
  .action(runOptimize);
```

- [ ] **Step 4: Verify CLI help shows the new option**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && node src/cli.js --help`
Expected: Help output includes `--codebase-dir <path>` alongside `--codebase <path>`.

- [ ] **Step 5: Test mutual exclusion error**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && echo "test" | node src/cli.js --codebase foo.md --codebase-dir ./docs`
Expected: Red error "Cannot use both --codebase and --codebase-dir. Choose one." and exit 1.

- [ ] **Step 6: Run full test suite**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (32 tests)

- [ ] **Step 7: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add src/cli.js
git commit -m "feat(cli): add --codebase-dir option for directory scanning

New --codebase-dir recursively scans a directory for .md files and
aggregates them as context. Mutually exclusive with --codebase (single
file). Uses shared loadDocsFromDir from docs.js."
```

---

### Task 8: Update README with MCP server documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- No code interfaces; documentation only

- [ ] **Step 1: Add MCP server section to README**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/README.md`. Find the `## How it works` section and add a new section after the `## Development` section (before `## Error Handling`):

Find this text:

```markdown
See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and how to submit pull requests.

## Error Handling
```

Replace with:

```markdown
See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and how to submit pull requests.

## MCP Server

`prompt-optimizer` also ships as an MCP (Model Context Protocol) server, allowing AI IDEs and assistants like **Cursor**, **Claude Desktop**, and **Windsurf** to call `optimize_prompt` as a tool.

### Quick Start

1. Install and configure the CLI first (see [Install](#install) and [Configure](#configure) above).

2. Add the MCP server to your AI IDE config:

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

3. Restart your IDE. The AI assistant can now call `optimize_prompt` to optimize prompts.

### Tool: `optimize_prompt`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The prompt text to optimize |
| `docsDir` | string | No | Absolute path to a directory of `.md` tech docs for context-aware optimization. If omitted, uses `docs_dir` from config. |

The tool returns the optimized prompt as text, or an error message if something goes wrong.

### Optional: Default docs directory

Set a default docs directory in your config so you don't need to pass `docsDir` every time:

```bash
optimize-prompt init
# Follow prompts; enter your docs directory path for docs_dir (or press Enter to skip)
```

Or manually edit `~/.config/prompt-optimizer/config.json`:
```json
{
  "base_url": "...",
  "api_key": "...",
  "model": "...",
  "docs_dir": "/path/to/your/docs"
}
```

## Error Handling
```

- [ ] **Step 2: Run full test suite to verify no code regressions**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (32 tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add README.md
git commit -m "docs: add MCP server usage section to README

Documents how to configure Cursor and Claude Desktop to use
optimize-prompt as an MCP tool, including the optimize_prompt tool
schema and optional docs_dir configuration."
```

---

### Task 9: Final verification and smoke test

**Files:**
- No file changes; verification only

- [ ] **Step 1: Run full test suite one final time**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (32 tests total: 15 original + 8 docs + 9 mcp tools)

- [ ] **Step 2: Verify CLI --codebase-dir works**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && mkdir -p /tmp/po-smoke && echo "# Test Doc" > /tmp/po-smoke/test.md && echo "optimize this prompt" | node src/cli.js --codebase-dir /tmp/po-smoke 2>&1; rm -rf /tmp/po-smoke`
Expected: Either an optimized prompt (if config/LLM is set up) or a clean error message (if not). No crash, no stack trace.

- [ ] **Step 3: Verify MCP server starts and responds to tools/list**

Run:
```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 3 node src/mcp/server.js 2>/dev/null | head -1
```
Expected: A JSON response containing `"name":"optimize-prompt-mcp"` in the server info. (The server reads the initialize request from stdin and responds on stdout.)

- [ ] **Step 4: Verify git status is clean**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && git status`
Expected: "nothing to commit, working tree clean"

- [ ] **Step 5: Push all commits**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git push
```

Expected: All new commits pushed to `origin/main`. CI triggers automatically.
```
