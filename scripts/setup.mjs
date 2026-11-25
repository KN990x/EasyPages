#!/usr/bin/env node
/**
 * `pnpm run setup`: takes a fresh clone to the point where `pnpm run dev` works. Safe to run
 * again at any time; it never overwrites a local file.
 *
 *   1. Node against `.nvmrc` and pnpm against `packageManager` (Corepack).
 *   2. `pnpm install --frozen-lockfile`.
 *   3. Copies every tracked `*.example` to its local name only if that file does not exist yet,
 *      then lists by name the keys of `.env` that are still empty or hold the template value.
 *      It never prints a value: `.env` holds the Cloudflare token.
 *
 * There is no database or service to prepare: the only local state is the operator account and
 * the session secret, which the app creates under `./data` on first start.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Major of a version string: `v26.1.0`, `26`, `pnpm@11.14.0` -> 26 / 11. */
export function majorVersion(text) {
  const match = /(\d+)(?:\.\d+)*/.exec(String(text ?? ''));
  return match ? Number(match[1]) : null;
}

/** Exact version of a `packageManager` field or a pnpm user agent, or null. */
export function pnpmVersion(text) {
  const match = /pnpm[@/](\d+\.\d+\.\d+)/.exec(String(text ?? ''));
  return match ? match[1] : null;
}

/** `.env.example` -> `.env`. */
export function localNameOf(exampleFile) {
  return exampleFile.replace(/\.example$/, '');
}

/** Values that only stand in for a real one. */
const PLACEHOLDER = /^x{3,}$|^your[-_]|^change[-_]?me$/i;

/** `[{ key, value }]` for the active (uncommented) lines of a dotenv file. */
function parseDotenv(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }
    const value = match[2]
      .replace(/\s+#.*$/, '')
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    rows.push({ key: match[1], value });
  }
  return rows;
}

/**
 * Keys of `.env` that still need a real value: empty, or equal to a placeholder from the
 * template (`xxxxx`). Returns names only, so nothing from here can leak a secret.
 *
 * @returns {Array<{ key: string, reason: 'empty' | 'placeholder' }>}
 */
export function keysToFill(envText, exampleText) {
  const template = new Map(parseDotenv(exampleText).map((row) => [row.key, row.value]));
  const pending = [];
  for (const { key, value } of parseDotenv(envText)) {
    if (value === '') {
      pending.push({ key, reason: 'empty' });
    } else if (template.get(key) === value && PLACEHOLDER.test(value)) {
      pending.push({ key, reason: 'placeholder' });
    }
  }
  return pending;
}

function main() {
  process.chdir(ROOT);
  const missing = [];
  const ok = (message) => console.log(`[setup] ok   ${message}`);
  const fail = (message) => {
    console.log(`[setup] FAIL ${message}`);
    missing.push(message);
  };
  const output = (bin, args) => {
    try {
      return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };

  // ---------------------------------------------------------------- 1. toolchain
  const nvmrc = readFileSync('.nvmrc', 'utf8').trim();
  if (majorVersion(process.version) !== majorVersion(nvmrc)) {
    console.error(
      `[setup] FAIL Node ${process.version}, but .nvmrc asks for ${nvmrc}. Install it and run again:\n` +
        '         mise install   (or: nvm install && nvm use)\n' +
        '         pnpm run setup'
    );
    process.exit(1);
  }
  ok(`Node ${process.version} (.nvmrc: ${nvmrc})`);

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const wanted = pnpmVersion(pkg.packageManager);
  const running = pnpmVersion(process.env.npm_config_user_agent) ?? output('pnpm', ['--version']);
  if (running !== wanted) {
    console.error(
      `[setup] FAIL pnpm ${running ?? '(not found)'}, but packageManager asks for ${wanted}. With Corepack:\n` +
        '         npm install -g corepack && corepack enable\n' +
        '         pnpm run setup'
    );
    process.exit(1);
  }
  ok(`pnpm ${running} (packageManager, through Corepack)`);

  // ---------------------------------------------------------------- 2. dependencies
  const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error('[setup] FAIL `pnpm install --frozen-lockfile` failed: see the error above.');
    process.exit(1);
  }
  ok('dependencies installed from the frozen lockfile');

  // ---------------------------------------------------------------- 3. local config files
  const examples = (output('git', ['ls-files', '*.example']) ?? '').split('\n').filter(Boolean);
  for (const example of examples) {
    const local = localNameOf(example);
    if (existsSync(local)) {
      ok(`${local} already exists (left as it is)`);
      continue;
    }
    copyFileSync(example, local, constants.COPYFILE_EXCL);
    ok(`${local} created from ${example}`);
  }

  let toFill = [];
  if (existsSync('.env') && existsSync('.env.example')) {
    toFill = keysToFill(readFileSync('.env', 'utf8'), readFileSync('.env.example', 'utf8'));
    if (toFill.length) {
      fail(`.env: fill in ${toFill.map((row) => row.key).join(', ')}`);
    } else {
      ok('.env has no empty or template values');
    }
  }

  // ---------------------------------------------------------------- summary
  console.log('');
  if (missing.length) {
    for (const message of missing) {
      console.log(`[setup] To do: ${message}`);
    }
    if (toFill.some((row) => row.key === 'CF_API_TOKEN')) {
      console.log(
        '[setup]        CF_API_TOKEN: a Cloudflare API token with Account > Cloudflare Pages > Edit (see README).'
      );
    }
    console.log('[setup] Then run `pnpm run setup` again (it is safe to repeat).');
    process.exit(1);
  }
  console.log('[setup] Ready. Next, in two terminals:');
  console.log('[setup]   pnpm run dev       # API on 8002');
  console.log('[setup]   pnpm run dev:ui    # UI on 5173; the first visit opens the setup wizard');
}

if (import.meta.main) {
  main();
}
