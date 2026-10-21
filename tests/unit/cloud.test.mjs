import { expect, it, vi } from 'vitest';
import { createCloudAPI } from '../../gateway/cloud.mjs';

const origin = 'https://mrai.example';
const env = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture_key_only_12345',
  MRAI_APP_ORIGIN: origin,
};
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.invalid' };
const access = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature_fixture`;
// Supabase's legacy refresh tokens are 12 characters; do not impose JWT length.
const refresh = 'fixture12345';
const cookies = `__Host-mrai_access=${access}; __Host-mrai_refresh=${refresh}`;
const request = (endpoint = 'account', method = 'GET', body, headers = {}) =>
  new Request(`${origin}/api/${endpoint}`, {
    method,
    headers: {
      cookie: cookies,
      ...(body ? { origin, 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const json = (data, status = 200) => Response.json(data, { status });
const task = {
  id: 'task_fixture',
  prompt: 'Create a brief',
  title: 'Brief',
  kind: 'research',
  mode: 'auto',
  status: 'planned',
  step: 0,
  createdAt: 100,
};

it('fails closed without cloud configuration and refuses server-secret keys', async () => {
  const fetcher = vi.fn();
  expect((await createCloudAPI({}, fetcher)('account', request())).status).toBe(503);
  expect(
    (
      await createCloudAPI(
        { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_use_this' },
        fetcher,
      )('account', request())
    ).status,
  ).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it('rejects foreign origins, cross-site requests and non-JSON mutations before fetch', async () => {
  const fetcher = vi.fn();
  const api = createCloudAPI(env, fetcher);
  for (const req of [
    request('account', 'GET', null, { origin: 'https://evil.invalid' }),
    request('account', 'GET', null, { 'sec-fetch-site': 'cross-site' }),
    request('account', 'POST', { action: 'logout' }, { origin: '' }),
    request('account', 'POST', { action: 'logout' }, { 'content-type': 'text/plain' }),
  ])
    expect((await api('account', req)).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
});
it('sets HttpOnly host-scoped secure cookies and never returns tokens in JSON', async () => {
  const fetcher = vi.fn(async () =>
    json({ user, access_token: access, refresh_token: refresh, expires_in: 3600 }),
  );
  const response = await createCloudAPI(env, fetcher)(
    'account',
    request('account', 'POST', {
      action: 'login',
      email: user.email,
      password: 'fixture_password',
    }),
  );
  expect(await response.json()).toEqual({ user });
  expect(response.headers.get('cache-control')).toContain('no-store');
  const set = response.headers.getSetCookie();
  expect(set).toHaveLength(2);
  for (const value of set) {
    expect(value).toContain('HttpOnly; Secure; SameSite=Lax');
    expect(value).not.toContain('Domain=');
  }
  expect(fetcher.mock.calls[0][0]).toBe(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`);
  expect(fetcher.mock.calls[0][1].redirect).toBe('error');
});
it('requires real user verification rather than trusting cookie JWT claims', async () => {
  const api = createCloudAPI(env, async () => json({ message: 'invalid token' }, 401));
  expect((await api('workspace', request('workspace'))).status).toBe(401);
});
it('does not authenticate duplicate cookies', async () => {
  const fetcher = vi.fn();
  const response = await createCloudAPI(env, fetcher)(
    'workspace',
    request('workspace', 'GET', null, {
      cookie: `__Host-mrai_access=${access}; __Host-mrai_access=${access}`,
    }),
  );
  expect(response.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('refreshes sessions without exposing refresh tokens and preserves outage state', async () => {
  const fetcher = vi.fn(async (url) =>
    url.endsWith('/user')
      ? json({}, 401)
      : json({ user, access_token: access, refresh_token: refresh, expires_in: 3600 }),
  );
  const response = await createCloudAPI(env, fetcher)('account', request());
  expect(await response.json()).toEqual({ user });
  expect(response.headers.getSetCookie()).toHaveLength(2);
  const outage = await createCloudAPI(env, async () => json({}, 503))('account', request());
  expect(outage.status).toBe(503);
  expect(outage.headers.getSetCookie()).toHaveLength(0);
});
it('returns confirmation instructions for signup without a session', async () => {
  const response = await createCloudAPI(env, async () => json({ user }))(
    'account',
    request('account', 'POST', {
      action: 'signup',
      email: user.email,
      password: 'fixture_password',
    }),
  );
  expect(await response.json()).toMatchObject({
    user: null,
    message: expect.stringContaining('Check your email'),
  });
  expect(response.headers.getSetCookie()).toHaveLength(0);
});
it('clears cookies on logout and does not disclose upstream errors', async () => {
  const response = await createCloudAPI(env, async () => new Response(null, { status: 204 }))(
    'account',
    request('account', 'POST', { action: 'logout' }),
  );
  expect(response.headers.getSetCookie().every((value) => value.includes('Max-Age=0'))).toBe(true);
  const failed = await createCloudAPI(env, async () =>
    json({ message: 'private internal trace fixture' }, 400),
  )(
    'account',
    request('account', 'POST', {
      action: 'login',
      email: user.email,
      password: 'fixture_password',
    }),
  );
  expect(await failed.text()).not.toContain('private internal trace');
});
it('uses the verified user token for RLS reads, never a service-role key or supplied owner ID', async () => {
  const fetcher = vi.fn(async (url) =>
    url.endsWith('/user') ? json(user) : json([{ tasks: [task], revision: 2 }]),
  );
  const response = await createCloudAPI(env, fetcher)('workspace', request('workspace'));
  expect(await response.json()).toEqual({ tasks: [task], revision: 2 });
  expect(fetcher.mock.calls[1][1].headers.authorization).toBe(`Bearer ${access}`);
  expect(fetcher.mock.calls[1][1].headers.apikey).toBe(env.SUPABASE_PUBLISHABLE_KEY);
});
it('does not treat a malformed database response as an empty workspace', async () => {
  for (const data of [
    {},
    [
      { tasks: [], revision: 1 },
      { tasks: [], revision: 2 },
    ],
  ]) {
    const api = createCloudAPI(env, async (url) =>
      url.endsWith('/user') ? json(user) : json(data),
    );
    expect((await api('workspace', request('workspace'))).status).toBe(502);
  }
});
it('passes expected revision through atomic database save and reports stale-write conflicts', async () => {
  const fetcher = vi.fn(async (url) =>
    url.endsWith('/user') ? json(user) : json({ code: '40001' }, 409),
  );
  const response = await createCloudAPI(env, fetcher)(
    'workspace',
    request('workspace', 'PUT', { tasks: [task], revision: 2, user_id: 'someone_else' }),
  );
  expect(response.status).toBe(409);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    expected_revision: 2,
    next_tasks: [task],
  });
});
it('rejects malformed workspace data and does not claim unconfirmed saves succeeded', async () => {
  const fetcher = vi.fn(async (url) =>
    url.endsWith('/user') ? json(user) : json({ revision: 9 }),
  );
  const api = createCloudAPI(env, fetcher);
  for (const tasks of [[{ ...task, step: 3 }], Array(31).fill(task), [task, task]]) {
    expect(
      (await api('workspace', request('workspace', 'PUT', { tasks, revision: 0 }))).status,
    ).toBe(400);
  }
  expect(
    (await api('workspace', request('workspace', 'PUT', { tasks: [task], revision: 0 }))).status,
  ).toBe(503);
});
it('bounds request and upstream bodies and handles network failures without logging secrets', async () => {
  const fetcher = vi.fn();
  expect(
    (
      await createCloudAPI(env, fetcher)(
        'account',
        request('account', 'POST', { password: 'a'.repeat(5000) }),
      )
    ).status,
  ).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  const api = createCloudAPI(env, async () => {
    throw new Error('private token fixture');
  });
  const response = await api('account', request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private token');
});
