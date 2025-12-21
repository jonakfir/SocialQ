import { dev } from '$app/environment';

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: any = null;
let PrismaClient: any = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

async function getPrismaAsync(): Promise<any> {
  if (typeof window !== 'undefined') {
    throw new Error('Prisma can only be used server-side');
  }
  
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  if (!_prisma) {
    // Lazy import PrismaClient - only when actually needed
    try {
      // Dynamic import to avoid blocking if Prisma Client isn't generated
      const prismaModule = await import('@prisma/client');
      PrismaClient = prismaModule.PrismaClient;
      
      // Set dummy DATABASE_URL if not set to prevent Prisma from blocking
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
      }
      
      _prisma = new PrismaClient({
        log: dev ? ['error'] : ['error'], // Reduced logging for faster startup
      });
      
      // Don't connect eagerly - let it connect on first query
      // This prevents blocking during startup
      
      if (dev) {
        globalForPrisma.prisma = _prisma;
      }
    } catch (error: any) {
      // If Prisma client doesn't exist or creation failed, log and return dummy
      if (error?.message?.includes('Prisma Client') || error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_MODULE_NOT_FOUND') {
        console.warn('[db.ts] Prisma Client not generated yet. Run: npm run prisma:generate');
      } else {
        console.warn('[db.ts] Prisma client creation failed:', error?.message || error);
      }
      // Return a dummy that will throw on use (but won't block startup)
      _prisma = {
        $connect: async () => { throw new Error('Prisma Client not generated. Run: npm run prisma:generate'); },
        $disconnect: async () => {},
        $on: () => {},
        $use: () => {},
        $transaction: async () => { throw new Error('Prisma Client not generated'); },
        $extends: () => { throw new Error('Prisma Client not generated'); },
        user: {} as any,
        collage: {} as any,
        organization: {} as any,
        organizationMembership: {} as any,
        friendRequest: {} as any,
        friendship: {} as any,
        gameSession: {} as any,
      } as any;
    }
  }
  
  return _prisma;
}

function getPrisma(): any {
  // Synchronous version - will create dummy if Prisma not loaded yet
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  if (!_prisma) {
    // Try to load synchronously first (if already imported)
    try {
      const prismaModule = require('@prisma/client');
      PrismaClient = prismaModule.PrismaClient;
      
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
      }
      
      _prisma = new PrismaClient({
        log: dev ? ['error'] : ['error'],
      });
      
      if (dev) {
        globalForPrisma.prisma = _prisma;
      }
    } catch {
      // If not available, return dummy that will be replaced on first async call
      _prisma = {
        $connect: async () => {
          const real = await getPrismaAsync();
          return real.$connect();
        },
        $disconnect: async () => {},
        $on: () => {},
        $use: () => {},
        $transaction: async () => { throw new Error('Prisma Client not generated'); },
        $extends: () => { throw new Error('Prisma Client not generated'); },
        user: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.user as any)[args[0]](...args.slice(1));
          }
        }),
        collage: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.collage as any)[args[0]](...args.slice(1));
          }
        }),
        organization: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.organization as any)[args[0]](...args.slice(1));
          }
        }),
        organizationMembership: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.organizationMembership as any)[args[0]](...args.slice(1));
          }
        }),
        friendRequest: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.friendRequest as any)[args[0]](...args.slice(1));
          }
        }),
        friendship: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.friendship as any)[args[0]](...args.slice(1));
          }
        }),
        gameSession: new Proxy({}, {
          get: () => async (...args: any[]) => {
            const real = await getPrismaAsync();
            return (real.gameSession as any)[args[0]](...args.slice(1));
          }
        }),
      } as any;
    }
  }
  
  return _prisma;
}

// Export as a getter function that creates client lazily
export const prisma = new Proxy({} as any, {
  get(_target, prop) {
    return getPrisma()[prop];
  }
});

