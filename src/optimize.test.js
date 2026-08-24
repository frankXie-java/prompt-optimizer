import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessages, extractOptimizedPrompt } from './optimize.js';

test('buildMessages without codebase returns system + user message', () => {
  const msgs = buildMessages('write a function', null);
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.equal(msgs[1].role, 'user');
  assert.equal(msgs[1].content, 'write a function');
});

test('buildMessages with codebase appends codebase block', () => {
  const msgs = buildMessages('write a function', 'FILE: foo.js');
  assert.ok(msgs[1].content.includes('<codebase>FILE: foo.js</codebase>'));
  assert.ok(msgs[1].content.includes('Use the above codebase'));
});

test('extractOptimizedPrompt returns plain text unchanged', () => {
  assert.equal(extractOptimizedPrompt('just text'), 'just text');
});

test('extractOptimizedPrompt strips markdown fences', () => {
  const raw = '```markdown\noptimized prompt here\n```';
  assert.equal(extractOptimizedPrompt(raw), 'optimized prompt here');
});

test('extractOptimizedPrompt strips bare fences', () => {
  const raw = '```\noptimized\n```';
  assert.equal(extractOptimizedPrompt(raw), 'optimized');
});

test('extractOptimizedPrompt trims whitespace', () => {
  assert.equal(extractOptimizedPrompt('  text  '), 'text');
});