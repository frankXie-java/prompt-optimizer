// Docs module: recursively scans a directory for .md files and aggregates them.
import fs from 'node:fs/promises';
import path from 'node:path';

// Skip directories with these names
const SKIP_DIRS = new Set(['node_modules']);

// Single file size limit: 50KB
const MAX_FILE_SIZE = 50 * 1024;

// Total size warning threshold: 200KB
const WARN_TOTAL_SIZE = 200 * 1024;

// Valid markdown extensions
const MD_EXTENSIONS = new Set(['.md', '.markdown']);

/**
 * Recursively walks a directory and collects .md/.markdown file paths.
 * Skips node_modules, hidden files, and hidden directories.
 * @param {string} dir - current directory being walked
 * @param {string} baseDir - root directory for computing relative paths
 * @returns {Promise<Array<{fullPath: string, relativePath: string}>>}
 */
async function walkDir(dir, baseDir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      files.push(...await walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      if (entry.name.startsWith('.')) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MD_EXTENSIONS.has(ext)) continue;
      files.push({ fullPath, relativePath: path.relative(baseDir, fullPath) });
    }
  }
  return files;
}

/**
 * Scans a directory recursively for .md files and aggregates them into a single string.
 *
 * Rules:
 * - Collects only .md and .markdown files
 * - Skips node_modules directories and hidden files/dirs (leading dot)
 * - Skips individual files larger than 50KB (recorded in skipped[])
 * - Sorts files by relative path alphabetically (for reproducibility)
 * - Prepends each file's content with a header: "\n## <relative-path>\n\n"
 * - Warns on stderr if total aggregated size exceeds 200KB (does not truncate)
 *
 * @param {string} dirPath - absolute path to docs directory
 * @returns {Promise<{content: string, fileCount: number, skipped: string[], totalBytes: number}>}
 * @throws {Error} if dirPath does not exist or is not a directory
 */
export async function loadDocsFromDir(dirPath) {
  // Validate path exists and is a directory
  let stat;
  try {
    stat = await fs.stat(dirPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Directory not found: ${dirPath}`);
    }
    throw err;
  }
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  // Collect and sort files
  const files = await walkDir(dirPath, dirPath);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Read files, skip oversized ones
  const skipped = [];
  let content = '';
  let totalBytes = 0;
  let fileCount = 0;

  for (const file of files) {
    const fileStat = await fs.stat(file.fullPath);
    if (fileStat.size > MAX_FILE_SIZE) {
      skipped.push(file.relativePath);
      continue;
    }
    const fileContent = await fs.readFile(file.fullPath, 'utf8');
    content += `\n## ${file.relativePath}\n\n${fileContent}`;
    totalBytes += fileStat.size;
    fileCount++;
  }

  // Warn on stderr if total exceeds threshold (stderr is safe for both CLI and MCP)
  if (totalBytes > WARN_TOTAL_SIZE) {
    console.error(
      `Warning: total docs size (${Math.round(totalBytes / 1024)}KB) exceeds 200KB, may increase token cost.`,
    );
  }

  return { content, fileCount, skipped, totalBytes };
}
