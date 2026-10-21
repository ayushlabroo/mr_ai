// Hosted account/data API. This module deliberately imports no inference adapter.
const ACCESS = '__Host-mrai_access';
const REFRESH = '__Host-mrai_refresh';
const MAX_BYTES = 3_600_000;
const reply = (body, status = 200, cookies = []) => {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    vary: 'Cookie',
  });
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return Response.json(body, { status, headers });
};
const failure = (code, message, status) => reply({ error: code, message }, status);
const cookie = (name, value, age) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const clear = () => [cookie(ACCESS, '', 0), cookie(REFRESH, '', 0)];
const sessionCookies = (data) => [
  cookie(ACCESS, data.access_token, Math.min(data.expires_in, 3600)),
  cookie(REFRESH, data.refresh_token, 60 * 60 * 24 * 30),
];
const safeToken = (value) =>
  typeof value === 'string' &&
  value.length >= 20 &&
  value.length <= 6000 &&
  /^[\w.-]+$/.test(value);
const validUser = (user) =>
  user && /^[a-f0-9-]{36}$/i.test(user.id) && typeof user.email === 'string';
const publicUser = (user) => ({ id: user.id, email: user.email });
const validSession = (data) =>
  safeToken(data?.access_token) &&
  safeToken(data?.refresh_token) &&
  Number.isInteger(data.expires_in) &&
  data.expires_in > 0 &&
  validUser(data.user);

function configuration(env) {
  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(env.SUPABASE_URL ?? '')) return null;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? '';
  // Only a publishable key is needed. Never accept a service-role/secret key.
  if (!/^sb_publishable_[\w-]{10,200}$/.test(key)) return null;
  try {
    const origin = new URL(env.MRAI_APP_ORIGIN);
    if (origin.protocol !== 'https:' || origin.origin !== env.MRAI_APP_ORIGIN) return null;
    return { url: env.SUPABASE_URL, key, origin: origin.origin };
  } catch {
    return null;
  }
}

function readCookies(request) {
  const entries = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((item) => item.trim().split('='));
  const read = (name) => {
    const matching = entries.filter(([key]) => key === name);
    return matching.length === 1 && safeToken(matching[0][1]) ? matching[0][1] : null;
  };
  return { access: read(ACCESS), refresh: read(REFRESH) };
}

async function boundedJSON(response, maximum) {
  if (!response.body) throw new Error('Missing response body');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Body exceeds limit');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function validSnapshot(tasks) {
  if (!Array.isArray(tasks) || tasks.length > 30) return false;
  const ids = new Set();
  return tasks.every((t) => {
    if (!t || typeof t !== 'object' || !/^[\w-]{1,80}$/.test(t.id) || ids.has(t.id)) return false;
    ids.add(t.id);
    return (
      typeof t.prompt === 'string' &&
      !!t.prompt.trim() &&
      t.prompt.length <= 4000 &&
      typeof t.title === 'string' &&
      !!t.title.trim() &&
      t.title.length <= 72 &&
      ['research', 'files', 'comparison'].includes(t.kind) &&
      ['auto', 'economy', 'thorough'].includes(t.mode) &&
      ['planned', 'running', 'paused', 'completed', 'cancelled'].includes(t.status) &&
      Number.isInteger(t.step) &&
      t.step >= 0 &&
      t.step <= 3 &&
      (t.status === 'completed' ? t.step === 3 : t.step < 3) &&
      Number.isFinite(t.createdAt) &&
      t.createdAt >= 0
    );
  });
}

