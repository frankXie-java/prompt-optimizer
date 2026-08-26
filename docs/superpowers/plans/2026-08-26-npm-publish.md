# npm Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `optimize-prompt-mcp` to npm so `npx optimize-prompt-mcp` works out of the box, and update all docs/configs to use the published package.

**Architecture:** Rename the npm package from `prompt-optimizer` (taken) to `optimize-prompt-mcp` (available). Add a `files` whitelist to control published contents and a `prepublishOnly` test gate. After publish, update README and OpenCode config to reference `npx optimize-prompt-mcp` instead of local paths.

**Tech Stack:** Node.js >= 20 ESM, npm registry, `node:test` (pre-publish gate).

## Global Constraints

- Package name: `optimize-prompt-mcp` (npm name `prompt-optimizer` is taken by klausners; `optimize-prompt-mcp` is available)
- Version: `0.1.0` (first publish, no beta/pre-release tags)
- Node.js >= 20 runtime, ESM modules (`"type": "module"`)
- All code comments in English (AGENTS.md rule 1.1)
- No auto-commit; user commits manually (AGENTS.md rule 7.1)
- Conventional Commits format: `<type>(<scope>): <subject>`
- Project root: `/Users/ts-yinjun.xie/prompt-optimizer`
- Manual publish (no GitHub Actions auto-publish — user chose manual)
- User does NOT yet have an npm account — must register at npmjs.com first
- Tests: `node --test src/*.test.js src/mcp/*.test.js`, 34 tests must pass before publish

---

### Task 1: Update package.json for npm publish

**Files:**
- Modify: `package.json` (name, description, add files, add prepublishOnly, update keywords)

**Interfaces:**
- No code interfaces; this is a metadata/config change

- [ ] **Step 1: Read current package.json to confirm exact content**

Run: `cat /Users/ts-yinjun.xie/prompt-optimizer/package.json`
Expected: Current content with `"name": "prompt-optimizer"`, no `files` field, no `prepublishOnly` script.

- [ ] **Step 2: Rename package and update description**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`. Change:

```json
  "name": "prompt-optimizer",
  "version": "0.1.0",
  "description": "Local CLI tool to optimize prompts via OpenAI-compatible LLM endpoints",
```

to:

```json
  "name": "optimize-prompt-mcp",
  "version": "0.1.0",
  "description": "MCP server and CLI to optimize prompts via OpenAI-compatible LLMs",
```

- [ ] **Step 3: Add `files` whitelist after the `bin` field**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`. After the `bin` block:

```json
  "bin": {
    "optimize-prompt": "src/cli.js",
    "optimize-prompt-mcp": "src/mcp/server.js"
  },
```

add:

```json
  "files": [
    "src/",
    "README.md",
    "LICENSE"
  ],
```

- [ ] **Step 4: Add `prepublishOnly` script**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`. Change the `scripts` block from:

```json
  "scripts": {
    "test": "node --test src/*.test.js src/mcp/*.test.js"
  },
```

to:

```json
  "scripts": {
    "test": "node --test src/*.test.js src/mcp/*.test.js",
    "prepublishOnly": "npm test"
  },
```

- [ ] **Step 5: Update keywords for npm discoverability**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/package.json`. Change the `keywords` array from:

```json
  "keywords": [
    "cli",
    "prompt",
    "prompt-optimization",
    "llm",
    "openai",
    "ai",
    "nodejs"
  ],
```

to:

```json
  "keywords": [
    "cli",
    "mcp",
    "mcp-server",
    "prompt",
    "prompt-optimization",
    "llm",
    "openai",
    "ai",
    "nodejs",
    "model-context-protocol"
  ],
```

- [ ] **Step 6: Verify tests still pass**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (34 tests). The metadata changes should not affect tests.

- [ ] **Step 7: Verify package contents with dry-run**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm pack --dry-run 2>&1`
Expected: Output lists only `package.json`, `README.md`, `LICENSE`, and files under `src/` (config.js, llm.js, optimize.js, docs.js, cli.js, mcp/server.js, mcp/tools.js, and all *.test.js files). No `docs/`, no `.github/`, no `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, no `.superpowers/`.

