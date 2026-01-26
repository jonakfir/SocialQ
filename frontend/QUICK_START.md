# Quick Start - Fast Dev Server

## If dev server is slow, try this:

1. **Stop the current server** (Ctrl+C)

2. **Clear all caches:**
   ```bash
   cd SocialQ_repo/frontend
   rm -rf .svelte-kit node_modules/.vite .vite
   ```

3. **Start dev server:**
   ```bash
   npm run dev
   ```

## Expected startup time: **Under 3 seconds**

You should see:
```
VITE v5.4.19  ready in XXXms
➜  Local:   http://localhost:5173/
```

## If still slow:

The server might be waiting for Prisma. You can:
- Run `npm run prisma:generate` first (takes ~10 seconds, but only needed once)
- Or just wait - Prisma will load lazily when needed

## Troubleshooting:

**Port already in use:**
```bash
lsof -ti:5173 | xargs kill -9
```

**Still hanging:**
- Check terminal for error messages
- Try: `NODE_ENV=development vite dev --force`
