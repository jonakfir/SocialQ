// Simple dev server that actually works - no SvelteKit dev mode
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting simple dev server...');

// Use vite's dev server directly without SvelteKit plugin issues
const vite = spawn('npx', ['vite', '--host', '--port', '5173', '--force'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    SKIP_ENV_VALIDATION: '1'
  }
});

vite.on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});

vite.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  vite.kill();
  process.exit(0);
});
