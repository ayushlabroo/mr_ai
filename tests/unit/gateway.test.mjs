import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ledger, acquireGatewayLock } from '../../gateway/ledger.mjs';
import { createGateway } from '../../gateway/service.mjs';
import { configFromEnv, routeRequest, validateModels } from '../../gateway/config.mjs';
import { meteredCost, reservationFor, debitPreview } from '../../gateway/pricing.mjs';
import { makeProviderCaller, parseReceipt } from '../../gateway/providers.mjs';
import { ProviderError } from '../../gateway/errors.mjs';
import { createGatewayClient, gatewayConnection, validateDraft } from '../../desktop/gateway.mjs';

const TOKEN = 'test_client_token_with_at_least_32_characters';
const hash = createHash('sha256').update(TOKEN).digest('hex');
const economy = {
  id: 'fixture-economy',
  provider: 'deepseek',
  tier: 'economy',
  contextTokens: 8192,
  maxOutputTokens: 128,
  prices: { input: 1_000_000, output: 2_000_000, cacheRead: 100_000, cacheWrite: 1_000_000 },
};
const advanced = { ...economy, id: 'fixture-advanced', provider: 'anthropic', tier: 'advanced' };
const receipt = {
  markdown: '# A useful draft\n\nBased on supplied notes.',
  truncated: false,
  usage: { input: 100, output: 20, cacheRead: 10, cacheWrite: 0 },
};
const fixtures = [];
function fixture(overrides = {}, caller = vi.fn(async () => receipt)) {
  const config = {
    tokenHash: hash,
    limitUsdMicros: 1_000_000,
    markupBps: 10_000,
    liveEnabled: true,
    models: [economy, advanced],
    keys: { deepseek: 'fixture-key', anthropic: 'fixture-anthropic-key' },
    ...overrides,
  };
  const ledger = new Ledger();
  const gateway = createGateway({ config, ledger, callProvider: caller });
  const request = (method, endpoint, body, headers = {}) =>
    gateway.handle(
      new Request(`http://127.0.0.1:4318${endpoint}`, {
        method,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          'content-type': 'application/json',
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  fixtures.push({ ledger, gateway });
  return { config, ledger, gateway, caller, request };
}
const input = (overrides = {}) => ({
  id: randomUUID(),
  prompt: 'Draft a clear project note',
  notes: 'A small team with a weekly review.',
  mode: 'auto',
  ...overrides,
});
afterEach(async () => {
  for (const item of fixtures.splice(0)) {
    item.gateway.shutdown();
    await new Promise((resolve) => setImmediate(resolve));
    item.ledger.close();
  }
});

describe('authenticated gateway and durable accounting', () => {
  it('rejects missing auth, browser origins, and body-supplied identity/model overrides', async () => {
    const { request, caller, ledger } = fixture();
    expect((await request('GET', '/v1/status', undefined, { authorization: '' })).status).toBe(401);
    expect(
      (await request('GET', '/v1/status', undefined, { origin: 'https://evil.example' })).status,
    ).toBe(403);
    const run = input({ owner: 'someone-else', model: 'attacker-model', prices: {} });
    expect((await request('POST', '/v1/runs', run)).status).toBe(202);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('succeeded'));
    expect(caller.mock.calls[0][0].id).toBe(economy.id);
    expect(ledger.get('someone-else', run.id)).toBeUndefined();
  });
  it('keeps credentials out of status and makes no calls when live mode is disabled', async () => {
    const { request, caller } = fixture({ liveEnabled: false });
    const status = await request('GET', '/v1/status');
    const text = await status.text();
    expect(text).not.toContain('fixture-key');
    expect(text).not.toContain(TOKEN);
    expect((await request('POST', '/v1/runs', input())).status).toBe(503);
    expect(caller).not.toHaveBeenCalled();
  });
  it('deduplicates matching IDs, rejects changed content, and separates cost from debit preview', async () => {
    const { request, caller, ledger } = fixture();
    const run = input();
    await Promise.all([request('POST', '/v1/runs', run), request('POST', '/v1/runs', run)]);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('succeeded'));
    expect(caller).toHaveBeenCalledTimes(1);
    const result = await (await request('GET', `/v1/runs/${run.id}`)).json();
    expect(result.costUsdMicros).toBe(141);
    expect(result.debitPreviewUsdMicros).toBe(282);
    expect(result.heldUsdMicros).toBe(0);
    expect(result.markdown).toContain('No web search or file inspection was performed.');
    expect((await request('POST', '/v1/runs', { ...run, notes: 'Changed' })).status).toBe(409);
    expect(caller).toHaveBeenCalledTimes(1);
  });
  it('reserves budget before dispatch and refuses insufficient budgets without calling a provider', async () => {
    const { request, caller, ledger } = fixture({ limitUsdMicros: reservationFor(economy) - 1 });
    expect((await request('POST', '/v1/runs', input())).status).toBe(402);
    expect(caller).not.toHaveBeenCalled();
    expect(ledger.summary('founder').heldUsdMicros).toBe(0);
  });
  it('blocks concurrent submissions from overspending their shared allowance', async () => {
    const caller = vi.fn(
      (_model, _request, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new ProviderError('Aborted'))),
        ),
    );
    const { request, ledger } = fixture({ limitUsdMicros: reservationFor(economy) }, caller);
    const results = await Promise.all([
      request('POST', '/v1/runs', input()),
      request('POST', '/v1/runs', input()),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([202, 402]);
    expect(ledger.summary('founder').heldUsdMicros).toBe(reservationFor(economy));
    expect(caller).toHaveBeenCalledTimes(1);
  });
  it('retains budget on ambiguous network failures and never retries them', async () => {
    const caller = vi.fn(async () => {
      throw new ProviderError('Usage unknown');
    });
    const { request, ledger } = fixture({}, caller);
    const run = input();
    await request('POST', '/v1/runs', run);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('uncertain'));
    expect(ledger.summary('founder').heldUsdMicros).toBe(reservationFor(economy));
    await request('POST', '/v1/runs', run);
    expect(caller).toHaveBeenCalledTimes(1);
  });
  it('releases rejected calls, but cancels dispatched calls with a retained hold', async () => {
    const rejected = fixture(
      {},
      vi.fn(async () => {
        throw new ProviderError('Rejected before inference', true);
      }),
    );
    const a = input();
    await rejected.request('POST', '/v1/runs', a);
    await vi.waitFor(() => expect(rejected.ledger.get('founder', a.id)?.status).toBe('failed'));
    expect(rejected.ledger.summary('founder').heldUsdMicros).toBe(0);
    const caller = vi.fn(
      (_model, _request, signal) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () =>
            reject(new ProviderError('Cancelled after dispatch')),
          ),
        ),
    );
    const cancelled = fixture({}, caller);
    const b = input();
    await cancelled.request('POST', '/v1/runs', b);
    await vi.waitFor(() => expect(caller).toHaveBeenCalledTimes(1));
    const result = await (await cancelled.request('POST', `/v1/runs/${b.id}/cancel`)).json();
    expect(result.status).toBe('uncertain');
    expect(result.heldUsdMicros).toBe(reservationFor(economy));
  });
  it('freezes further calls when reported usage violates model configuration', async () => {
    const { request, ledger } = fixture(
      {},
      vi.fn(async () => ({ ...receipt, usage: { ...receipt.usage, output: 129 } })),
    );
    const run = input();
    await request('POST', '/v1/runs', run);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('failed'));
    expect(ledger.summary('founder').blocked).toBe(true);
    expect((await request('POST', '/v1/runs', input())).status).toBe(403);
  });
  it('preserves known costs even when the provider produces no usable output', async () => {
    const { request, ledger } = fixture(
      {},
      vi.fn(async () => ({ ...receipt, markdown: '' })),
    );
    const run = input();
    await request('POST', '/v1/runs', run);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('failed'));
    const row = ledger.get('founder', run.id);
    expect(row.cost).toBe(141);
    expect(row.debit_preview).toBe(0);
    expect(row.held).toBe(0);
  });
  it('retains reservations and freezes new calls when provider identity needs review', async () => {
    const caller = vi.fn(async () => {
      throw new ProviderError('Response model does not match configuration.', false, true);
    });
    const { request, ledger } = fixture({}, caller);
    const run = input();
    await request('POST', '/v1/runs', run);
    await vi.waitFor(() => expect(ledger.get('founder', run.id)?.status).toBe('uncertain'));
    expect(ledger.summary('founder').heldUsdMicros).toBe(reservationFor(economy));
    expect(ledger.summary('founder').blocked).toBe(true);
    expect((await request('POST', '/v1/runs', input())).status).toBe(403);
    expect(caller).toHaveBeenCalledTimes(1);
  });
  it('does not silently send advanced work to an economical model', async () => {
    const { request, caller } = fixture({ models: [economy] });
    expect((await request('POST', '/v1/runs', input({ mode: 'thorough' }))).status).toBe(503);
    expect(caller).not.toHaveBeenCalled();
  });
});

