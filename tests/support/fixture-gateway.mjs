import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { configFromEnv } from '../../gateway/config.mjs';
import { Ledger, acquireGatewayLock } from '../../gateway/ledger.mjs';
import { createGateway } from '../../gateway/service.mjs';
import { makeProviderCaller } from '../../gateway/providers.mjs';
import { createGatewayHttpServer } from '../../gateway/http.mjs';

export const FIXTURE_MARKDOWN = '# Runtime fixture draft\n\nThe prototype is ready for review.';

// Uses no process environment or .env files. The sole provider fetch function
// below returns synthetic receipts and never delegates to global fetch.
export async function startFixtureGateway() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mrai-runtime-'));
  await chmod(directory, 0o700);
  const token = randomBytes(32).toString('base64url');
  const models = [
    { id: 'runtime-economy', provider: 'deepseek', tier: 'economy' },
    { id: 'runtime-advanced', provider: 'anthropic', tier: 'advanced' },
  ].map((model) => ({
    ...model,
    contextTokens: 8192,
    maxOutputTokens: 128,
    prices: { input: 1_000_000, output: 2_000_000, cacheRead: 100_000, cacheWrite: 2_000_000 },
  }));
  const config = configFromEnv({
    AYRA_CLIENT_TOKEN_SHA256: createHash('sha256').update(token).digest('hex'),
    AYRA_LIVE_ENABLED: 'true',
    AYRA_MONTHLY_BUDGET_USD_MICROS: '1000000',
    AYRA_MARKUP_BPS: '10000',
    AYRA_MODELS_JSON: JSON.stringify(models),
    DEEPSEEK_API_KEY: 'synthetic-runtime-deepseek',
    ANTHROPIC_API_KEY: 'synthetic-runtime-anthropic',
  });
  let ownership, ledger, gateway, server;
  let dispatches = 0;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    gateway?.shutdown();
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(() => resolve()));
      }
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      try {
        ledger?.close();
      } finally {
        try {
          ownership?.close();
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      }
    }
  }
  try {
    ownership = acquireGatewayLock(path.join(directory, 'owner.sqlite'));
    const filename = path.join(directory, 'ledger.sqlite');
    ledger = new Ledger(filename);
    await chmod(filename, 0o600);
    const providerFetch = async (endpoint, options) => {
      const body = JSON.parse(options.body);
      const model = models.find((candidate) => candidate.id === body.model);
      assert.ok(model, 'Only synthetic runtime models may be used.');
      assert.equal(
        endpoint,
        model.provider === 'deepseek'
          ? 'https://api.deepseek.com/chat/completions'
          : 'https://api.anthropic.com/v1/messages',
      );
      assert.equal(options.redirect, 'error');
      dispatches += 1;
      return Response.json(
        model.provider === 'deepseek'
          ? {
              model: model.id,
              choices: [{ message: { content: FIXTURE_MARKDOWN }, finish_reason: 'stop' }],
              usage: { prompt_tokens: 100, prompt_cache_hit_tokens: 20, completion_tokens: 30 },
            }
          : {
              model: model.id,
              content: [{ type: 'text', text: FIXTURE_MARKDOWN }],
              usage: {
                input_tokens: 80,
                cache_read_input_tokens: 20,
                cache_creation_input_tokens: 10,
                output_tokens: 30,
              },
              stop_reason: 'end_turn',
            },
      );
    };
    gateway = createGateway({
      config,
      ledger,
      callProvider: makeProviderCaller(config.keys, providerFetch),
    });
    server = createGatewayHttpServer({ gateway, port: 0 });
    const listening = once(server, 'listening');
    server.listen(0, '127.0.0.1');
    await listening;
    return {
      origin: `http://127.0.0.1:${server.address().port}`,
      token,
      dispatchCount: () => dispatches,
      run: (id) => ledger.get('founder', id),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
