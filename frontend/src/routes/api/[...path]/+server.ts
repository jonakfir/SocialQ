// frontend/src/routes/api/[...path]/+server.ts
import type { RequestHandler } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

const ORIGIN = (PUBLIC.PUBLIC_API_URL || '').replace(/\/$/, '');

async function forward(request: Request, path: string) {
  // If PUBLIC_API_URL is not set, return error
  if (!ORIGIN) {
    console.error('[API Proxy] PUBLIC_API_URL is not set. Cannot proxy request to backend.');
    return new Response(
      JSON.stringify({ error: 'Backend URL not configured. PUBLIC_API_URL environment variable is missing.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const url = ORIGIN + (path.startsWith('/') ? path : `/${path}`);

  // forward ALL headers (esp. Cookie and Authorization) to Railway
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  
  // CRITICAL: Explicitly check and forward Authorization header (case-insensitive)
  // Check all possible case variations
  const authHeader = 
    headers.get('authorization') || 
    headers.get('Authorization') || 
    headers.get('AUTHORIZATION') ||
    request.headers.get('authorization') ||
    request.headers.get('Authorization') ||
    request.headers.get('AUTHORIZATION');
  
  if (authHeader) {
    // Ensure it's set in the headers we're forwarding
    headers.set('Authorization', authHeader);
    console.log('[API Proxy] ✅ Forwarding Authorization header to backend, length:', authHeader.length);
  } else {
    console.log('[API Proxy] ❌ No Authorization header found');
    console.log('[API Proxy] Request headers:', Array.from(request.headers.keys()).join(', '));
    console.log('[API Proxy] Headers object keys:', Array.from(headers.keys()).join(', '));
  }

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  // Log what we're sending
  const finalAuth = headers.get('Authorization');
  if (finalAuth) {
    console.log('[API Proxy] Sending request with Authorization header to:', url);
  }

  const resp = await fetch(url, {
    method: request.method,
    headers,
    body,
    redirect: 'manual'
  });

  // pass Set-Cookie back to the browser; strip encodings
  const out = new Headers(resp.headers);
  out.delete('content-encoding');
  out.delete('content-length');

  return new Response(resp.body, { status: resp.status, headers: out });
}

export const GET: RequestHandler     = ({ request, params }) => forward(request, `/${params.path}`);
export const POST: RequestHandler    = ({ request, params }) => forward(request, `/${params.path}`);
export const PUT: RequestHandler     = ({ request, params }) => forward(request, `/${params.path}`);
export const PATCH: RequestHandler   = ({ request, params }) => forward(request, `/${params.path}`);
export const DELETE: RequestHandler  = ({ request, params }) => forward(request, `/${params.path}`);
export const OPTIONS: RequestHandler = ({ request, params }) => forward(request, `/${params.path}`);
