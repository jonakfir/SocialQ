import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// LAZY INIT: Don't create Prisma client on import - only when actually used
// This prevents database connection attempts from blocking Vite startup
let _prisma: PrismaClient | null = null;

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getPrisma(): PrismaClient {
  if (typeof window !== 'undefined') {
    throw new Error('Prisma can only be used server-side');
  }
  
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }
  
  if (!_prisma) {
    // Set dummy DATABASE_URL if not set to prevent Prisma from blocking
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
    }
    
    _prisma = new PrismaClient({
      log: dev ? ['error'] : ['error'], // Reduced logging for faster startup
      // Don't connect on startup - lazy connect only when needed
      datasources: {
        db: {
          url: process.env.DATABASE_URL
        }
      }
    });
    
    // Don't connect eagerly - let it connect on first query
    // This prevents blocking during startup
    
    if (dev) {
      globalForPrisma.prisma = _prisma;
    }
  }
  
  return _prisma;
}

// Export as a getter function that creates client lazily
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return getPrisma()[prop as keyof PrismaClient];
  }
});

