import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { createGatewayClient } from '../../desktop/gateway.mjs';
import { startFixtureGateway, FIXTURE_MARKDOWN } from '../support/fixture-gateway.mjs';

for (const sample of [
  { mode: 'auto', model: 'runtime-economy', cost: 142 },
  { mode: 'thorough', model: 'runtime-advanced', cost: 162 },
]) {
  test(
    `real loopback/native-client draft: ${sample.mode} (synthetic provider)`,
    { timeout: 10_000 },
    async () => {
      const fixture = await startFixtureGateway();
      try {
        // No injected desktop fetch: requests cross the real TCP/HTTP boundary.
        const client = createGatewayClient({
          AYRA_GATEWAY_URL: fixture.origin,
          AYRA_GATEWAY_TOKEN: fixture.token,
        });
        const status = await client.status();
        assert.equal(status.connected, true);
        assert.equal(status.liveEnabled, true); // Synthetic dispatch only.
        assert.equal(fixture.dispatchCount(), 0);
        const denied = await fetch(`${fixture.origin}/v1/status`, {
          signal: AbortSignal.timeout(2000),
        });
        assert.equal(denied.status, 401);
        await denied.body.cancel();
        const input = {
          id: randomUUID(),
          prompt: 'Draft a weekly update',
          notes: 'Prototype ready.',
          mode: sample.mode,
        };
        await client.start(input);
        let saved;
        const deadline = Date.now() + 2000;
        do {
          saved = await client.get(input.id);
          if (saved.status === 'succeeded') break;
          await setTimeout(20);
        } while (Date.now() < deadline);
        assert.equal(saved.status, 'succeeded');
        assert.equal(saved.model, sample.model);
        assert.equal(saved.costUsdMicros, sample.cost);
        assert.equal(saved.debitPreviewUsdMicros, sample.cost * 2);
        assert.equal(saved.heldUsdMicros, 0);
        assert.ok(saved.markdown.includes(FIXTURE_MARKDOWN));
        assert.equal(fixture.run(input.id).markdown, saved.markdown);
        assert.deepEqual(await client.start(input), saved);
        assert.equal((await client.start({ ...input, notes: 'Changed' })).error, 'ID_CONFLICT');
        assert.equal(fixture.dispatchCount(), 1);
        const reconnected = createGatewayClient({
          AYRA_GATEWAY_URL: fixture.origin,
          AYRA_GATEWAY_TOKEN: fixture.token,
        });
        assert.deepEqual(await reconnected.get(input.id), saved);
        assert.equal(fixture.dispatchCount(), 1);
        const receiptText = JSON.stringify({ status, saved });
        assert.ok(!receiptText.includes(fixture.token));
        assert.ok(!receiptText.includes('synthetic-runtime-deepseek'));
        assert.ok(!receiptText.includes('synthetic-runtime-anthropic'));
      } finally {
        await fixture.close();
      }
    },
  );
}
