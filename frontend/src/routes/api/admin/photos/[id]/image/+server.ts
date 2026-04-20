/**
 * GET /api/admin/photos/[id]/image
 *
 * Lazy per-photo image endpoint. The admin photos list endpoint (`+server.ts`
 * one level up) no longer ships the (often multi-MB base64) `imageUrl` inline
 * — it stamps `imageUrl: /api/admin/photos/{id}/image` on each row instead, so
 * the browser lazy-loads each tile's image only when it scrolls into view.
 *
 * Two cases:
 *   1. Collage row's `imageUrl` is an http(s) URL (post-S3-migration) →
 *      302 redirect to the CDN URL.
 *   2. Collage row's `imageUrl` is a `data:image/...;base64,...` inline string
 *      (pre-migration legacy rows) → decode and stream the bytes with a long
 *      private cache so the browser never re-fetches the same image.
 *
 * Auth: admin only, matching the list endpoint's policy.
 */

import { error, redirect, type RequestHandler } from '@sveltejs/kit';
import { prisma } from '$lib/db';
import { ensurePrismaUser } from '$lib/utils/syncUser';
import { toPrismaUserId } from '$lib/userId';

async function getCurrentUser(event: { request: Request }): Promise<{ id: string; role: string } | null> {
  try {
    const mockUserId = event.request.headers.get('X-User-Id');
    const mockUserEmail = event.request.headers.get('X-User-Email');
    if (mockUserId && mockUserEmail) {
      const user = await prisma.user.findFirst({
        where: { username: mockUserEmail.trim().toLowerCase() },
        select: { id: true, role: true }
      });
      return user ? { id: String(user.id), role: user.role } : null;
    }

    const { PUBLIC_API_URL } = await import('$env/static/public');
    const base = (PUBLIC_API_URL || '').replace(/\/$/, '') || 'http://localhost:4000';
    const authHeader = event.request.headers.get('authorization') || event.request.headers.get('Authorization');
    const cookieHeader = event.request.headers.get('cookie') || '';
    const headers: HeadersInit = { Cookie: cookieHeader };
    if (authHeader) headers['Authorization'] = authHeader;

    const response = await fetch(`${base}/auth/me`, { method: 'GET', headers, credentials: 'include' });
    if (!response.ok) return null;
    const data = await response.json();
    const backendUser = data?.user;
    if (!backendUser?.email) return null;
    return await ensurePrismaUser(backendUser.email);
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async (event) => {
  const user = await getCurrentUser(event);
  if (!user) throw error(401, 'Unauthorized');

  const me = await prisma.user.findUnique({
    where: { id: toPrismaUserId(user.id) },
    select: { role: true, username: true },
  });
  const email = (me?.username || '').trim().toLowerCase();
  const isAdmin = email === 'jonakfir@gmail.com' || me?.role === 'admin';
  if (!isAdmin) throw error(403, 'Only admins can fetch photo bytes');

  const id = event.params.id;
  if (!id) throw error(400, 'id required');

  const row = await prisma.collage.findUnique({
    where: { id },
    select: { imageUrl: true },
  });
  if (!row?.imageUrl) throw error(404, 'not found');

  const src = row.imageUrl;

  // Case 1: real http(s) URL — delegate to the CDN.
  if (src.startsWith('http://') || src.startsWith('https://')) {
    throw redirect(302, src);
  }

  // Case 2: inline data URL. Parse `data:<mime>;base64,<data>`.
  const m = src.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw error(415, 'unsupported imageUrl format');
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      // Images are immutable per-row (no one ever rewrites an uploaded collage
      // in place). Long private cache keeps re-scrolls instant.
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Length': String(bytes.length),
    },
  });
};
