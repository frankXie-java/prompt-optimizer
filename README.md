# prompt-optimizer

[![CI](https://github.com/frankXie-java/prompt-optimizer/actions/workflows/test.yml/badge.svg)](https://github.com/frankXie-java/prompt-optimizer/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

Local CLI tool to optimize prompts via OpenAI-compatible LLM endpoints.

## Features

- **Single responsibility** — only optimizes prompts, nothing else
- **OpenAI-compatible** — works with any `/v1/chat/completions` endpoint
- **Optional codebase context** — inject a single file or scan a directory of `.md` tech docs for context-aware optimization
- **MCP server** — usable as a tool by AI IDEs (Cursor, Claude Desktop, Windsurf)
- **Minimal dependencies** — `commander`, `chalk`, `@modelcontextprotocol/sdk`, `zod`; everything else uses Node built-ins
- **Privacy-first** — config stored locally with `0600` permissions, no telemetry

## Quick Start

1. **Configure npm scope** (one-time — needed because this package is on GitHub Packages):

```bash
echo '@frankxie-java:registry=https://npm.pkg.github.com' >> ~/.npmrc
```

2. **Initialize config** (one-time — sets your LLM endpoint, API key, and model):

```bash
npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt init
```

You'll be prompted for:

- `base_url` — e.g. `https://api.openai.com/v1`, `https://api.deepseek.com/v1`
- `api_key` — your API key (`sk-...`)
- `model` — e.g. `gpt-4o`, `deepseek-chat`
- `docs_dir` — optional, path to a directory of `.md` tech docs (press Enter to skip)

Config is saved to `~/.config/prompt-optimizer/config.json` with `0600` permissions.

3. **Use as MCP server** (Cursor / Claude Desktop / OpenCode / Windsurf):

**Cursor** (`~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "optimize-prompt": {
      "command": "npx",
      "args": ["-y", "@frankxie-java/optimize-prompt-mcp"]
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
      "args": ["-y", "@frankxie-java/optimize-prompt-mcp"]
    }
  }
}
```

Restart your IDE. The AI assistant can now call `optimize_prompt` to optimize prompts.

4. **Or use as CLI**:

```bash
# Basic optimization (stdin → stdout)
echo "write a login function" | npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt

# With tech docs context
echo "implement auth module" | npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt --codebase-dir ./docs

# Output to file
echo "implement auth module" | npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt -o optimized.md
```

---

## Install

### Via GitHub Packages

This package is published to GitHub Packages. Before installing, configure npm to resolve the `@frankxie-java` scope:

```bash
# One-time setup: add scope registry to ~/.npmrc
echo '@frankxie-java:registry=https://npm.pkg.github.com' >> ~/.npmrc

# Global install — both `optimize-prompt` (CLI) and `optimize-prompt-mcp` (MCP server) available
npm install -g @frankxie-java/optimize-prompt-mcp

# Or use directly with npx (no install needed)
npx @frankxie-java/optimize-prompt-mcp
```

### From source (for development)

```bash
git clone https://github.com/frankXie-java/prompt-optimizer.git
cd prompt-optimizer
npm install
npm link
```

> Requires Node.js >= 20 (uses built-in `fetch` and `readline/promises`).

## Configure

If you installed globally (`npm install -g`), use the short command:

```bash
optimize-prompt init
```

Otherwise use the npx form:

```bash
npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt init
```

Interactive prompts for:

- `base_url` — e.g. `https://api.openai.com/v1`
- `api_key` — your API key (`sk-...`)
- `model` — model name (e.g. `gpt-4o`)
- `docs_dir` — optional path to a directory of `.md` tech docs (press Enter to skip)

Config is saved to `~/.config/prompt-optimizer/config.json` with `0600` permissions.

## Usage

### Basic optimization (stdin → stdout)

```bash
echo "写一个登录函数" | optimize-prompt
```

### With codebase context, output to file

```bash
echo "实现用户认证模块" | optimize-prompt --codebase ./codebase.md -o optimized.md
```

### With directory of tech docs (recursive scan)

```bash
echo "实现用户认证模块" | optimize-prompt --codebase-dir ./docs -o optimized.md
```

Scans the directory for `.md`/`.markdown` files (skips `node_modules`, hidden files, files >50KB), aggregates them as context for the LLM.

### Multi-line prompt (heredoc)

```bash
optimize-prompt << 'EOF'
帮我写一个函数，
接收用户输入并验证
EOF
```

### Options

```
Options:
  --codebase <path>      path to a single codebase index file
  --codebase-dir <path>  path to a directory of .md tech docs (recursive scan)
  -o, --output <path>    output file path (default: stdout)

Commands:
  init  Initialize config interactively
```

## How it works

```
stdin (prompt)  ──┐
                  ├─→ build messages ─→ call LLM ─→ extract ─→ stdout / -o file
--codebase file ──┘  (or --codebase-dir, mutually exclusive)
```

Modules:

| Module | Responsibility |
|--------|----------------|
| `src/config.js` | Config read/write/validation (`~/.config/prompt-optimizer/config.json`, `0600`) |
| `src/llm.js` | OpenAI-compatible HTTP client (retry once on network error, clear 401/403 errors) |
| `src/optimize.js` | Message assembly + markdown fence stripping |
| `src/docs.js` | Recursive `.md` directory scanning + document aggregation |
| `src/cli.js` | Commander entrypoint (`init` subcommand + default optimize command) |
| `src/mcp/server.js` | MCP server entry (stdio transport, for AI IDEs) |
| `src/mcp/tools.js` | MCP tool registration (`optimize_prompt`) |

## Development

```bash
# Install dependencies
npm install

# Run tests (15 unit tests, no e2e)
npm test

# Run a specific test file
node --test src/config.test.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding standards, and how to submit pull requests.

## MCP Server

`prompt-optimizer` also ships as an MCP (Model Context Protocol) server, allowing AI IDEs and assistants like **Cursor**, **Claude Desktop**, and **Windsurf** to call `optimize_prompt` as a tool.

See [Quick Start](#quick-start) step 3 above for IDE configuration examples.

### Tool: `optimize_prompt`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The prompt text to optimize |
| `docsDir` | string | No | Absolute path to a directory of `.md` tech docs for context-aware optimization. If omitted, uses `docs_dir` from config. |

The tool returns the optimized prompt as text, or an error message if something goes wrong.

### Optional: Default docs directory

Set a default docs directory in your config so you don't need to pass `docsDir` every time:

```bash
npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt init
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

All errors print a clean red one-line message and `exit(1)` (no stack traces):

| Scenario | Behavior |
|----------|----------|
| Config missing or invalid | Prompt to run `optimize-prompt init` |
| `--codebase` file not found | Red error with path |
| Empty stdin | "No prompt provided on stdin." |
| LLM 401/403 | "API Key invalid or unauthorized" |
| LLM network error | Retry once (1s delay), then red error |
| LLM response missing content | Red error with truncated raw response (500 chars) |
| `-o` parent dir missing | Red error with directory path |

## License

[MIT](LICENSE) — Copyright (c) 2026 frankXie-java
