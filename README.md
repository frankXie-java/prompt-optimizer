# prompt-optimizer

[![CI](https://github.com/frankXie-java/prompt-optimizer/actions/workflows/test.yml/badge.svg)](https://github.com/frankXie-java/prompt-optimizer/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

Local CLI tool to optimize prompts via OpenAI-compatible LLM endpoints.

## Features

- **Single responsibility** — only optimizes prompts, nothing else
- **OpenAI-compatible** — works with any `/v1/chat/completions` endpoint
- **Optional codebase context** — inject a codebase index document for context-aware optimization
- **Minimal dependencies** — only `commander` + `chalk`, everything else uses Node built-ins
- **Privacy-first** — config stored locally with `0600` permissions, no telemetry

## Install

```bash
git clone https://github.com/frankXie-java/prompt-optimizer.git
cd prompt-optimizer
npm install
npm link
```

> Requires Node.js >= 20 (uses built-in `fetch` and `readline/promises`).

## Configure

```bash
optimize-prompt init
```

Interactive prompts for:

- `base_url` — e.g. `https://api.example.com/v1`
- `api_key` — your API key (`sk-...`)
- `model` — model name (e.g. `gpt-4o`)

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
  --codebase <path>  path to codebase index document
  -o, --output <path>  output file path (default: stdout)

Commands:
  init  Initialize config interactively
```

## How it works

```
stdin (prompt)  ──┐
                  ├─→ build messages ─→ call LLM ─→ extract ─→ stdout / -o file
--codebase file ──┘
```

Four focused modules:

| Module | Responsibility |
|--------|----------------|
| `src/config.js` | Config read/write/validation (`~/.config/prompt-optimizer/config.json`, `0600`) |
| `src/llm.js` | OpenAI-compatible HTTP client (retry once on network error, clear 401/403 errors) |
| `src/optimize.js` | Message assembly + markdown fence stripping |
| `src/cli.js` | Commander entrypoint (`init` subcommand + default optimize command) |

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
