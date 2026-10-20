// Money is stored as integer USD millionths. Rates are USD millionths per
// million tokens. BigInt prevents intermediate floating-point rounding errors.
export function tokenCost(tokens, rate) {
  if (!Number.isSafeInteger(tokens) || tokens < 0 || !Number.isSafeInteger(rate) || rate < 0)
    throw new Error('Invalid usage or price.');
  const cost = Number((BigInt(tokens) * BigInt(rate) + 999_999n) / 1_000_000n);
  if (!Number.isSafeInteger(cost)) throw new Error('Cost exceeds supported range.');
  return cost;
}
export function meteredCost(usage, prices) {
  return (
    tokenCost(usage.input, prices.input) +
    tokenCost(usage.output, prices.output) +
    tokenCost(usage.cacheRead, prices.cacheRead) +
    tokenCost(usage.cacheWrite, prices.cacheWrite)
  );
}
export function reservationFor(model) {
  // Reserve the configured model's full input context, not a guessed tokenizer
  // count, plus its permitted output. Operators must set verified context/rates.
  return (
    tokenCost(
      model.contextTokens,
      Math.max(model.prices.input, model.prices.cacheRead, model.prices.cacheWrite),
    ) + tokenCost(model.maxOutputTokens, model.prices.output)
  );
}
export function debitPreview(cost, markupBps) {
  return Number((BigInt(cost) * BigInt(10_000 + markupBps) + 9_999n) / 10_000n);
}
