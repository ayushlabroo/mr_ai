import { GatewayError } from './errors.mjs';

export function validateModels(raw) {
  if (!Array.isArray(raw) || raw.length > 8)
    throw new Error('AYRA_MODELS_JSON must contain at most eight models.');
  const ids = new Set();
  return raw.map((model) => {
    if (
      !model ||
      typeof model.id !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(model.id) ||
      ids.has(model.id)
    )
      throw new Error('Each model needs a unique safe ID.');
    ids.add(model.id);
    if (
      !['deepseek', 'anthropic'].includes(model.provider) ||
      !['economy', 'advanced'].includes(model.tier)
    )
      throw new Error('Unsupported model provider or tier.');
    if (
      !Number.isSafeInteger(model.contextTokens) ||
      model.contextTokens < 8192 ||
      model.contextTokens > 2_000_000
    )
      throw new Error('Invalid model context ceiling.');
    if (
      !Number.isSafeInteger(model.maxOutputTokens) ||
      model.maxOutputTokens < 64 ||
      model.maxOutputTokens > 4096
    )
      throw new Error('Invalid output ceiling.');
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      if (
        !Number.isSafeInteger(model.prices?.[key]) ||
        model.prices[key] <= 0 ||
        model.prices[key] > 1_000_000_000
      )
        throw new Error('Every rate must be a positive integer USD-micro rate per million tokens.');
    }
    return {
      id: model.id,
      provider: model.provider,
      tier: model.tier,
      contextTokens: model.contextTokens,
      maxOutputTokens: model.maxOutputTokens,
      prices: { ...model.prices },
    };
  });
}

export function configFromEnv(env) {
  const tokenHash = env.AYRA_CLIENT_TOKEN_SHA256 ?? '';
  if (!/^[a-f0-9]{64}$/.test(tokenHash))
    throw new Error('Set AYRA_CLIENT_TOKEN_SHA256 to a SHA-256 digest of a random client token.');
  const limitUsdMicros = Number(env.AYRA_MONTHLY_BUDGET_USD_MICROS ?? 5_000_000);
  const markupBps = Number(env.AYRA_MARKUP_BPS ?? 10_000);
  if (!Number.isSafeInteger(limitUsdMicros) || limitUsdMicros < 1 || limitUsdMicros > 1_000_000_000)
    throw new Error('Invalid monthly budget.');
  if (!Number.isSafeInteger(markupBps) || markupBps < 0 || markupBps > 100_000)
    throw new Error('Invalid markup.');
  let rawModels;
  try {
    rawModels = JSON.parse(env.AYRA_MODELS_JSON ?? '[]');
  } catch {
    throw new Error('AYRA_MODELS_JSON must be valid JSON.');
  }
  return {
    tokenHash,
    limitUsdMicros,
    markupBps,
    liveEnabled: env.AYRA_LIVE_ENABLED === 'true',
    models: validateModels(rawModels),
    keys: { deepseek: env.DEEPSEEK_API_KEY, anthropic: env.ANTHROPIC_API_KEY },
  };
}

export function validateRunRequest(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(input.id)
  )
    throw new GatewayError('INVALID_REQUEST', 'A valid request ID is required.');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 4000)
    throw new GatewayError('INVALID_REQUEST', 'A request must contain 1–4,000 characters.');
  if (
    typeof input.notes !== 'string' ||
    input.notes.length > 12_000 ||
    !['auto', 'economy', 'thorough'].includes(input.mode)
  )
    throw new GatewayError('INVALID_REQUEST', 'Notes or routing mode are invalid.');
  return { id: input.id, prompt: input.prompt.trim(), notes: input.notes, mode: input.mode };
}

export function routeRequest(request, models) {
  const advanced =
    request.mode === 'thorough' ||
    (request.mode === 'auto' &&
      /\b(complex|architecture|strategy|strategic|multi-step)\b/i.test(request.prompt));
  const tier = advanced ? 'advanced' : 'economy';
  const model = models.find((candidate) => candidate.tier === tier);
  if (!model) throw new GatewayError('MODEL_UNAVAILABLE', `No ${tier} model is configured.`, 503);
  return model;
}
