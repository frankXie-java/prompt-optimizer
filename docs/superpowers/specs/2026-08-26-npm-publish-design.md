# npm Publish Design Spec

> **Date:** 2026-08-26
> **Status:** Approved (brainstorming complete)
> **Goal:** Publish `optimize-prompt-mcp` to npm so `npx optimize-prompt-mcp` works out of the box

## Context

The MCP server feature is complete (commit `3654317`). The project is currently only usable via local clone + `npm link`. Publishing to npm makes the tool accessible via `npx optimize-prompt-mcp` and `npm install -g optimize-prompt-mcp`, which is the core success criterion.

### Constraint: Package Name Conflict

| Package name | npm status |
|--------------|------------|
| `prompt-optimizer` | Taken (klausners — promptfoo-based tool) |
| `prompt-optimizer-mcp` | Taken (linshenkx — similar MCP tool) |
| `optimize-prompt-mcp` | **Available** (chosen) |
| `optimize-prompt` | Available (not used as package name) |

**Decision:** Package name = `optimize-prompt-mcp`. This matches the MCP bin name, so `npx optimize-prompt-mcp` directly launches the MCP server — the core user goal.

## 1. package.json Changes

Three changes to `/Users/ts-yinjun.xie/prompt-optimizer/package.json`:

### 1.1 Rename package

```diff
- "name": "prompt-optimizer",
+ "name": "optimize-prompt-mcp",
```

### 1.2 Update description

```diff
- "description": "Local CLI tool to optimize prompts via OpenAI-compatible LLM endpoints",
+ "description": "MCP server and CLI to optimize prompts via OpenAI-compatible LLMs",
```

### 1.3 Add `files` whitelist

```jsonc
"files": [
  "src/",
  "README.md",
  "LICENSE"
]
```

The whitelist controls what gets published. Only `src/` (code + tests), `README.md`, and `LICENSE` are included. Automatically excluded: `docs/superpowers/` (design docs with local paths), `.superpowers/` (SDD scratch), `.github/`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`. `package.json` is always included by npm.

### 1.4 Add `prepublishOnly` script

```jsonc
"scripts": {
  "test": "node --test src/*.test.js src/mcp/*.test.js",
  "prepublishOnly": "npm test"
}
```

`prepublishOnly` runs the full test suite before `npm publish`. If any test fails, the publish aborts. This prevents shipping a broken package.

### 1.5 Add `keywords` for discoverability

Add `mcp`, `mcp-server`, `model-context-protocol` to the existing keywords array (keep the existing ones: `cli`, `prompt`, `prompt-optimization`, `llm`, `openai`, `ai`, `nodejs`). Final list:

```jsonc
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
]
```

## 2. Published Package Contents

After `files` whitelist, the published tarball contains:

```
package.json
README.md
LICENSE
src/config.js
src/llm.js
src/optimize.js
src/docs.js
src/cli.js
src/mcp/server.js
src/mcp/tools.js
src/config.test.js
src/llm.test.js
src/optimize.test.js
src/docs.test.js
src/mcp/tools.test.js
```

Estimated size: <50KB (lightweight). Test files are included intentionally — small, and let users verify behavior.

## 3. Publish Flow

### 3.1 Prerequisites (user manual operations)

1. Register at [npmjs.com/signup](https://www.npmjs.com/signup) (free)
2. Run `npm login` in terminal (enter username, password, email, OTP if 2FA enabled)

### 3.2 Publish steps

```bash
# 1. Verify tests pass
npm test

# 2. Preview what will be published (confirm no sensitive files leak)
npm pack --dry-run

# 3. Publish
npm publish

# 4. Verify the package is live
npm view optimize-prompt-mcp

# 5. Smoke test: npx can launch the MCP server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx optimize-prompt-mcp 2>/dev/null | head -1
```

**`npm pack --dry-run`** is the critical safety check — it lists every file that would be included in the tarball without actually creating it. Confirm no `~/.config/` paths, no API keys, no personal info appears.

### 3.3 What NOT to do (YAGNI)

- No GitHub Actions auto-publish (user chose manual)
- No scoped package (unscoped name is available)
- No beta/pre-release tags (first publish is 0.1.0 stable)
- No `npm dist-tag` management (default `latest` is fine)

## 4. README Updates

Two updates to `README.md`:

### 4.1 Install section — add npm/npx methods

Current Install section only has git clone. Add npm methods above it:

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
```

### 4.2 MCP Server section — update config examples to use npx

Replace the local-path command with npx:

**Cursor** (`~/.cursor/mcp.json`):
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

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

The `-y` flag auto-confirms the npx install prompt (required for non-interactive MCP server launches).

## 5. OpenCode Local Config Update

Update `~/.config/opencode/opencode.jsonc` — change the `optimize-prompt` MCP server command from local path to npx:

```jsonc
"optimize-prompt": {
  "type": "local",
  "command": ["npx", "-y", "optimize-prompt-mcp"],
  "enabled": true,
  "timeout": 60000
}
```

This removes the dependency on the local repo path — the tool works from any machine with Node.js installed.

## 6. Post-Publish Verification Checklist

After `npm publish` succeeds:

- [ ] `npm view optimize-prompt-mcp` shows version 0.1.0
- [ ] `npm view optimize-prompt-mcp dist.tarball` URL is accessible
- [ ] `npx optimize-prompt-mcp` launches MCP server (test with initialize handshake)
- [ ] `npx -p optimize-prompt-mcp optimize-prompt --help` shows CLI help
- [ ] GitHub README updated with npm install instructions
- [ ] OpenCode config updated to use npx (restart OpenCode to verify)
- [ ] Commit all changes with conventional commit message

## Out of Scope

- Version bumping strategy (semver policy) — deferred to future
- `npm deprecate` / unpublish workflow — not needed
- CHANGELOG.md — not requested, YAGNI for 0.1.0
- Provenance / signing — npm doesn't require for unscoped packages
