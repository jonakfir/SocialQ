import { dev } from '$app/environment';

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: any = null;
let _prismaLoadPromise: Promise<any> | null = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

// Create a dummy Prisma client that will throw helpful errors
function createDummyPrisma(): any {
  const errorMsg = 'Prisma Client not generated. Run: npm run prisma:generate';
  return {
    $connect: async () => { throw new Error(errorMsg); },
    $disconnect: async () => {},
    $on: () => {},
    $use: () => {},
    $transaction: async () => { throw new Error(errorMsg); },
    $extends: () => { throw new Error(errorMsg); },
    user: createDummyModel('user'),
    collage: createDummyModel('collage'),
    organization: createDummyModel('organization'),
    organizationMembership: createDummyModel('organizationMembership'),
    friendRequest: createDummyModel('friendRequest'),
    friendship: createDummyModel('friendship'),
    gameSession: createDummyModel('gameSession'),
  } as any;
}

function createDummyModel(name: string): any {
  const errorMsg = `Prisma Client not generated. Run: npm run prisma:generate`;
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
      // Dynamic import for ESM compatibility - only loads when needed
      const prismaModule = await import('@prisma/client');
      const { PrismaClient } = prismaModule;
      
      // Check if DATABASE_URL is set - SvelteKit should load it from .env automatically
      // But if it's not set or is dummy, try to load from dotenv
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
        // Try to load from dotenv if available (for server-side)
        try {
          const dotenv = await import('dotenv');
          const result = dotenv.config();
          if (result.parsed?.DATABASE_URL) {
            process.env.DATABASE_URL = result.parsed.DATABASE_URL;
          }
        } catch {
          // dotenv not available, that's ok
        }
        
        // If still not set or is dummy, log warning
        if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('dummy')) {
          console.error('[db.ts] ❌ DATABASE_URL not set or is dummy value!');
          console.error('[db.ts] Make sure DATABASE_URL is in .env file');
          console.error('[db.ts] Current DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');
          // Don't set dummy - let it fail so we know there's a problem
          throw new Error('DATABASE_URL not configured. Please set it in .env file.');
        }
      }
      
      console.log('[db.ts] ✅ Using DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
      
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
      // If Prisma client doesn't exist or creation failed, return dummy
      if (error?.message?.includes('Prisma Client') || error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('[db.ts] Prisma Client not generated yet. Run: npm run prisma:generate');
        console.warn('[db.ts] Error details:', error.message);
      } else {
        console.warn('[db.ts] Prisma client creation failed:', error?.message || error);
      }
      return createDummyPrisma();
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
