import { afterEach, describe, expect, it, vi } from 'vitest';
import { Duplex } from 'node:stream';
import { createHash } from 'node:crypto';
import { Ledger } from '../../gateway/ledger.mjs';
import { createGateway } from '../../gateway/service.mjs';
import { createGatewayHttpServer } from '../../gateway/http.mjs';

const TOKEN = 'http_fixture_token_with_at_least_32_characters';
const fixtures = [];

function fixture() {
  const ledger = new Ledger();
  const callProvider = vi.fn(() => {
    throw new Error('This HTTP fixture must never dispatch a provider call.');
  });
  const gateway = createGateway({
    ledger,
    callProvider,
    config: {
      tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
      models: [],
      keys: {},
      liveEnabled: false,
      limitUsdMicros: 1000,
      markupBps: 0,
    },
  });
  const received = [];
  const originalHandle = gateway.handle;
  const handle = vi.spyOn(gateway, 'handle').mockImplementation((request) => {
    received.push(request.clone());
    return originalHandle(request);
  });
  const server = createGatewayHttpServer({ gateway, port: 4318 });
  const sockets = [];
  fixtures.push({ ledger, gateway, server, sockets });

  // Feed actual HTTP bytes through Node's HTTP parser and production adapter on
  // a memory Duplex. No TCP listen/connect, native IPC, or provider network calls.
  async function send(raw) {
    const chunks = [];
    let timeout;
    const completed = new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('HTTP response did not finish.')), 1000);
      const socket = new Duplex({
        read() {},
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
        final(callback) {
          callback();
          resolve();
        },
      });
      socket.on('error', reject);
      socket.once('close', resolve);
      sockets.push(socket);
      server.emit('connection', socket);
      socket.push(Buffer.from(raw));
    });
    try {
      await completed;
      const response = Buffer.concat(chunks).toString('utf8');
      expect(response).toMatch(/^HTTP\/1\.1 \d{3}/);
      return {
        status: Number(response.slice(9, 12)),
        text: response,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { send, handle, received, callProvider, server };
}

function message({ method = 'GET', target = '/v1/status', headers = [], body = '' } = {}) {
  return `${method} ${target} HTTP/1.1\r\n${[
    'Host: 127.0.0.1:4318',
    `Authorization: Bearer ${TOKEN}`,
    'Connection: close',
    ...headers,
  ].join('\r\n')}\r\n\r\n${body}`;
}

afterEach(() => {
  for (const { ledger, gateway, server, sockets } of fixtures.splice(0)) {
    gateway.shutdown();
    for (const socket of sockets) socket.destroy();
    server.close();
    ledger.close();
  }
});

describe('gateway HTTP parser and adapter without a listener', () => {
  it('serves authenticated status through the real HTTP parser with no CORS grants', async () => {
    const { send, handle, callProvider, server } = fixture();
    const response = await send(message());
    expect(server.listening).toBe(false);
    expect(response.status).toBe(200);
    expect(response.text).toContain('"liveEnabled":false');
    expect(response.text.toLowerCase()).toContain('cache-control: no-store');
    expect(response.text.toLowerCase()).not.toContain('access-control-allow-origin');
    expect(response.text).not.toContain(TOKEN);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(callProvider).not.toHaveBeenCalled();
  });

  it.each([
    'Host: attacker.example',
    'hOsT: localhost:4318',
    `Authorization: Bearer ${TOKEN}`,
    'Origin: https://one.example\r\nOrigin: https://two.example',
    'Content-Type: application/json\r\ncontent-type: text/plain',
  ])('rejects ambiguous headers before dispatch: %s', async (header) => {
    const { send, handle, callProvider } = fixture();
    const response = await send(message({ headers: [header] }));
    expect(response.status).toBe(400);
    expect(handle).not.toHaveBeenCalled();
    expect(callProvider).not.toHaveBeenCalled();
  });

  it.each(['attacker.example', '127.0.0.1:9999', '127.0.0.1:4318.attacker.example'])(
    'rejects a foreign Host: %s',
    async (host) => {
      const { send, handle } = fixture();
      const raw = message().replace('Host: 127.0.0.1:4318', `Host: ${host}`);
      expect((await send(raw)).status).toBe(403);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it.each(['http://attacker.example/v1/status', '//attacker.example/v1/status'])(
    'rejects a non-local request target: %s',
    async (target) => {
      const { send, handle } = fixture();
      expect((await send(message({ target }))).status).toBe(400);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it('rejects a declared oversized body before waiting for it', async () => {
    const { send, handle } = fixture();
    const response = await send(
      message({
        method: 'POST',
        target: '/v1/runs',
        headers: ['Content-Length: 64001'],
      }),
    );
    expect(response.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it('bounds chunked bodies by bytes before dispatch', async () => {
    const { send, handle } = fixture();
    const body = 'x'.repeat(64001);
    const response = await send(
      message({
        method: 'POST',
        target: '/v1/runs',
        headers: ['Transfer-Encoding: chunked'],
        body: `${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`,
      }),
    );
    expect(response.status).toBe(413);
    expect(handle).not.toHaveBeenCalled();
  });

  it.each([
    { header: 'Origin: https://attacker.example', code: 403 },
    { header: 'Authorization: Bearer invalid', code: 401 },
  ])('preserves the gateway rejection $code through HTTP', async ({ header, code }) => {
    const { send, callProvider } = fixture();
    const raw = header.startsWith('Authorization')
      ? message().replace(`Authorization: Bearer ${TOKEN}`, header)
      : message({ headers: [header] });
    expect((await send(raw)).status).toBe(code);
    expect(callProvider).not.toHaveBeenCalled();
  });

  it('passes UTF-8 JSON unchanged and keeps live calls disabled', async () => {
    const { send, received, callProvider } = fixture();
    const body = JSON.stringify({
      id: 'http_fixture_draft_id',
      prompt: 'Draft résumé notes',
      notes: 'नमस्ते',
      mode: 'auto',
    });
    const response = await send(
      message({
        method: 'POST',
        target: '/v1/runs',
        headers: ['Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`],
        body,
      }),
    );
    expect(response.status).toBe(503);
    expect(response.text).toContain('LIVE_DISABLED');
    expect(await received[0].text()).toBe(body);
    expect(callProvider).not.toHaveBeenCalled();
  });
});
