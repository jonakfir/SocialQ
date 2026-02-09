import { dev } from '$app/environment';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// When Vite runs, __dirname can be inside .svelte-kit — try several .env locations
function getEnvPaths(): string[] {
  const cwd = process.cwd();
  const fromDb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  return [
    path.join(cwd, '.env'),                           // npm run dev from web/frontend
    path.join(cwd, 'web', 'frontend', '.env'),        // npm run dev from repo root
    fromDb,                                           // from src/lib (can be wrong when bundled)
    path.resolve(cwd, '..', '.env'),
  ];
}

/** Read DATABASE_URL directly from a .env file (no dotenv/SvelteKit). */
function readDatabaseUrlFromEnvFile(): string | null {
  for (const envPath of getEnvPaths()) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const raw = fs.readFileSync(envPath, 'utf8');
      const line = raw.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l));
      if (!line) continue;
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+)$/);
      if (!match) continue;
      const value = match[1].trim().replace(/^["']|["']$/g, '').trim();
      if (value && !value.includes('dummy')) return value;
    } catch {
      // skip this path
    }
  }
  return null;
}

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: any = null;
let _prismaLoadPromise: Promise<any> | null = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

// Create a dummy Prisma client that will throw helpful errors
function createDummyPrisma(reason: 'no-generate' | 'no-database-url' = 'no-generate'): any {
  const errorMsg = reason === 'no-database-url'
    ? 'DATABASE_URL not set. Add DATABASE_URL=postgresql://user:password@host:5432/dbname to web/frontend/.env (see env.example.txt)'
    : 'Prisma Client not generated. Run: npm run prisma:generate';
  return {
    $connect: async () => { throw new Error(errorMsg); },
    $disconnect: async () => {},
    $on: () => {},
    $use: () => {},
    $transaction: async () => { throw new Error(errorMsg); },
    $extends: () => { throw new Error(errorMsg); },
    user: createDummyModel('user', reason),
    collage: createDummyModel('collage', reason),
    organization: createDummyModel('organization', reason),
    organizationMembership: createDummyModel('organizationMembership', reason),
    friendRequest: createDummyModel('friendRequest', reason),
    friendship: createDummyModel('friendship', reason),
    gameSession: createDummyModel('gameSession', reason),
  } as any;
}

function createDummyModel(name: string, reason: 'no-generate' | 'no-database-url' = 'no-generate'): any {
  const errorMsg = reason === 'no-database-url'
    ? 'DATABASE_URL not set. Add DATABASE_URL=postgresql://user:password@host:5432/dbname to web/frontend/.env'
    : 'Prisma Client not generated. Run: npm run prisma:generate';
  return {
    findUnique: async () => { throw new Error(errorMsg); },
    findFirst: async () => { throw new Error(errorMsg); },
    findMany: async () => { throw new Error(errorMsg); },
    create: async () => { throw new Error(errorMsg); },
    update: async () => { throw new Error(errorMsg); },
    delete: async () => { throw new Error(errorMsg); },
    upsert: async () => { throw new Error(errorMsg); },
    deleteMany: async () => { throw new Error(errorMsg); },
    updateMany: async () => { throw new Error(errorMsg); },
    count: async () => { throw new Error(errorMsg); },
  };
}

