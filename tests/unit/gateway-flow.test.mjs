import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGatewayClient } from '../../desktop/gateway.mjs';
import { configFromEnv } from '../../gateway/config.mjs';
import { Ledger } from '../../gateway/ledger.mjs';
import { makeProviderCaller } from '../../gateway/providers.mjs';
import { reservationFor } from '../../gateway/pricing.mjs';
import { createGateway } from '../../gateway/service.mjs';

// Both network boundaries are injected. The desktop gateway-client module,
// handlers, provider adapters, and disk SQLite run together without opening a port
// or making paid calls. This does not exercise native IPC or an HTTP listener.
const TOKEN = 'offline_integration_token_with_32_characters';
const keys = { deepseek: 'offline-deepseek-key', anthropic: 'offline-anthropic-key' };
const economy = {
  id: 'offline-economy',
  provider: 'deepseek',
  tier: 'economy',
  contextTokens: 8192,
  maxOutputTokens: 128,
  prices: { input: 1_000_000, output: 2_000_000, cacheRead: 100_000, cacheWrite: 2_000_000 },
};
const advanced = { ...economy, id: 'offline-advanced', provider: 'anthropic', tier: 'advanced' };
const fixtures = [];

function fixture(providerFetch) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mrai-gateway-flow-'));
  const filename = path.join(directory, 'ledger.sqlite');
  const config = configFromEnv({
    AYRA_CLIENT_TOKEN_SHA256: createHash('sha256').update(TOKEN).digest('hex'),
    AYRA_LIVE_ENABLED: 'true',
    AYRA_MODELS_JSON: JSON.stringify([economy, advanced]),
    AYRA_MONTHLY_BUDGET_USD_MICROS: '1000000',
    AYRA_MARKUP_BPS: '10000',
    DEEPSEEK_API_KEY: keys.deepseek,
    ANTHROPIC_API_KEY: keys.anthropic,
  });
  const state = { directory, ledger: new Ledger(filename), gateway: null };
  const openGateway = () => {
    state.gateway = createGateway({
      config,
      ledger: state.ledger,
      callProvider: makeProviderCaller(config.keys, providerFetch),
    });
  };
  openGateway();
  fixtures.push(state);
  const client = createGatewayClient(
    { AYRA_GATEWAY_URL: 'http://127.0.0.1:4318', AYRA_GATEWAY_TOKEN: TOKEN },
    (url, options) => state.gateway.handle(new Request(url, options)),
  );
  return {
    client,
    restart() {
      state.gateway.shutdown();
      state.ledger.close();
      state.ledger = new Ledger(filename);
      openGateway();
    },
  };
}

const request = (mode = 'auto') => ({
  id: randomUUID(),
  prompt: 'Draft a weekly update',
  notes: 'The prototype is ready for review.',
  mode,
});

afterEach(async () => {
  for (const state of fixtures.splice(0)) {
    state.gateway.shutdown();
    await new Promise((resolve) => setImmediate(resolve));
    state.ledger.close();
    rmSync(state.directory, { recursive: true, force: true });
  }
});

describe('offline desktop-to-provider integration', () => {
  it.each([
    {
      mode: 'auto',
      model: economy,
      endpoint: 'https://api.deepseek.com/chat/completions',
      body: {
        model: economy.id,
        choices: [{ message: { content: '# Weekly update' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, prompt_cache_hit_tokens: 20, completion_tokens: 30 },
      },
      cost: 142,
    },
    {
      mode: 'thorough',
      model: advanced,
      endpoint: 'https://api.anthropic.com/v1/messages',
      body: {
        model: advanced.id,
        content: [{ type: 'text', text: '# Weekly update' }],
        usage: {
          input_tokens: 80,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 10,
          output_tokens: 30,
        },
        stop_reason: 'end_turn',
      },
      cost: 162,
    },
  ])('routes $mode, settles usage, and recovers the draft without replay', async (sample) => {
    const providerFetch = vi.fn(async () => Response.json(sample.body));
    const { client, restart } = fixture(providerFetch);
    expect(await client.status()).toMatchObject({ connected: true, liveEnabled: true });
    const input = request(sample.mode);
    const queued = await client.start(input);
    expect(queued).toMatchObject({ id: input.id, status: 'queued' });
    expect(queued.heldUsdMicros).toBe(reservationFor(sample.model));
    await vi.waitFor(async () => expect((await client.get(input.id)).status).toBe('succeeded'));
    const saved = await client.get(input.id);
    expect(saved).toMatchObject({
      model: sample.model.id,
      provider: sample.model.provider,
      costUsdMicros: sample.cost,
      debitPreviewUsdMicros: sample.cost * 2,
      heldUsdMicros: 0,
    });
    expect(saved.markdown).toContain('# Weekly update');
    expect(saved.markdown).toContain('No web search or file inspection was performed.');
    const [endpoint, options] = providerFetch.mock.calls[0];
    expect(endpoint).toBe(sample.endpoint);
    const payload = JSON.parse(options.body);
    expect(payload.model).toBe(sample.model.id);
    expect(payload.messages.at(-1).content).toContain(input.notes);
    expect(
      options.headers[sample.model.provider === 'deepseek' ? 'authorization' : 'x-api-key'],
    ).toBe(sample.model.provider === 'deepseek' ? `Bearer ${keys.deepseek}` : keys.anthropic);
    restart();
    expect(await client.get(input.id)).toEqual(saved);
    expect(await client.start(input)).toEqual(saved);
    expect((await client.start({ ...input, notes: 'Different notes' })).error).toBe('ID_CONFLICT');
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const status = await client.status();
    expect(status.budget).toMatchObject({ costUsdMicros: sample.cost, heldUsdMicros: 0 });
    for (const secret of [TOKEN, ...Object.values(keys)]) {
      expect(JSON.stringify({ saved, status })).not.toContain(secret);
      expect(JSON.stringify(payload)).not.toContain(secret);
    }
  });

  it.each([
    { code: 429, status: 'failed', held: 0 },
    { code: 503, status: 'uncertain', held: reservationFor(economy) },
  ])('retains the correct hold for provider HTTP $code across restart', async (sample) => {
    const providerFetch = vi.fn(
      async () => new Response('private provider error', { status: sample.code }),
    );
    const { client, restart } = fixture(providerFetch);
    const input = request();
    await client.start(input);
    await vi.waitFor(async () => expect((await client.get(input.id)).status).toBe(sample.status));
    restart();
    const saved = await client.start(input);
    expect(saved).toMatchObject({ status: sample.status, heldUsdMicros: sample.held });
    expect(JSON.stringify(saved)).not.toContain('private provider error');
    expect((await client.status()).budget.heldUsdMicros).toBe(sample.held);
    expect(providerFetch).toHaveBeenCalledTimes(1);
  });
});
