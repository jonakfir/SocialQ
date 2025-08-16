import { PRIVATE_API_BASE } from '$env/static/private';

const BASE = (PRIVATE_API_BASE || '').replace(/\/$/, '');

async function forward(event, suffix) {
  const req = event.request;
  const url = `${BASE}${suffix}`;

  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await req.arrayBuffer();

  const resp = await fetch(url, {
    method: req.method,
    headers: req.headers,
    body,
    redirect: 'manual'
  });

  // Pass through headers, but drop compression so Vercel can serve it
  const headers = new Headers(resp.headers);
  headers.delete('content-encoding');

  return new Response(resp.body, { status: resp.status, headers });
}

export const GET     = (e) => forward(e, '/' + e.params.path);
export const POST    = (e) => forward(e, '/' + e.params.path);
export const PUT     = (e) => forward(e, '/' + e.params.path);
export const PATCH   = (e) => forward(e, '/' + e.params.path);
export const DELETE  = (e) => forward(e, '/' + e.params.path);
export const OPTIONS = (e) => forward(e, '/' + e.params.path);
