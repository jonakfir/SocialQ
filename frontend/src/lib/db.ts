import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// Ensure DATABASE_URL is set before creating Prisma client
// For PostgreSQL, DATABASE_URL should be set in environment variables
if (!process.env.DATABASE_URL) {
  if (typeof window === 'undefined') {
    // Only log in server context
    console.error('[db] DATABASE_URL not set! Please add DATABASE_URL to Vercel environment variables.');
    console.error('[db] Go to Vercel Dashboard → Settings → Environment Variables');
    console.error('[db] Add: DATABASE_URL = your PostgreSQL connection string');
    // Set a dummy value ONLY for Prisma generate during build
    // This allows the build to complete, but runtime will fail if DATABASE_URL is not set
    process.env.DATABASE_URL = 'postgresql://dummy:dummy@dummy:5432/dummy';
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

