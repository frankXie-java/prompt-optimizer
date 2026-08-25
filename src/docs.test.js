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

// Regression: walkDir must actually recurse into non-hidden subdirectories.
// Every prior test places .md files at the root; without a nested non-hidden
// directory, a broken walkDir (no recursion) would still pass all tests.
test('loadDocsFromDir recurses into non-hidden subdirectories', withTempDir(async (tmp) => {
  writeFile(tmp, 'root.md', 'Root content');
  writeFile(tmp, 'guide/intro.md', 'Intro content');
  const result = await loadDocsFromDir(tmp);
  assert.equal(result.fileCount, 2, 'should include both root and nested file');
  assert.ok(result.content.includes('## guide/intro.md'), 'should include nested file header with relative path');
  assert.ok(result.content.includes('Intro content'), 'should include nested file content');
  assert.ok(result.content.includes('## root.md'), 'should include root file header');
}));

// Regression: loadDocsFromDir must warn on stderr when total aggregated size
// exceeds 200KB. Each file stays under the 50KB single-file limit, so the
// warning is triggered by the sum, not by any individual file.
test('loadDocsFromDir warns on stderr when total size exceeds 200KB', withTempDir(async (tmp) => {
  // 5 files of 45KB each = 225KB total (>200KB threshold, each <50KB limit)
  const chunk = 'x'.repeat(45 * 1024);
  for (let i = 0; i < 5; i++) {
    writeFile(tmp, `file${i}.md`, chunk);
  }

  // Spy on console.error (stderr channel used by docs.js) without mocking the fs
  const errors = [];
  const originalError = console.error;
  console.error = (msg) => errors.push(msg);
  try {
    const result = await loadDocsFromDir(tmp);
    assert.equal(result.fileCount, 5, 'no file should be skipped');
    assert.ok(result.totalBytes > 200 * 1024, 'total should exceed 200KB');
    const warned = errors.some((m) => /exceeds 200KB/.test(String(m)));
    assert.ok(warned, 'should have emitted a 200KB warning on stderr');
  } finally {
    console.error = originalError;
  }
}));
