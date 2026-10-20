export type DraftState =
  | 'submitting'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'uncertain'
  | 'unknown'
  | 'not-found';
export type DraftRecord = {
  id: string;
  status: DraftState;
  provider?: string;
  model?: string;
  reservedUsdMicros?: number;
  heldUsdMicros?: number;
  costUsdMicros?: number | null;
  debitPreviewUsdMicros?: number | null;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number } | null;
  markdown?: string | null;
  error?: string | null;
};
export type GatewayStatus = {
  connected: boolean;
  liveEnabled: boolean;
  message?: string;
  models: { id: string; provider: string; tier: string; reservationUsdMicros: number }[];
  budget?: {
    month: string;
    costUsdMicros: number;
    heldUsdMicros: number;
    limitUsdMicros: number;
    blocked: boolean;
  };
};
export type DraftRequest = {
  id: string;
  prompt: string;
  notes: string;
  mode: 'auto' | 'economy' | 'thorough';
};
export type GatewayReply = DraftRecord | { error: string; message: string };

export const pendingDraft = (draft?: DraftRecord) =>
  !!draft && ['submitting', 'queued', 'running', 'unknown'].includes(draft.status);
export const usd = (micros: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);

export function restoreDraft(raw: unknown): DraftRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const draft = raw as DraftRecord;
  if (
    typeof draft.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{16,80}$/.test(draft.id) ||
    ![
      'submitting',
      'queued',
      'running',
      'succeeded',
      'failed',
      'cancelled',
      'uncertain',
      'unknown',
      'not-found',
    ].includes(draft.status)
  )
    return undefined;
  if (
    draft.markdown != null &&
    (typeof draft.markdown !== 'string' || draft.markdown.length > 101_000)
  )
    return undefined;
  if (draft.status === 'succeeded' && !draft.markdown?.trim()) return undefined;
  for (const value of [
    draft.reservedUsdMicros,
    draft.heldUsdMicros,
    draft.costUsdMicros,
    draft.debitPreviewUsdMicros,
  ])
    if (value != null && (!Number.isSafeInteger(value) || value < 0)) return undefined;
  if (
    (draft.provider != null &&
      (typeof draft.provider !== 'string' || draft.provider.length > 40)) ||
    (draft.model != null && (typeof draft.model !== 'string' || draft.model.length > 100)) ||
    (draft.error != null && (typeof draft.error !== 'string' || draft.error.length > 500))
  )
    return undefined;
  if (
    draft.usage != null &&
    ['input', 'output', 'cacheRead', 'cacheWrite'].some(
      (key) =>
        !Number.isSafeInteger(draft.usage![key as keyof NonNullable<DraftRecord['usage']>]) ||
        draft.usage![key as keyof NonNullable<DraftRecord['usage']>] < 0,
    )
  )
    return undefined;
  return {
    id: draft.id,
    status: draft.status,
    provider: draft.provider,
    model: draft.model,
    reservedUsdMicros: draft.reservedUsdMicros,
    heldUsdMicros: draft.heldUsdMicros,
    costUsdMicros: draft.costUsdMicros,
    debitPreviewUsdMicros: draft.debitPreviewUsdMicros,
    usage: draft.usage,
    markdown: draft.markdown,
    error: draft.error,
  };
}
