import { prisma } from './db';

/**
 * Generate a unique 9-digit numeric user ID
 * Returns as string (since Prisma ID is String type)
 */
export async function generateUserId(): Promise<string> {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    // Generate random 9-digit number (100000000 to 999999999)
    const id = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    // Check if ID already exists
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });
    
    if (!existing) {
      return id;
    }
    
    attempts++;
  }
  
  throw new Error('Failed to generate unique 9-digit user ID after ' + maxAttempts + ' attempts');
}

