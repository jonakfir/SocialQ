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
      
      // Set dummy DATABASE_URL if not set to prevent Prisma from blocking
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
      }
      
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

// Export as a getter function that creates client lazily
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    const client = getPrisma();
    const value = client[prop];
    
    // If it's a function (like findMany, create, etc.), ensure Prisma is loaded
    if (typeof value === 'function') {
      return async (...args: any[]) => {
        // Wait for Prisma to load if it's still loading
        const loadedClient = await loadPrismaClient();
        const currentClient = (_prisma && _prisma !== createDummyPrisma()) ? _prisma : loadedClient;
        return currentClient[prop](...args);
      };
    }
    
    return value;
  }
});