// Load Prisma Client lazily (only when first accessed)
async function loadPrismaClient(): Promise<any> {
  if (_prismaLoadPromise) {
    return _prismaLoadPromise;
  }
  
  _prismaLoadPromise = (async () => {
    try {
      // 1) SvelteKit static private env (baked in when .env is present at dev/build)
      try {
        const priv = await import('$env/static/private');
        const url = (priv as Record<string, string | undefined>).DATABASE_URL?.trim();
        if (url) process.env.DATABASE_URL = url;
      } catch {
        // not available
      }
      // 2) SvelteKit dynamic private env
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
        try {
          const { env } = await import('$env/dynamic/private');
          if (env.DATABASE_URL?.trim()) process.env.DATABASE_URL = env.DATABASE_URL.trim();
        } catch {
          // not in SvelteKit context
        }
      }
      // 3) dotenv from multiple candidate paths (cwd differs depending on how dev is started)
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
        try {
          const dotenv = await import('dotenv');
          for (const envPath of getEnvPaths()) {
            const result = dotenv.config({ path: envPath });
            if (result.parsed?.DATABASE_URL?.trim()) {
              process.env.DATABASE_URL = result.parsed.DATABASE_URL.trim();
              break;
            }
          }
        } catch {
          // dotenv not available
        }
      }
      // 4) Last resort: read .env file ourselves (bypasses dotenv + SvelteKit entirely)
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
        const url = readDatabaseUrlFromEnvFile();
        if (url) process.env.DATABASE_URL = url;
      }
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
        // Debug: where is the server actually running and what paths did we try?
        const cwd = process.cwd();
        const paths = getEnvPaths();
        console.error('[db.ts] ❌ DATABASE_URL not set or is dummy value!');
        console.error('[db.ts] process.cwd() =', cwd);
        console.error('[db.ts] .env paths tried:');
        for (const p of paths) {
          const exists = fs.existsSync(p);
          let hasVar = false;
          if (exists) {
            try {
              const raw = fs.readFileSync(p, 'utf8');
              hasVar = raw.split(/\r?\n/).some((l) => /^\s*DATABASE_URL\s*=/.test(l));
            } catch {
              // ignore
            }
          }
          console.error('[db.ts]   ', exists ? '✓' : '✗', p, hasVar ? '(has DATABASE_URL)' : '');
        }
        console.error('[db.ts] Current DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : '(not set)');
        throw new Error('DATABASE_URL not configured. Please set it in .env file.');
      }
      
      console.log('[db.ts] ✅ Using DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
      
      // Dynamic import so Prisma is only loaded when used (and after generate has run)
      const { PrismaClient } = await import('@prisma/client');
      const client = new PrismaClient({
        log: dev ? ['error'] : ['error'], // Reduced logging for faster startup
      });
      
      // Don't connect eagerly - let it connect on first query
      // This prevents blocking during startup
      
      if (dev) {
        globalForPrisma.prisma = client;
      }
      
      return client;
    } catch (error: any) {
      const isDatabaseUrl = error?.message?.includes('DATABASE_URL');
      if (error?.message?.includes('Prisma Client') || error?.message?.includes('PrismaClient is not defined') || error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('[db.ts] Prisma Client not generated yet. Run: npm run prisma:generate');
        console.warn('[db.ts] Error details:', error.message);
        return createDummyPrisma('no-generate');
      }
      if (isDatabaseUrl) {
        console.warn('[db.ts] DATABASE_URL not set. Add it to web/frontend/.env — see env.example.txt');
        return createDummyPrisma('no-database-url');
      }
      console.warn('[db.ts] Prisma client creation failed:', error?.message || error);
      return createDummyPrisma('no-generate');
    }
  })();
  
  return _prismaLoadPromise;
}

function getPrisma(): any {
  if (typeof window !== 'undefined') {
    throw new Error('Prisma can only be used server-side');
  }
  
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  // Return dummy immediately - real client will load on first use
  if (!_prisma) {
    _prisma = createDummyPrisma();
    
    // Start loading real Prisma in background (non-blocking)
    loadPrismaClient().then(client => {
      if (client && client !== createDummyPrisma()) {
        _prisma = client;
        if (dev) {
          globalForPrisma.prisma = client;
        }
      }
    }).catch(() => {
      // Keep dummy if load fails
    });
  }
  
  return _prisma;
}

// Export Prisma client with proper lazy loading
// The proxy ensures Prisma is loaded before accessing any property
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    // For model access (like prisma.user), return a proxy that waits for client
    return new Proxy({}, {
      get(_modelTarget, modelProp) {
        // Return async function that waits for Prisma to load
        return async (...args: any[]) => {
          const client = await loadPrismaClient();
          const model = client[prop];
          if (model && typeof model[modelProp] === 'function') {
            return model[modelProp].apply(model, args);
          }
          throw new Error(`Prisma model ${String(prop)}.${String(modelProp)} not found or not a function`);
        };
      }
    });
  }
});