- [ ] **Step 8: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add package.json
git commit -m "build(npm): rename package to optimize-prompt-mcp, add files whitelist and prepublishOnly

Package renamed from prompt-optimizer (taken on npm) to optimize-prompt-mcp
(available). Adds files whitelist to control published contents (src/,
README.md, LICENSE only). Adds prepublishOnly script to gate publish on
test suite passing. Adds mcp/mcp-server/model-context-protocol keywords."
```

---

### Task 2: Update README for npm install and npx

**Files:**
- Modify: `README.md` (Install section lines 18-27, MCP Server config examples lines 130-160)

**Interfaces:**
- No code interfaces; documentation only

- [ ] **Step 1: Read current README Install section**

Run: `cat /Users/ts-yinjun.xie/prompt-optimizer/README.md | head -30`
Expected: Install section with only git clone instructions (lines 18-27).

- [ ] **Step 2: Update Install section to add npm/npx methods**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/README.md`. Replace the entire Install section:

```markdown
## Install

```bash
git clone https://github.com/frankXie-java/prompt-optimizer.git
cd prompt-optimizer
npm install
npm link
```

> Requires Node.js >= 20 (uses built-in `fetch` and `readline/promises`).
```

with:

```markdown
## Install

### Via npm (recommended)

```bash
# Global install — both `optimize-prompt` (CLI) and `optimize-prompt-mcp` (MCP server) available
npm install -g optimize-prompt-mcp

# Or use directly with npx (no install needed)
npx optimize-prompt-mcp
```

### From source (for development)

```bash
git clone https://github.com/frankXie-java/prompt-optimizer.git
cd prompt-optimizer
npm install
npm link
```

> Requires Node.js >= 20 (uses built-in `fetch` and `readline/promises`).
```

- [ ] **Step 3: Update Cursor MCP config example to use npx**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/README.md`. Find the Cursor config block:

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

Replace with:

```json
{
  "mcpServers": {
    "optimize-prompt": {
      "command": "npx",
      "args": ["-y", "optimize-prompt-mcp"]
    }
  }
}
```

- [ ] **Step 4: Update Claude Desktop MCP config example to use npx**

Edit `/Users/ts-yinjun.xie/prompt-optimizer/README.md`. Find the Claude Desktop config block:

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

Replace with:

```json
{
  "mcpServers": {
    "optimize-prompt": {
      "command": "npx",
      "args": ["-y", "optimize-prompt-mcp"]
    }
  }
}
```

- [ ] **Step 5: Verify no remaining local-path references in README**

Run: `grep -n "absolute/path/to" /Users/ts-yinjun.xie/prompt-optimizer/README.md`
Expected: No output (0 matches). All local-path references replaced with npx.

- [ ] **Step 6: Commit**

```bash
cd /Users/ts-yinjun.xie/prompt-optimizer
git add README.md
git commit -m "docs: update README for npm install and npx-based MCP config

Adds npm install and npx usage to Install section. Updates Cursor and
Claude Desktop MCP config examples from local node path to npx -y
optimize-prompt-mcp."
```

---

### Task 3: Publish to npm

**Files:**
- No file changes; this is an external registry operation

**Prerequisites (user must complete manually before this task):**
1. Register at [npmjs.com/signup](https://www.npmjs.com/signup) (free)
2. Run `npm login` in terminal and authenticate

**Interfaces:**
- No code interfaces

- [ ] **Step 1: Verify npm login status**

Run: `npm whoami`
Expected: Your npm username (confirms you are logged in). If this fails with ENEEDAUTH, stop and run `npm login` first.

- [ ] **Step 2: Run the full test suite**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm test`
Expected: PASS (34 tests). The `prepublishOnly` hook will also run this, but verifying first avoids a failed publish attempt.

