import { prisma } from './db';

/** Parse string user id (from API/getCurrentUser) to number for Prisma. */
export function toPrismaUserId(id: string): number {
  const n = parseInt(id, 10);
  if (Number.isNaN(n)) throw new Error('Invalid user id');
  return n;
}

/**
 * Generate a unique numeric user ID (high range to avoid colliding with backend ids 1,2,...).
 * Returns number to match Prisma User.id (Int).
 */
export async function generateUserId(): Promise<number> {
  let attempts = 0;
  const maxAttempts = 100;
  while (attempts < maxAttempts) {
    const id = Math.floor(100000000 + Math.random() * 900000000);
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) return id;
    attempts++;
  }
  throw new Error('Failed to generate unique user ID after ' + maxAttempts + ' attempts');
}

