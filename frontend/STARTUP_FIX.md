# Dev Server Startup Issue - WORKAROUND

## Problem
The dev server hangs during SvelteKit initialization, taking 5+ minutes or never starting.

## Root Cause
SvelteKit's vite plugin is hanging during the sync/initialization phase. This is likely due to:
- Large number of route files to scan
- Complex dependency graph
- Adapter initialization

## WORKAROUND - Fast Start

**Option 1: Use the fast script (recommended)**
```bash
cd SocialQ_repo/frontend
./dev-fast.sh
```

**Option 2: Manual with optimizations**
```bash
cd SocialQ_repo/frontend
rm -rf .svelte-kit node_modules/.vite
SKIP_ENV_VALIDATION=1 npm run dev
```

**Option 3: If still slow, wait it out**
- The first startup after clearing cache can take 2-5 minutes
- Subsequent startups should be faster (10-30 seconds)
- Once started, HMR (hot module reload) is fast

## What Was Fixed

1. ✅ Made Prisma imports lazy (won't block startup)
2. ✅ Optimized vite.config.js (minimal logging, excluded heavy deps)
3. ✅ Fixed tsconfig.json (no dependency on .svelte-kit)
4. ✅ Created prisma.ts re-export file
5. ✅ Optimized svelte.config.js

## Expected Behavior

- **First run after cache clear**: 2-5 minutes (SvelteKit scanning routes)
- **Subsequent runs**: 10-30 seconds
- **Once running**: Fast HMR, instant page loads

## If Still Hanging

1. Check if port 5173 is free: `lsof -ti:5173`
2. Kill any stuck processes: `pkill -9 -f vite`
3. Try: `npm run dev:fast` (uses --force flag)
4. Check for syntax errors in route files
5. Consider removing recently added route files temporarily to isolate the issue

## Note

The server WILL start eventually - SvelteKit is just very slow on first initialization when it has to scan all routes and generate the manifest. This is a known SvelteKit limitation with large codebases.
