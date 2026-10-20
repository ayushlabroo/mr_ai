const ID = /^[a-zA-Z0-9_-]{16,80}$/;

export function gatewayConnection(env) {
  if (!env.AYRA_GATEWAY_URL || !env.AYRA_GATEWAY_TOKEN) return null;
  const url = new URL(env.AYRA_GATEWAY_URL);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  )
    throw new Error('Invalid gateway address.');
  if (!/^[a-zA-Z0-9_-]{32,200}$/.test(env.AYRA_GATEWAY_TOKEN))
    throw new Error('Invalid gateway token.');
  return { origin: url.origin, token: env.AYRA_GATEWAY_TOKEN };
}

export function validateDraft(input) {
  if (
    !input ||
    typeof input.id !== 'string' ||
    !ID.test(input.id) ||
    typeof input.prompt !== 'string' ||
    !input.prompt.trim() ||
    input.prompt.length > 4000 ||
    typeof input.notes !== 'string' ||
    input.notes.length > 12_000 ||
    !['auto', 'economy', 'thorough'].includes(input.mode)
  )
    throw new Error('Invalid draft request.');
  return { id: input.id, prompt: input.prompt, notes: input.notes, mode: input.mode };
}

export function createGatewayClient(env, fetcher = fetch) {
  let connection;
  try {
    connection = gatewayConnection(env);
  } catch {
    connection = null;
  }
  async function request(path, method = 'GET', body) {
    if (!connection)
      throw new Error('Configure the gateway in the desktop process environment first.');
    try {
      const response = await fetcher(`${connection.origin}${path}`, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          authorization: `Bearer ${connection.token}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing response');
      const chunks = [];
      let bytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 250_000) {
          await reader.cancel();
          throw new Error('Oversized response');
        }
        chunks.push(Buffer.from(value));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const data = JSON.parse(text);
      if (!response.ok) {
        const messages = {
          BUDGET_LIMIT: 'The remaining API budget cannot cover this model reservation.',
          MODEL_UNAVAILABLE: 'The requested model tier is not configured.',
          LIVE_DISABLED: 'Live calls are disabled on the gateway.',
          ID_CONFLICT: 'This draft ID already exists. Refresh its status before trying again.',
          CONCURRENCY_LIMIT: 'Two drafts are already in progress.',
          BUDGET_REVIEW: 'The gateway requires a usage review before another call.',
          NOT_FOUND: 'This draft was not found. No new request was sent.',
        };
        return {
          error: typeof data.error === 'string' ? data.error : 'GATEWAY_ERROR',
          message:
            messages[data.error] ?? 'The gateway rejected this request. Check its configuration.',
        };
      }
      if (path === '/v1/status') {
        if (
          !data ||
          data.connected !== true ||
          typeof data.liveEnabled !== 'boolean' ||
          !Array.isArray(data.models) ||
          data.models.length > 8
        )
          throw new Error('Invalid status');
        const models = data.models.map((model) => {
          if (
            !model ||
            typeof model.id !== 'string' ||
            model.id.length > 100 ||
            !['deepseek', 'anthropic'].includes(model.provider) ||
            !['economy', 'advanced'].includes(model.tier) ||
            !Number.isSafeInteger(model.reservationUsdMicros) ||
            model.reservationUsdMicros < 0
          )
            throw new Error('Invalid model');
          return {
            id: model.id,
            provider: model.provider,
            tier: model.tier,
            reservationUsdMicros: model.reservationUsdMicros,
          };
        });
        let budget;
        if (data.budget) {
          const b = data.budget;
          if (
            typeof b.month !== 'string' ||
            !/^\d{4}-\d{2}$/.test(b.month) ||
            typeof b.blocked !== 'boolean' ||
            ['costUsdMicros', 'heldUsdMicros', 'limitUsdMicros'].some(
              (key) => !Number.isSafeInteger(b[key]) || b[key] < 0,
            )
          )
            throw new Error('Invalid budget');
          budget = {
            month: b.month,
            blocked: b.blocked,
            costUsdMicros: b.costUsdMicros,
            heldUsdMicros: b.heldUsdMicros,
            limitUsdMicros: b.limitUsdMicros,
          };
        }
        return {
          connected: true,
          liveEnabled: data.liveEnabled,
          models,
          ...(budget ? { budget } : {}),
        };
      }
      // Never forward arbitrary server fields (including future credentials).
      return {
        id: data.id,
        status: data.status,
        provider: data.provider,
        model: data.model,
        reservedUsdMicros: data.reservedUsdMicros,
        heldUsdMicros: data.heldUsdMicros,
        costUsdMicros: data.costUsdMicros,
        debitPreviewUsdMicros: data.debitPreviewUsdMicros,
        usage: data.usage
          ? {
              input: data.usage.input,
              output: data.usage.output,
              cacheRead: data.usage.cacheRead,
              cacheWrite: data.usage.cacheWrite,
            }
          : null,
        markdown: data.markdown,
        error: data.error,
      };
    } catch {
      return {
        error: 'CONNECTION_UNCERTAIN',
        message:
          'The gateway connection ended. Refresh this draft ID before sending anything again.',
      };
    }
  }
  return {
    async status() {
      if (!connection)
        return {
          connected: false,
          liveEnabled: false,
          models: [],
          message: 'No gateway configured. Demo tasks work without one.',
        };
      const data = await request('/v1/status');
      if (data.error)
        return {
          connected: false,
          liveEnabled: false,
          models: [],
          message: 'Gateway unavailable. Check the desktop connection configuration.',
        };
      return data;
    },
    start(input) {
      const payload = validateDraft(input);
      return request('/v1/runs', 'POST', payload);
    },
    get(id) {
      if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid draft ID.');
      return request(`/v1/runs/${id}`);
    },
    cancel(id) {
      if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid draft ID.');
      return request(`/v1/runs/${id}/cancel`, 'POST');
    },
  };
}
