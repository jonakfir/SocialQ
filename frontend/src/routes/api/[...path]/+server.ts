const TARGET = process.env.PRIVATE_API_BASE ?? 'http://127.0.0.1:8080';

async function forward(request: Request, path: string) {
  const url = `${TARGET.replace(/\/$/, '')}/${path}`;
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

  const out = new Headers(resp.headers);
  out.delete('content-encoding');

  return new Response(resp.body, { status: resp.status, headers: out });
}

export const GET     = ({ request, params }) => forward(request, params.path);
export const POST    = ({ request, params }) => forward(request, params.path);
export const PUT     = ({ request, params }) => forward(request, params.path);
export const PATCH   = ({ request, params }) => forward(request, params.path);
export const DELETE  = ({ request, params }) => forward(request, params.path);
export const OPTIONS = ({ request, params }) => forward(request, params.path);