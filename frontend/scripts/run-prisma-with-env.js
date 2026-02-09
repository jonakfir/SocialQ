#!/usr/bin/env node
// Load .env then run Prisma CLI so DATABASE_URL is in the child process env (fixes P1012 with Prisma 6 WASM)

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const scriptDir = __dirname;
const frontendDir = resolve(scriptDir, '..');
const envPath = resolve(frontendDir, '.env');

// Load .env into process.env
try {
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    process.env[key] = val;
  }
} catch (e) {
  console.warn('[run-prisma-with-env] Could not read .env:', e.message);
}

const prismaBin = resolve(frontendDir, 'node_modules', '.bin', 'prisma');
const args = process.argv.slice(2); // e.g. ["db", "push"]

const result = spawnSync(process.execPath, [prismaBin, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: frontendDir
});

process.exit(result.status ?? 1);
