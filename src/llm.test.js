// Tests for the llm module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chat } from './llm.js';

// Mock fetch by overriding global.fetch
function mockFetch(response) {
  global.fetch = async () => response;
}

test('chat returns assistant message content on success', async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'optimized prompt' } }],
    }),
  });
  const result = await chat({
    baseURL: 'https://x/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(result, 'optimized prompt');
});

test('chat throws on 401 with clear message', async () => {
  mockFetch({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'invalid api key' } }),
  });
  await assert.rejects(
    () => chat({ baseURL: 'https://x/v1', apiKey: 'bad', model: 'm', messages: [] }),
    /API Key invalid or unauthorized: invalid api key/,
  );
});

test('chat throws when response missing content', async () => {
  mockFetch({
    ok: true,
    status: 200,
    json: async () => ({ choices: [] }),
  });
  await assert.rejects(
    () => chat({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm', messages: [] }),
    /missing choices.*Raw response/,
  );
});