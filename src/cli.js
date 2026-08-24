#!/usr/bin/env node
// CLI entrypoint: parses args, orchestrates config/llm/optimize modules.
import { program } from 'commander';
import chalk from 'chalk';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig, saveConfig, getConfigOrThrow } from './config.js';
import { buildMessages, extractOptimizedPrompt } from './optimize.js';
import { chat } from './llm.js';

/**
 * Reads all of stdin as a string.
 * @returns {Promise<string>}
 */
async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reads all stdin lines as an array (for non-TTY piped input).
 * @returns {Promise<string[]>} array of non-empty input lines
 */
async function readStdinLines() {
  const text = await readStdin();
  return text.split('\n').filter((l) => l.length > 0);
}

/**
 * Interactive init: prompts for base_url, api_key, model; overwrites if exists.
 * Supports both interactive TTY and piped stdin input.
 */
async function runInit() {
  try {
    const isTTY = stdin.isTTY;
    let pipedLines = [];
    if (!isTTY) {
      pipedLines = await readStdinLines();
    }
    let lineIdx = 0;

    // Helper: gets next answer from piped lines (non-TTY) or readline question (TTY)
    const nextAnswer = async (prompt, rl) => {
      if (isTTY) {
        return (await rl.question(prompt)).trim();
      }
      // Non-TTY: print prompt and echo the piped answer for log clarity
      process.stdout.write(prompt);
      const line = pipedLines[lineIdx++] || '';
      process.stdout.write(line + '\n');
      return line.trim();
    };

    // For TTY: create one readline interface reused for all questions.
    // For non-TTY: stdin already consumed by readStdinLines, so no rl needed.
    const rl = isTTY ? readline.createInterface({ input: stdin, output: stdout }) : null;

    try {
      const existing = await loadConfig();
      if (existing) {
        const ans = await nextAnswer('Config already exists. Overwrite? (y/n) ', rl);
        if (ans.toLowerCase() !== 'y') {
          console.log('Aborted.');
          return;
        }
      }
      const base_url = await nextAnswer('base_url (e.g. https://host/v1): ', rl);
      const api_key = await nextAnswer('api_key (sk-...): ', rl);
      const model = await nextAnswer('model name: ', rl);
      if (!base_url || !api_key || !model) {
        console.error(chalk.red('All fields are required.'));
        process.exit(1);
      }
      await saveConfig({ base_url, api_key, model });
      console.log(chalk.green('Config saved.'));
    } finally {
      if (rl) rl.close();
    }
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

/**
 * Main optimize flow: read stdin prompt, optional codebase, call LLM, write output.
 * @param {object} opts - { codebase?: string, output?: string }
 */
async function runOptimize(opts) {
  try {
    const prompt = (await readStdin()).trim();
    if (!prompt) {
      console.error(chalk.red('No prompt provided on stdin.'));
      process.exit(1);
    }
    const cfg = await getConfigOrThrow();

    // Validate output path parent dir exists before calling LLM (avoid wasting tokens)
    if (opts.output) {
      const outDir = path.dirname(opts.output);
      try {
        const stat = await fs.stat(outDir);
        if (!stat.isDirectory()) {
          console.error(chalk.red(`Output directory is not a directory: ${outDir}`));
          process.exit(1);
        }
      } catch (err) {
        console.error(chalk.red(`Output directory does not exist: ${outDir}`));
        process.exit(1);
      }
    }

    let codebaseContent = null;
    if (opts.codebase) {
      try {
        const stat = await fs.stat(opts.codebase);
        if (!stat.isFile()) {
          console.error(chalk.red(`--codebase path is not a file: ${opts.codebase}`));
          process.exit(1);
        }
        if (stat.size > 100 * 1024) {
          console.warn(chalk.yellow(`Warning: codebase file is large (${Math.round(stat.size / 1024)}KB), may increase token cost.`));
        }
        codebaseContent = await fs.readFile(opts.codebase, 'utf8');
      } catch (err) {
        console.error(chalk.red(`--codebase file not found: ${opts.codebase}`));
        process.exit(1);
      }
    }

    const messages = buildMessages(prompt, codebaseContent);
    let raw;
    try {
      raw = await chat({ baseURL: cfg.base_url, apiKey: cfg.api_key, model: cfg.model, messages });
    } catch (err) {
      console.error(chalk.red(`Optimization failed: ${err.message}`));
      process.exit(1);
    }
    const optimized = extractOptimizedPrompt(raw);

    if (opts.output) {
      try {
        await fs.writeFile(opts.output, optimized + '\n');
        console.log(chalk.green(`Optimized prompt written to ${opts.output}`));
      } catch (err) {
        console.error(chalk.red(`Failed to write output: ${err.message}`));
        process.exit(1);
      }
    } else {
      process.stdout.write(optimized + '\n');
    }
  } catch (err) {
    // Catch-all: config-missing/parse-failure and any other unhandled errors.
    // Emits clean red one-line message per spec §6 error matrix (no stack trace).
    console.error(chalk.red(err.message));
    process.exit(1);
  }
}

program
  .name('optimize-prompt')
  .description('Optimize prompts via an OpenAI-compatible LLM endpoint.')
  .option('--codebase <path>', 'path to codebase index document')
  .option('-o, --output <path>', 'output file path (default: stdout)')
  .action(runOptimize);

program
  .command('init')
  .description('Initialize config interactively')
  .action(runInit);

program.parse();