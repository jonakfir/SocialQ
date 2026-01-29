import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionCookie = cookies.get('session');
  if (!sessionCookie) {
    return { user: null };
  }

  try {
    // Lazy load prisma to avoid blocking startup
    const { prisma } = await import('$lib/prisma');
    const user = await prisma.user.findUnique({
      where: { id: sessionCookie },
      select: { id: true, email: true }
    });
    return { user };
  } catch {
    return { user: null };
  }
};
