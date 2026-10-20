import { createHash, timingSafeEqual } from 'node:crypto';

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });

// Initial GitHub/Vercel deployment only. Intentionally imports no ledger or
// provider adapter: setting keys or AYRA_LIVE_ENABLED cannot enable paid calls.
// Real hosted drafting requires durable shared accounting and authenticated users.
export function previewEndpoint(endpoint, request, env = process.env) {
  if (endpoint === 'health' && request.method === 'GET')
    return json({ service: 'MrAI by Ayush', mode: 'deployment-preview', liveEnabled: false });
  if (request.headers.has('origin'))
    return json(
      { error: 'ORIGIN_DENIED', message: 'Browser gateway requests are not enabled.' },
      403,
    );
  const expectedHash = env.AYRA_CLIENT_TOKEN_SHA256 ?? '';
  if (!/^[a-f0-9]{64}$/.test(expectedHash))
    return json(
      { error: 'GATEWAY_NOT_CONFIGURED', message: 'Hosted AI drafting is not configured.' },
      503,
    );
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer ([a-zA-Z0-9_-]{32,200})$/)?.[1];
  const actual = createHash('sha256')
    .update(token ?? '')
    .digest();
  if (!token || !timingSafeEqual(actual, Buffer.from(expectedHash, 'hex')))
    return json({ error: 'UNAUTHORIZED', message: 'Gateway authentication is required.' }, 401);
  if (endpoint === 'status' && request.method === 'GET')
    return json({
      connected: true,
      liveEnabled: false,
      models: [],
      scope: 'deployment-preview',
      message: 'Hosted AI drafting is disabled. Local demos remain available.',
    });
  if (endpoint === 'runs' && request.method === 'POST')
    return json(
      {
        error: 'LIVE_DISABLED',
        message: 'Hosted AI drafting is disabled until shared accounting is implemented.',
      },
      503,
    );
  return json({ error: 'NOT_FOUND', message: 'No such preview endpoint.' }, 404);
}
