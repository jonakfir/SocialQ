#!/bin/bash
cd "$(dirname "$0")/frontend"

# Skip Prisma generate for faster startup (will generate on first use if needed)
export SKIP_PRISMA_GENERATE=true

# Run dev server
npm run dev

