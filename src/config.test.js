// Tests for config module: loadConfig, saveConfig, getConfigOrThrow
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, saveConfig, getConfigOrThrow } from './config.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Helper: create a temp config dir for isolated tests
function withTempConfig(fn) {
  return async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'po-test-'));
    const origHome = process.env.HOME;
    process.env.HOME = tmpDir;
    try {
      await fn(tmpDir);
    } finally {
      process.env.HOME = origHome;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

test('loadConfig returns null when config file does not exist', withTempConfig(async () => {
  const cfg = await loadConfig();
  assert.equal(cfg, null);
}));

test('saveConfig writes file and loadConfig reads it back', withTempConfig(async () => {
  const cfg = { base_url: 'https://x/v1', api_key: 'sk-test', model: 'gpt-4o' };
  await saveConfig(cfg);
  const loaded = await loadConfig();
  assert.deepEqual(loaded, cfg);
}));

test('saveConfig sets file permission to 0600', withTempConfig(async () => {
  await saveConfig({ base_url: 'u', api_key: 'k', model: 'm' });
  const stat = fs.statSync(path.join(process.env.HOME, '.config', 'prompt-optimizer', 'config.json'));
  const mode = stat.mode & 0o777;
  assert.equal(mode, 0o600);
}));

test('getConfigOrThrow throws when config missing', withTempConfig(async () => {
  await assert.rejects(
    () => getConfigOrThrow(),
    (err) => {
      assert.match(err.message, /Config not found/);
      // Error message must include the npx command for users without global install
      assert.match(err.message, /npx -p @frankxie-java\/optimize-prompt-mcp/);
      return true;
    },
  );
}));

test('getConfigOrThrow throws when field missing', withTempConfig(async () => {
  await saveConfig({ base_url: 'u', api_key: '', model: 'm' });
  await assert.rejects(() => getConfigOrThrow(), /missing required field: api_key/);
}));

test('getConfigOrThrow returns config when valid', withTempConfig(async () => {
  const cfg = { base_url: 'https://x/v1', api_key: 'sk-test', model: 'gpt-4o' };
  await saveConfig(cfg);
  const got = await getConfigOrThrow();
  assert.deepEqual(got, cfg);
}));