export function createCloudAPI(env = process.env, fetcher = fetch) {
  const config = configuration(env);
  async function upstream(path, { method = 'GET', token, body } = {}) {
    const response = await fetcher(`${config.url}${path}`, {
      method,
      headers: {
        apikey: config.key,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(7000),
    });
    const data = response.status === 204 ? null : await boundedJSON(response, MAX_BYTES);
    return { status: response.status, ok: response.ok, data };
  }
  return async function cloud(endpoint, request) {
    if (!config)
      return failure(
        'CLOUD_NOT_CONFIGURED',
        'Cloud accounts are not connected yet. Local demos remain available.',
        503,
      );
    if (
      new URL(request.url).origin !== config.origin ||
      (request.headers.has('origin') && request.headers.get('origin') !== config.origin) ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return failure('ORIGIN_DENIED', 'Use this app to access your account.', 403);
    const methods = endpoint === 'account' ? ['GET', 'POST'] : ['GET', 'PUT'];
    if (!methods.includes(request.method))
      return failure('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    if (
      request.method !== 'GET' &&
      (request.headers.get('origin') !== config.origin ||
        request.headers.get('content-type') !== 'application/json')
    )
      return failure('INVALID_REQUEST', 'A same-origin JSON request is required.', 403);
    try {
      let body;
      if (request.method !== 'GET') {
        try {
          body = await boundedJSON(request, endpoint === 'account' ? 4096 : MAX_BYTES);
        } catch {
          return failure('INVALID_REQUEST', 'The request is invalid or too large.', 400);
        }
      }
      const tokens = readCookies(request);
      if (endpoint === 'account' && request.method === 'POST') {
        if (body?.action === 'logout') {
          let logoutToken = tokens.access;
          if (!logoutToken && tokens.refresh) {
            const refreshed = await upstream('/auth/v1/token?grant_type=refresh_token', {
              method: 'POST',
              body: { refresh_token: tokens.refresh },
            });
            if (refreshed.ok && validSession(refreshed.data))
              logoutToken = refreshed.data.access_token;
            else if (![400, 401, 403].includes(refreshed.status))
              return failure(
                'UNAVAILABLE',
                'Sign out could not be confirmed. Please try again.',
                503,
              );
          }
          if (logoutToken) {
            const result = await upstream('/auth/v1/logout?scope=local', {
              method: 'POST',
              token: logoutToken,
            });
            if (!result.ok && result.status !== 401 && result.status !== 403)
              return failure(
                'UNAVAILABLE',
                'Sign out could not be confirmed. Please try again.',
                503,
              );
          }
          return reply({ user: null }, 200, clear());
        }
        if (
          !['login', 'signup'].includes(body?.action) ||
          typeof body.email !== 'string' ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
          body.email.length > 254 ||
          typeof body.password !== 'string' ||
          body.password.length < 8 ||
          body.password.length > 256
        )
          return failure(
            'INVALID_REQUEST',
            'Enter a valid email and a password of 8–256 characters.',
            400,
          );
        const result = await upstream(
          body.action === 'login' ? '/auth/v1/token?grant_type=password' : '/auth/v1/signup',
          { method: 'POST', body: { email: body.email.trim(), password: body.password } },
        );
        if (!result.ok)
          return failure(
            'AUTH_FAILED',
            result.status === 429
              ? 'Too many attempts. Please wait before trying again.'
              : 'Could not sign in or create the account. Check your details and email confirmation. Email delivery may be restricted by the project settings.',
            result.status === 429 ? 429 : 400,
          );
        if (validSession(result.data))
          return reply({ user: publicUser(result.data.user) }, 200, sessionCookies(result.data));
        if (body.action === 'signup')
          return reply({
            user: null,
            message:
              'Check your email to confirm your account, then sign in. Existing accounts can sign in directly.',
          });
        return failure('AUTH_FAILED', 'The account response could not be verified.', 502);
      }
      let user = null;
      if (tokens.access) {
        const result = await upstream('/auth/v1/user', { token: tokens.access });
        if (result.ok && validUser(result.data)) user = result.data;
        else if (result.status !== 401 && result.status !== 403)
          return failure('UNAVAILABLE', 'Account verification is temporarily unavailable.', 503);
      }
      if (endpoint === 'account') {
        let expiresSoon = true;
        if (tokens.access) {
          try {
            const claims = JSON.parse(
              Buffer.from(tokens.access.split('.')[1], 'base64url').toString('utf8'),
            );
            expiresSoon =
              !Number.isFinite(claims.exp) || claims.exp * 1000 - Date.now() < 20 * 60 * 1000;
          } catch {
            /* Invalid claims never authorize a user; /user verified it above. */
          }
        }
        if (user && (!expiresSoon || !tokens.refresh)) return reply({ user: publicUser(user) });
        if (tokens.refresh) {
          const refreshed = await upstream('/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            body: { refresh_token: tokens.refresh },
          });
          if (refreshed.ok && validSession(refreshed.data))
            return reply(
              { user: publicUser(refreshed.data.user) },
              200,
              sessionCookies(refreshed.data),
            );
          if (refreshed.status !== 400 && refreshed.status !== 401 && refreshed.status !== 403)
            return failure('UNAVAILABLE', 'Session refresh is temporarily unavailable.', 503);
        }
        return reply({ user: null }, 200, clear());
      }
      if (!user)
        return failure(
          'UNAUTHORIZED',
          'Your session expired. Sign in again to save; your open tasks remain available.',
          401,
        );
      if (request.method === 'GET') {
        const result = await upstream('/rest/v1/workspaces?select=tasks,revision&limit=1', {
          token: tokens.access,
        });
        if (!result.ok)
          return failure('UNAVAILABLE', 'Cloud workspace is unavailable. Please try again.', 503);
        const record = result.data?.[0] ?? { tasks: [], revision: 0 };
        if (
          !validSnapshot(record.tasks) ||
          !Number.isSafeInteger(record.revision) ||
          record.revision < 0
        )
          return failure('INVALID_WORKSPACE', 'Cloud workspace could not be verified.', 502);
        return reply(record);
      }
      if (!validSnapshot(body?.tasks) || !Number.isSafeInteger(body?.revision) || body.revision < 0)
        return failure(
          'INVALID_REQUEST',
          'The workspace could not be saved because its data is invalid.',
          400,
        );
      const result = await upstream('/rest/v1/rpc/save_workspace', {
        method: 'POST',
        token: tokens.access,
        body: { expected_revision: body.revision, next_tasks: body.tasks },
      });
      if (result.status === 409 || result.data?.code === '40001')
        return failure(
          'CONFLICT',
          'This workspace changed in another tab or device. Export your edits before reloading.',
          409,
        );
      if (
        !result.ok ||
        !Number.isSafeInteger(result.data?.revision) ||
        result.data.revision !== body.revision + 1
      )
        return failure(
          'UNAVAILABLE',
          'Cloud save could not be confirmed. Your open tasks remain available.',
          503,
        );
      return reply({ revision: result.data.revision });
    } catch {
      return failure(
        'UNAVAILABLE',
        'Cloud service could not be reached. Your open tasks remain available.',
        503,
      );
    }
  };
}
