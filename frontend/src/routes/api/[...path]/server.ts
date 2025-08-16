// frontend/src/routes/api/[...path]/server.ts
import type { RequestHandler } from './$types';
import { PRIVATE_API_BASE } from '$env/static/private';

// e.g. "https://socialq-production.up.railway.app"
const ORIGIN = (PRIVATE_API_BASE || '').replace(/\/$/, '');

async function forward(request: Request, path: string) {
  const url = `${ORIGIN}/${path}`;

  // Send body only when appropriate
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  const resp = await fetch(url, {
    method: request.method,
    headers: request.headers,
    body,
    redirect: 'manual',
  });

  // Pass most headers through, but drop encodings Vercel can’t serve directly
  const out = new Headers(resp.headers);
  out.delete('content-encoding');
  out.delete('content-length');

  return new Response(resp.body, { status: resp.status, headers: out });
}

export const GET:     RequestHandler = ({ request, params }) => forward(request, params.path);
export const POST:    RequestHandler = ({ request, params }) => forward(request, params.path);
export const PUT:     RequestHandler = ({ request, params }) => forward(request, params.path);
export const PATCH:   RequestHandler = ({ request, params }) => forward(request, params.path);
export const DELETE:  RequestHandler = ({ request, params }) => forward(request, params.path);
export const OPTIONS: RequestHandler = ({ request, params }) => forward(request, params.path);