describe('restart and ledger ownership', () => {
  it('recovers queued calls without replay, retains sent reservations across month boundaries', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ayra-ledger-'));
    const filename = path.join(directory, 'ledger.sqlite');
    const queued = randomUUID(),
      running = randomUUID();
    let ledger = new Ledger(filename);
    try {
      for (const id of [queued, running])
        ledger.reserve({
          owner: 'founder',
          id,
          fingerprint: id,
          model: economy,
          amount: 100,
          limit: 1000,
          markupBps: 0,
          now: Date.UTC(2026, 8, 1),
        });
      ledger.dispatched('founder', running);
      ledger.close();
      ledger = new Ledger(filename);
      ledger.recover();
      expect(ledger.get('founder', queued).status).toBe('failed');
      expect(ledger.get('founder', running).status).toBe('uncertain');
      expect(ledger.summary('founder', Date.UTC(2026, 9, 1)).heldUsdMicros).toBe(100);
    } finally {
      ledger.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('prevents a second gateway process from recovering active work in the same directory', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ayra-owner-'));
    const filename = path.join(directory, 'owner.sqlite');
    const first = acquireGatewayLock(filename);
    try {
      expect(() => acquireGatewayLock(filename)).toThrow('Another MrAI gateway');
    } finally {
      first.close();
    }
    const replacement = acquireGatewayLock(filename);
    replacement.close();
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('provider adapters and price math', () => {
  it('accounts separately for cache reads/writes and inclusive output tokens', () => {
    const deepseek = parseReceipt('deepseek', {
      choices: [{ message: { content: 'Draft' }, finish_reason: 'length' }],
      usage: {
        prompt_tokens: 100,
        prompt_cache_hit_tokens: 20,
        prompt_cache_miss_tokens: 80,
        completion_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 10 },
      },
    });
    expect(deepseek.usage).toEqual({ input: 80, cacheRead: 20, cacheWrite: 0, output: 30 });
    expect(deepseek.truncated).toBe(true);
    const anthropic = parseReceipt('anthropic', {
      content: [{ type: 'text', text: 'Draft' }],
      usage: {
        input_tokens: 80,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
        output_tokens: 30,
      },
    });
    expect(anthropic.usage.cacheWrite).toBe(10);
    expect(meteredCost(anthropic.usage, economy.prices)).toBe(152);
    expect(debitPreview(141, 10_000)).toBe(282);
    expect(() =>
      parseReceipt('deepseek', { usage: { prompt_tokens: 10, completion_tokens: -1 } }),
    ).toThrow();
    expect(() => parseReceipt('anthropic', {})).toThrow();
  });
  it('uses fixed official endpoints, disables thinking, bounds output, and never adds tools', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: economy.id,
            choices: [{ message: { content: '# Draft' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
          { status: 200 },
        ),
    );
    await makeProviderCaller({ deepseek: 'fixture-key' }, fetcher)(
      economy,
      input(),
      new AbortController().signal,
    );
    const [url, options] = fetcher.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(options.redirect).toBe('error');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.max_tokens).toBe(128);
    expect(body.tools).toBeUndefined();
    expect(body.messages[0].content).toContain('no web search');
  });
  it('requires explicit prices and routes by mode without model-name hardcoding', () => {
    expect(validateModels([economy, advanced])).toHaveLength(2);
    expect(() => validateModels([{ ...economy, prices: {} }])).toThrow();
    expect(
      routeRequest(input({ prompt: 'A complex architecture' }), [economy, advanced]).provider,
    ).toBe('anthropic');
    expect(
      routeRequest(input({ prompt: 'A complex architecture', mode: 'economy' }), [
        economy,
        advanced,
      ]).provider,
    ).toBe('deepseek');
    expect(() => configFromEnv({})).toThrow();
    const config = configFromEnv({ AYRA_CLIENT_TOKEN_SHA256: hash });
    expect(config.liveEnabled).toBe(false);
    expect(config.models).toEqual([]);
  });
});

describe('native gateway transport', () => {
  it('rejects insecure remote URLs and arbitrary request payloads', () => {
    expect(() =>
      gatewayConnection({ AYRA_GATEWAY_URL: 'http://evil.example', AYRA_GATEWAY_TOKEN: TOKEN }),
    ).toThrow();
    expect(() =>
      gatewayConnection({
        AYRA_GATEWAY_URL: 'https://example.com/?token=secret',
        AYRA_GATEWAY_TOKEN: TOKEN,
      }),
    ).toThrow();
    expect(() => validateDraft(input({ id: '../../etc/passwd' }))).toThrow();
    expect(() => validateDraft(input({ notes: 'a'.repeat(12_001) }))).toThrow();
  });
  it('keeps bearer credentials in the native process and allows only explicit transport operations', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ connected: true, liveEnabled: false, models: [] })),
    );
    const client = createGatewayClient(
      { AYRA_GATEWAY_URL: 'http://127.0.0.1:4318', AYRA_GATEWAY_TOKEN: TOKEN },
      fetcher,
    );
    const status = await client.status();
    expect(JSON.stringify(status)).not.toContain(TOKEN);
    expect(fetcher.mock.calls[0][1].headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(() => client.get('bad/path')).toThrow();
    expect((await createGatewayClient({}).status()).connected).toBe(false);
  });
});