- [ ] **Step 3: Preview published contents with dry-run**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm pack --dry-run 2>&1`
Expected: File list contains ONLY: `package.json`, `README.md`, `LICENSE`, and `src/**` files. No `docs/`, no `.github/`, no config files with secrets. **If any unexpected file appears, stop and fix the `files` whitelist before proceeding.**

- [ ] **Step 4: Publish to npm**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && npm publish`
Expected: Output like `+ optimize-prompt-mcp@0.1.0` confirming successful publish. If you have 2FA enabled, you may be prompted for an OTP code.

- [ ] **Step 5: Verify the package is live on npm**

Run: `npm view optimize-prompt-mcp`
Expected: Package metadata showing version `0.1.0`, description, bin entries (`optimize-prompt`, `optimize-prompt-mcp`), and the tarball URL.

- [ ] **Step 6: Smoke test — npx can launch the MCP server**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx -y optimize-prompt-mcp 2>/dev/null | head -1
```
Expected: JSON response containing `"name":"optimize-prompt-mcp"` in serverInfo. This confirms `npx optimize-prompt-mcp` works end-to-end.

**Note:** The first `npx` run may take a few seconds to download the package. Subsequent runs use the cache.

---

### Task 4: Update OpenCode local config to use npx

**Files:**
- Modify: `~/.config/opencode/opencode.jsonc` (the `optimize-prompt` MCP server entry)

**Interfaces:**
- No code interfaces; local config change

- [ ] **Step 1: Read current OpenCode config optimize-prompt entry**

Run: `grep -A 8 '"optimize-prompt"' ~/.config/opencode/opencode.jsonc`
Expected: Current config with `"command": ["node", "/Users/ts-yinjun.xie/prompt-optimizer/src/mcp/server.js"]`.

- [ ] **Step 2: Update the command from local path to npx**

Edit `/Users/ts-yinjun.xie/.config/opencode/opencode.jsonc`. Find:

```jsonc
    "optimize-prompt": {
      "type": "local",
      "command": [
        "node",
        "/Users/ts-yinjun.xie/prompt-optimizer/src/mcp/server.js"
      ],
      "enabled": true,
      "timeout": 60000
    }
```

Replace with:

```jsonc
    "optimize-prompt": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "optimize-prompt-mcp"
      ],
      "enabled": true,
      "timeout": 60000
    }
```

- [ ] **Step 3: Verify the config change**

Run: `grep -A 8 '"optimize-prompt"' ~/.config/opencode/opencode.jsonc`
Expected: Updated config showing `"command": ["npx", "-y", "optimize-prompt-mcp"]`.

- [ ] **Step 4: No commit needed (this file is outside the repo)**

This is a local config file at `~/.config/opencode/opencode.jsonc`, not part of the git repo. No git operation needed.

---

### Task 5: Final commit, push, and verification

**Files:**
- No new file changes; this task verifies everything and pushes

- [ ] **Step 1: Verify git status is clean**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && git status`
Expected: "nothing to commit, working tree clean" (all changes from Tasks 1-2 are committed).

- [ ] **Step 2: Push all commits to GitHub**

Run: `cd /Users/ts-yinjun.xie/prompt-optimizer && git push`
Expected: Commits pushed to `origin/main`. CI triggers automatically.

- [ ] **Step 3: Final verification checklist**

Confirm all of the following:

```bash
# 1. npm package is live
npm view optimize-prompt-mcp version
# Expected: 0.1.0

# 2. npx launches MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx -y optimize-prompt-mcp 2>/dev/null | head -1
# Expected: JSON with "optimize-prompt-mcp" in serverInfo

# 3. CLI help works via npx
npx -p optimize-prompt-mcp optimize-prompt --help
# Expected: Help output with --codebase, --codebase-dir, -o options

# 4. OpenCode config uses npx
grep -A 5 '"optimize-prompt"' ~/.config/opencode/opencode.jsonc | grep npx
# Expected: "npx" in the command array

# 5. README has no local-path references
grep -c "absolute/path/to" /Users/ts-yinjun.xie/prompt-optimizer/README.md
# Expected: 0

# 6. Git is clean and pushed
cd /Users/ts-yinjun.xie/prompt-optimizer && git status && git log --oneline -3
# Expected: clean, 3 recent commits visible
```

- [ ] **Step 4: Restart OpenCode to pick up the new MCP config**

The user must restart OpenCode for the `npx`-based MCP config to take effect. After restart, test the `optimize_prompt` MCP tool by asking the AI to optimize a prompt.
