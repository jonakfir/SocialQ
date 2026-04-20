/**
 * GET /api/admin/ekman-images/[id]/image
 *
 * Lazy per-image endpoint for EkmanImage rows. The list endpoint stamps
 * `imageData: /api/admin/ekman-images/{id}/image` on each row; this endpoint
 * resolves that to actual bytes only for the tiles the browser is rendering.
 *
 *   - If the row has `imageUrl` (post-S3 migration), 302-redirect there.
 *   - Otherwise decode the legacy `data:image/...;base64,...` inline string
 *     from `imageData` and stream the bytes with a long private cache so
 *     the browser never re-fetches the same image in the session.
 *
 * This also sidesteps the Prisma "Failed to convert rust String into napi
 * string" crash that the old two-pass SELECT hit when fetching huge base64
 * columns in bulk — here we only ever touch one row's imageData at a time.
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
  if (!isAdmin) throw error(403, 'Only admins can fetch image bytes');

  const id = event.params.id;
  if (!id) throw error(400, 'id required');

  // Fetch imageUrl first — if present, we can redirect without ever touching
  // the huge imageData column. This is the common post-migration path.
  const row = await prisma.ekmanImage.findUnique({
    where: { id },
    select: { imageUrl: true },
  });
  if (!row) throw error(404, 'not found');

  if (row.imageUrl) {
    throw redirect(302, row.imageUrl);
  }

  // Legacy path — only hit for rows still storing base64 inline. We do a
  // SECOND targeted query just for imageData so the above findUnique stays
  // cheap for the common case.
  const legacy = await prisma.ekmanImage.findUnique({
    where: { id },
    select: { imageData: true },
  });
  if (!legacy?.imageData) throw error(404, 'image missing');

  const m = legacy.imageData.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) {
    // Some very old rows may not be formatted as data URLs — fall back to
    // returning the raw string with best-effort mime detection. If it's not
    // a data URL and not an http URL, it's unusable — 415 so the UI shows a
    // broken-image icon instead of hanging.
    throw error(415, 'unsupported imageData format');
  }
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Length': String(bytes.length),
    },
  });
};
