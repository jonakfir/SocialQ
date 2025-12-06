import { PrismaClient } from '@prisma/client';
import { dev } from '$app/environment';

// Ensure DATABASE_URL is set before creating Prisma client
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./prisma/dev.db';
  console.warn('[db] DATABASE_URL not set, using default: file:./prisma/dev.db');
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

