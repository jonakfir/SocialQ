import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// Ensure DATABASE_URL is set before creating Prisma client
// For PostgreSQL, DATABASE_URL should be set in environment variables
if (!process.env.DATABASE_URL) {
  if (typeof window === 'undefined') {
    // Only log in server context
    console.warn('[db] DATABASE_URL not set. Please set DATABASE_URL environment variable.');
  }
}

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: dev ? ['query', 'error', 'warn'] : ['error'],
  });

if (dev) globalForPrisma.prisma = prisma;

