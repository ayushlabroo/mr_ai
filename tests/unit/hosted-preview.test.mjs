import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { previewEndpoint } from '../../gateway/hosted-preview.mjs';
import health from '../../api/health.mjs';
import { createGatewayClient } from '../../desktop/gateway.mjs';

const token = 'hosted_preview_fixture_token_with_32_chars';
const env = { AYRA_CLIENT_TOKEN_SHA256: createHash('sha256').update(token).digest('hex') };
const request = (method = 'GET', headers = {}) =>
  new Request('https://mrai.example/v1/status', {
    method,
    headers: { authorization: `Bearer ${token}`, ...headers },
  });
afterEach(() => vi.unstubAllGlobals());

it('serves a public health response without credentials or a database', async () => {
  const response = health.fetch(new Request('https://mrai.example/api/health'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    service: 'MrAI by Ayush',
    mode: 'deployment-preview',
    liveEnabled: false,
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
});

it('rejects missing configuration, bad credentials, and browser origins', () => {
  expect(previewEndpoint('status', request(), {}).status).toBe(503);
  expect(previewEndpoint('status', request('GET', { authorization: '' }), env).status).toBe(401);
  expect(
    previewEndpoint('status', request('GET', { origin: 'https://mrai.example' }), env).status,
  ).toBe(403);
});

it('cannot dispatch paid calls even when provider keys and live flags are present', async () => {
  const fetcher = vi.fn(() => {
    throw new Error('External fetch is forbidden.');
  });
  vi.stubGlobal('fetch', fetcher);
  const settings = {
    ...env,
    AYRA_LIVE_ENABLED: 'true',
    DEEPSEEK_API_KEY: 'private-test-key',
    ANTHROPIC_API_KEY: 'private-test-key',
  };
  const status = await previewEndpoint('status', request(), settings).json();
  expect(status).toMatchObject({ liveEnabled: false, models: [] });
  const response = previewEndpoint('runs', request('POST'), settings);
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe('LIVE_DISABLED');
  expect(JSON.stringify(status)).not.toContain('private-test-key');
  expect(JSON.stringify(status)).not.toContain(token);
  expect(fetcher).not.toHaveBeenCalled();
});

it('exposes a compatible disabled status to the desktop client and rejects other methods', async () => {
  const client = createGatewayClient(
    { AYRA_GATEWAY_URL: 'https://mrai.example', AYRA_GATEWAY_TOKEN: token },
    (url, options) => previewEndpoint('status', new Request(url, options), env),
  );
  expect(await client.status()).toMatchObject({ connected: true, liveEnabled: false, models: [] });
  expect(previewEndpoint('status', request('POST'), env).status).toBe(404);
});
