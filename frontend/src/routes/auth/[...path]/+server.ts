/**
 * Proxy /auth/* to the backend (PUBLIC_API_URL).
 * Allows mobile app to use a single base URL (frontend) for both auth and /api/*.
 */
import type { RequestHandler } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

const ORIGIN = (PUBLIC.PUBLIC_API_URL || '').replace(/\/$/, '');

async function forward(request: Request, path: string) {
  if (!ORIGIN) {
    return new Response(
      JSON.stringify({ error: 'Backend URL not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const url = `${ORIGIN}/auth/${path}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');

  const authHeader =
    headers.get('authorization') ||
    headers.get('Authorization') ||
    request.headers.get('authorization') ||
    request.headers.get('Authorization');
  if (authHeader) headers.set('Authorization', authHeader);

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  const resp = await fetch(url, {
    method: request.method,
    headers,
    body,
    redirect: 'manual'
  });

  const out = new Headers(resp.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  return new Response(resp.body, { status: resp.status, headers: out });
}

export const GET: RequestHandler = ({ request, params }) => forward(request, params.path);
export const POST: RequestHandler = ({ request, params }) => forward(request, params.path);
export const PUT: RequestHandler = ({ request, params }) => forward(request, params.path);
export const PATCH: RequestHandler = ({ request, params }) => forward(request, params.path);
export const DELETE: RequestHandler = ({ request, params }) => forward(request, params.path);
export const OPTIONS: RequestHandler = ({ request, params }) => forward(request, params.path);
