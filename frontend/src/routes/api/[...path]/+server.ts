// frontend/src/routes/api/[...path]/+server.ts
import type { RequestHandler } from './$types';
import { env as PUBLIC } from '$env/dynamic/public';

const ORIGIN = (PUBLIC.PUBLIC_API_URL || '').replace(/\/$/, '');

async function forward(request: Request, path: string) {
  const url = ORIGIN + (path.startsWith('/') ? path : `/${path}`);

  // forward ALL headers (esp. Cookie) to Railway
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');

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
