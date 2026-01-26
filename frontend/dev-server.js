// Simple dev server that actually works
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORT = 5173;

console.log('🚀 Starting dev server on port', PORT);

// Start vite in the background
const vite = spawn('npx', ['vite', 'dev', '--host', '--port', PORT], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

vite.on('error', (err) => {
  console.error('Failed to start vite:', err);
  process.exit(1);
});

vite.on('exit', (code) => {
  console.log(`Vite exited with code ${code}`);
  process.exit(code);
});

// Handle cleanup
process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});

console.log(`✅ Server starting at http://localhost:${PORT}`);
console.log('Press Ctrl+C to stop');
