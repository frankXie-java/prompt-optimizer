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
