import { dev } from '$app/environment';

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: any = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: any | undefined;
};

function getPrisma(): any {
  if (typeof window !== 'undefined') {
    throw new Error('Prisma can only be used server-side');
  }
  
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  if (!_prisma) {
    // Lazy import PrismaClient - only when actually needed
    // This prevents blocking startup if Prisma Client isn't generated
    try {
      // Use dynamic import to avoid blocking
      const prismaModule = require('@prisma/client');
      const { PrismaClient } = prismaModule;
      
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
      // If Prisma client doesn't exist or creation failed, create a dummy
      if (error?.message?.includes('Prisma Client') || error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_REQUIRE_ESM') {
        console.warn('[db.ts] Prisma Client not generated yet. Run: npm run prisma:generate');
      } else {
        console.warn('[db.ts] Prisma client creation failed:', error?.message || error);
      }
      
      // Create a dummy that throws helpful errors
      _prisma = {
        $connect: async () => { 
          throw new Error('Prisma Client not generated. Run: npm run prisma:generate'); 
        },
        $disconnect: async () => {},
        $on: () => {},
        $use: () => {},
        $transaction: async () => { 
          throw new Error('Prisma Client not generated. Run: npm run prisma:generate'); 
        },
        $extends: () => { 
          throw new Error('Prisma Client not generated. Run: npm run prisma:generate'); 
        },
        user: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        collage: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        organization: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        organizationMembership: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        friendRequest: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        friendship: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
        gameSession: {
          findUnique: async () => { throw new Error('Prisma Client not generated'); },
          findFirst: async () => { throw new Error('Prisma Client not generated'); },
          findMany: async () => { throw new Error('Prisma Client not generated'); },
          create: async () => { throw new Error('Prisma Client not generated'); },
          update: async () => { throw new Error('Prisma Client not generated'); },
          delete: async () => { throw new Error('Prisma Client not generated'); },
        },
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
