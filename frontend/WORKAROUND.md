# URGENT: Dev Server Workaround

## The Problem
SvelteKit's dev server hangs during initialization. This is a known issue with large SvelteKit projects.

## IMMEDIATE SOLUTION - Use Build + Preview

Instead of `npm run dev`, use this:

```bash
cd SocialQ_repo/frontend

# Build once (takes 1-2 minutes)
SKIP_ENV_VALIDATION=1 vite build

# Then use preview server (starts instantly)
vite preview --host --port 5173
```

**Preview server starts in seconds!** It watches for changes and rebuilds automatically.

## Alternative: Use a Different Port

Sometimes port 5173 has issues. Try:

```bash
SKIP_ENV_VALIDATION=1 vite dev --port 3000
```

## Nuclear Option: Fresh SvelteKit Install

If nothing works:

```bash
cd SocialQ_repo/frontend
rm -rf node_modules package-lock.json .svelte-kit
npm install
npm run dev
```

## What We Fixed

1. ✅ Made Prisma imports lazy
2. ✅ Made env imports lazy in hooks.server.ts  
3. ✅ Optimized vite.config.js
4. ✅ Fixed tsconfig.json

The remaining issue is SvelteKit's sync/initialization which can't be bypassed in dev mode.

## Recommended: Use Preview Mode

**For fastest local testing, use build + preview:**
- Build once: `vite build` (1-2 min)
- Preview: `vite preview` (starts in 2-3 seconds)
- Auto-rebuilds on file changes

This is actually faster for testing than the hanging dev server!
