# Contributing to prompt-optimizer

Thanks for your interest in contributing! This document covers the development workflow and standards.

## Development Setup

```bash
git clone https://github.com/frankXie-java/prompt-optimizer.git
cd prompt-optimizer
npm install
```

Requirements:

- Node.js >= 20
- An OpenAI-compatible LLM endpoint (for manual end-to-end testing)

## Development Workflow

### Running Tests

```bash
# All tests
npm test

# Single module
node --test src/config.test.js
```

Tests use the built-in `node:test` runner — no extra dev dependencies.

### Test-Driven Development (TDD)

This project follows TDD (red-green-refactor):

1. **Red** — write a failing test for the new behavior
2. **Green** — write the minimal code to make it pass
3. **Refactor** — clean up while keeping tests green

When adding a feature or fixing a bug, add or update tests first.

## Coding Standards

### Style

- **ESM modules** (`"type": "module"` in `package.json`)
- **camelCase** for variables and functions
- **Single responsibility** — functions under 50 lines, at most 4 parameters
- **Guard clauses and early returns** over deep nesting
- **No `any`/`as` casts** — keep types explicit
- **Comments in English** — explain *why*, not *what*

### Dependencies

- Only two production deps allowed: `commander`, `chalk`
- Everything else must use Node built-ins (`fs`, `path`, `os`, `readline`, `fetch`, `node:test`)
- No new dev dependencies unless discussed in an issue first

### Error Handling

- Never swallow exceptions (no empty `catch`)
- Print a clean one-line red message via `chalk.red()` and `process.exit(1)` — no stack traces
- Throw specific, actionable error messages that tell the user how to fix the problem

### Security

- Never hardcode secrets, tokens, or API keys
- Config file is written with `0600` permissions
- Never log sensitive fields (passwords, API keys, PII)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

- **type**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `build`, `ci`
- **scope**: module name (`config`, `llm`, `optimize`, `cli`) or omitted
- **subject**: English imperative, lowercase first word, no trailing period, max 72 chars

Examples:

```
feat(llm): add streaming response support
fix(config): handle corrupted JSON gracefully
docs: clarify installation steps in README
test(optimize): add cases for nested code fences
```

Each commit should be self-contained, buildable, and revertible.

## Pull Request Process

1. **Open an issue first** for feature requests or major changes — discuss before coding
2. **Fork and branch** from `main`: `git checkout -b feat/my-feature`
3. **Write tests** for your change (TDD)
4. **Ensure all tests pass**: `npm test`
5. **Write a clear PR description**: what changed, why, and how to verify
6. **Keep PRs focused** — one logical change per PR

### PR Checklist

- [ ] Tests added/updated and passing (`npm test`)
- [ ] No new production dependencies (or justified in PR description)
- [ ] Commit messages follow Conventional Commits
- [ ] No secrets, API keys, or personal information in the diff
- [ ] README updated if user-facing behavior changed

## Reporting Bugs

Open a [GitHub Issue](https://github.com/frankXie-java/prompt-optimizer/issues) with:

1. **Environment**: Node version, OS, `optimize-prompt` version
2. **Steps to reproduce** — exact commands
3. **Expected vs actual behavior**
4. **Error output** (redact any API keys)

## Project Structure

```
src/
├── cli.js              # Commander entrypoint (init + optimize)
├── config.js           # Config read/write/validation
├── llm.js              # OpenAI-compatible HTTP client
├── optimize.js         # Message assembly + result extraction
├── config.test.js
├── llm.test.js
└── optimize.test.js
```
