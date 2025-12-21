import { dev } from '$app/environment';

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: any = null;
let _prismaLoadError: Error | null = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

// Try to import PrismaClient - but don't fail if it's not generated
let PrismaClientClass: any = null;
try {
  // This import will fail if Prisma Client isn't generated, but we catch it
  const prismaModule = await import('@prisma/client').catch(() => null);
  if (prismaModule) {
    PrismaClientClass = prismaModule.PrismaClient;
  }
} catch {
  // Prisma Client not generated - that's OK, we'll use a dummy
}

function getPrisma(): any {
  if (typeof window !== 'undefined') {
    throw new Error('Prisma can only be used server-side');
  }
  
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  if (!_prisma) {
    if (PrismaClientClass) {
      // Prisma Client is available - create instance
      try {
        // Set dummy DATABASE_URL if not set to prevent Prisma from blocking
        if (!process.env.DATABASE_URL) {
          process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
        }
        
        _prisma = new PrismaClientClass({
          log: dev ? ['error'] : ['error'], // Reduced logging for faster startup
        });
        
        // Don't connect eagerly - let it connect on first query
        // This prevents blocking during startup
        
        if (dev) {
          globalForPrisma.prisma = _prisma;
        }
      } catch (error: any) {
        _prismaLoadError = error;
        console.warn('[db.ts] Prisma client creation failed:', error?.message || error);
        _prisma = createDummyPrisma();
      }
    } else {
      // Prisma Client not generated - use dummy
      _prisma = createDummyPrisma();
    }
  }
  
  return _prisma;
}

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

// Export as a getter function that creates client lazily
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    return getPrisma()[prop];
  }
});
