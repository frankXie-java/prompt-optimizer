// Config module: reads/writes ~/.config/prompt-optimizer/config.json
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Returns the absolute path to the config file.
 * @returns {string} path to config.json in user config dir
 */
function configPath() {
  return path.join(os.homedir(), '.config', 'prompt-optimizer', 'config.json');
}

/**
 * Loads the config file.
 * @returns {Promise<object|null>} parsed config object, or null if file missing
 */
export async function loadConfig() {
  const p = configPath();
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to parse config at ${p}: ${err.message}`);
  }
}

/**
 * Writes config to disk, creating parent dirs. File mode 0600.
 * @param {object} cfg - config object with base_url, api_key, model
 * @returns {Promise<void>}
 */
export async function saveConfig(cfg) {
  const p = configPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  // Explicitly chmod to 0600: writeFile mode only applies on file creation,
  // not overwrite. Ensures tight perms even if file pre-existed with looser mode.
  await fs.chmod(p, 0o600);
}

/**
 * Loads config and validates required fields.
 * @returns {Promise<{base_url:string, api_key:string, model:string}>}
 * @throws {Error} if config missing or any required field absent
 */
export async function getConfigOrThrow() {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(
      'Config not found. Run `optimize-prompt init` (if installed) or `npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt init`.',
    );
  }
  const required = ['base_url', 'api_key', 'model'];
  for (const key of required) {
    if (!cfg[key]) {
      throw new Error(
        `Config missing required field: ${key}. Run \`optimize-prompt init\` (if installed) or \`npx -p @frankxie-java/optimize-prompt-mcp optimize-prompt init\`.`,
      );
    }
  }
  return cfg;
}