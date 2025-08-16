// frontend/src/routes/api/[...path]/+server.ts
import { PUBLIC_API_URL } from '$env/static/public';

// Your Railway backend URL from Vercel env (no trailing slash)
const TARGET = (PUBLIC_API_URL || '').replace(/\/$/, '');

async function forward(request: Request, path: string) {
  if (!TARGET) return new Response('PUBLIC_API_URL is not set', { status: 500 });

  const url = `${TARGET}${path.startsWith('/') ? path : '/' + path}`;

  // copy headers, but remove ones the upstream won’t want
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');

  // only send a body when the method supports it
  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await request.arrayBuffer();

  const resp = await fetch(url, {
    method: request.method,
    headers,
    body,
    redirect: 'manual',
  });

  // pass response through, but drop encoding so Vercel can serve it
  const out = new Headers(resp.headers);
  out.delete('content-encoding');

  return new Response(resp.body, { status: resp.status, headers: out });
}

export const GET     = ({ request, params }) => forward(request, '/' + params.path);
export const POST    = ({ request, params }) => forward(request, '/' + params.path);
export const PUT     = ({ request, params }) => forward(request, '/' + params.path);
export const PATCH   = ({ request, params }) => forward(request, '/' + params.path);
export const DELETE  = ({ request, params }) => forward(request, '/' + params.path);
export const OPTIONS = ({ request, params }) => forward(request, '/' + params.path);
