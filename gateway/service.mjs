import { createHash, timingSafeEqual } from 'node:crypto';
import { GatewayError, ProviderError } from './errors.mjs';
import { validateRunRequest, routeRequest } from './config.mjs';
import { debitPreview, meteredCost, reservationFor } from './pricing.mjs';

const OWNER = 'founder';
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
function publicRun(row) {
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    reservedUsdMicros: row.reserved,
    heldUsdMicros: row.held,
    costUsdMicros: row.cost,
    debitPreviewUsdMicros: row.debit_preview,
    usage: row.usage_json ? JSON.parse(row.usage_json) : null,
    markdown: row.markdown,
    error: row.error,
  };
}

export function createGateway({ config, ledger, callProvider }) {
  const active = new Map();
  ledger.recover();
  const models = config.models.filter((model) => Boolean(config.keys[model.provider]));
  function authenticate(request) {
    if (request.headers.has('origin'))
      throw new GatewayError(
        'ORIGIN_DENIED',
        'Browser requests are not accepted by this native gateway.',
        403,
      );
    const token = request.headers
      .get('authorization')
      ?.match(/^Bearer ([a-zA-Z0-9_-]{32,200})$/)?.[1];
    const actual = createHash('sha256')
      .update(token ?? '')
      .digest();
    const expected = Buffer.from(config.tokenHash, 'hex');
    if (!token || expected.length !== actual.length || !timingSafeEqual(actual, expected))
      throw new GatewayError('UNAUTHORIZED', 'Gateway authentication is required.', 401);
  }
  async function execute(request, model) {
    const controller = new AbortController();
    active.set(request.id, controller);
    try {
      if (!ledger.dispatched(OWNER, request.id)) return;
      const receipt = await callProvider(model, request, controller.signal);
      const cost = meteredCost(receipt.usage, model.prices);
      const row = ledger.get(OWNER, request.id);
      const invalidUsage =
        receipt.usage.input + receipt.usage.cacheRead + receipt.usage.cacheWrite >
          model.contextTokens ||
        receipt.usage.output > model.maxOutputTokens ||
        cost > row.reserved;
      const cancelled = controller.signal.aborted;
      const failed =
        invalidUsage || cancelled || !receipt.markdown.trim() || receipt.markdown.length > 100_000;
      const error = invalidUsage
        ? 'Provider usage exceeded the configured reservation. Review model configuration.'
        : cancelled
          ? 'Cancelled; metered usage was received.'
          : failed
            ? 'The provider returned no usable document.'
            : null;
      // Keep an explicit disclosure outside the model's control.
      const markdown = `> MrAI AI draft · ${model.provider} / ${model.id}. Generated from your request and supplied notes. No web search or file inspection was performed.${receipt.truncated ? ' Output reached its token limit; review for incompleteness.' : ''}\n\n${receipt.markdown}`;
      ledger.settle(OWNER, request.id, {
        cost,
        debit: debitPreview(cost, row.markup_bps),
        usage: receipt.usage,
        markdown,
        failed,
        error,
        review: invalidUsage,
      });
    } catch (error) {
      if (error instanceof ProviderError && error.requiresReview)
        ledger.flagReview(OWNER, request.id);
      ledger.fail(
        OWNER,
        request.id,
        error instanceof ProviderError
          ? error.message
          : 'The request could not be reconciled. Cost needs review.',
        error instanceof ProviderError && error.definitelyRejected,
      );
    } finally {
      active.delete(request.id);
    }
  }
  return {
    async handle(request) {
      try {
        authenticate(request);
        const url = new URL(request.url);
        if (request.method === 'GET' && url.pathname === '/v1/status')
          return json({
            connected: true,
            liveEnabled: config.liveEnabled,
            scope: 'single-user-development',
            jev: 'not-connected',
            models: models.map((model) => ({
              id: model.id,
              provider: model.provider,
              tier: model.tier,
              reservationUsdMicros: reservationFor(model),
            })),
            budget: { ...ledger.summary(OWNER), limitUsdMicros: config.limitUsdMicros },
            pricing: 'Configured rates; provider invoices are not yet reconciled.',
          });
        if (request.method === 'POST' && url.pathname === '/v1/runs') {
          if (!request.headers.get('content-type')?.startsWith('application/json'))
            throw new GatewayError('INVALID_REQUEST', 'JSON is required.', 415);
          const body = await request.text();
          if (Buffer.byteLength(body) > 64_000)
            throw new GatewayError('INVALID_REQUEST', 'Request is too large.', 413);
          let input;
          try {
            input = JSON.parse(body);
          } catch {
            throw new GatewayError('INVALID_REQUEST', 'Invalid JSON.');
          }
          const run = validateRunRequest(input);
          const fingerprint = createHash('sha256')
            .update(JSON.stringify({ prompt: run.prompt, notes: run.notes, mode: run.mode }))
            .digest('hex');
          const previous = ledger.get(OWNER, run.id);
          if (previous) {
            if (previous.fingerprint !== fingerprint)
              throw new GatewayError(
                'ID_CONFLICT',
                'This request ID already belongs to different content.',
                409,
              );
            return json(publicRun(previous));
          }
          if (!config.liveEnabled)
            throw new GatewayError(
              'LIVE_DISABLED',
              'Live model calls are disabled on this gateway.',
              503,
            );
          const model = routeRequest(run, models);
          const result = ledger.reserve({
            owner: OWNER,
            id: run.id,
            fingerprint,
            model,
            amount: reservationFor(model),
            limit: config.limitUsdMicros,
            markupBps: config.markupBps,
          });
          if (result.fresh) queueMicrotask(() => void execute(run, model));
          return json(publicRun(result.row), result.fresh ? 202 : 200);
        }
        const match = url.pathname.match(/^\/v1\/runs\/([a-zA-Z0-9_-]{16,80})(\/cancel)?$/);
        if (match) {
          const row = ledger.get(OWNER, match[1]);
          if (!row) throw new GatewayError('NOT_FOUND', 'No draft exists for this request.', 404);
          if (request.method === 'GET' && !match[2]) return json(publicRun(row));
          if (request.method === 'POST' && match[2]) {
            ledger.cancel(OWNER, match[1]);
            active.get(match[1])?.abort();
            return json(publicRun(ledger.get(OWNER, match[1])));
          }
        }
        throw new GatewayError('NOT_FOUND', 'No such gateway endpoint.', 404);
      } catch (error) {
        return json(
          {
            error: error instanceof GatewayError ? error.code : 'INTERNAL_ERROR',
            message:
              error instanceof GatewayError
                ? error.message
                : 'The gateway could not process this request.',
          },
          error instanceof GatewayError ? error.status : 500,
        );
      }
    },
    shutdown() {
      for (const controller of active.values()) controller.abort();
    },
  };
}
