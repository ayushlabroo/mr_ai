import { useState } from 'react';
import { Check, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Square } from 'lucide-react';
import { Modal } from './Modal';
import { pendingDraft, usd } from '../lib/gateway-types';
import type { Task } from '../lib/tasks';
import { previewRoute } from '../lib/tasks';
import type { GatewayControls } from '../lib/useGateway';

export function GatewaySettings({ gateway }: { gateway: GatewayControls }) {
  const { status } = gateway;
  return (
    <div className="gateway-settings">
      <div className="setting-row">
        <div>
          <strong>AI gateway</strong>
          <span>{status.connected ? 'Single-user development connection' : status.message}</span>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh gateway connection"
          onClick={() => void gateway.refresh()}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <div className="gateway-model-list">
        {status.models.length ? (
          status.models.map((model) => (
            <div key={model.id}>
              <span>
                {model.provider}
                <strong>{model.id}</strong>
              </span>
              <span className="neutral-pill">{model.tier}</span>
            </div>
          ))
        ) : (
          <p>No live models configured. Local demos remain available.</p>
        )}
      </div>
      <div className="setting-row">
        <div>
          <strong>Live calls</strong>
          <span>Enabled only by the gateway operator.</span>
        </div>
        <span className="neutral-pill">
          {status.connected && status.liveEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      {status.budget && (
        <>
          <div className="setting-row">
            <div>
              <strong>Metered provider cost</strong>
              <span>Reported usage × configured USD rates.</span>
            </div>
            <strong className="tnum">{usd(status.budget.costUsdMicros)}</strong>
          </div>
          <div className="setting-row">
            <div>
              <strong>Reserved budget</strong>
              <span>Includes uncertain calls awaiting review.</span>
            </div>
            <strong className="tnum">{usd(status.budget.heldUsdMicros)}</strong>
          </div>
          <div className="setting-row">
            <div>
              <strong>Monthly API budget</strong>
              <span>{status.budget.month} · UTC</span>
            </div>
            <strong className="tnum">{usd(status.budget.limitUsdMicros)}</strong>
          </div>
          {status.budget.blocked && (
            <p className="draft-warning">
              Model usage needs operator review. More calls are blocked.
            </p>
          )}
        </>
      )}
      <p className="gateway-footnote">Jev is not connected. Hosted AI is not enabled.</p>
    </div>
  );
}

export function DraftPanel({ task, gateway }: { task: Task; gateway: GatewayControls }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const { status } = gateway;
  const tier = previewRoute(task.prompt, task.mode).tier.toLowerCase();
  const model = status.models.find((candidate) => candidate.tier === tier);
  const budgetFits =
    !status.budget ||
    (!!model &&
      status.budget.limitUsdMicros - status.budget.costUsdMicros - status.budget.heldUsdMicros >=
        model.reservationUsdMicros);
  const ready =
    status.connected && status.liveEnabled && !!model && !status.budget?.blocked && budgetFits;
  const run = task.draft;
  const pending = pendingDraft(run);
  const labels = {
    submitting: 'Submitting your draft',
    queued: 'Draft queued',
    running: 'Drafting with AI',
    succeeded: 'Your AI draft is ready',
    failed: 'The draft could not be completed',
    cancelled: 'Draft cancelled',
    uncertain: 'Cost needs review',
    unknown: 'Connection interrupted',
    'not-found': 'No draft found for this ID',
  };
  return (
    <div className="context-card connected-draft glass-strong">
      <span className="context-heading">
        <Sparkles size={16} />
        Draft with AI
      </span>
      {run ? (
        <>
          <div className="draft-run-title">
            {pending && run.status !== 'unknown' ? (
              <LoaderCircle size={15} className="spin" />
            ) : run.status === 'succeeded' ? (
              <Check size={15} />
            ) : (
              <ShieldCheck size={15} />
            )}
            <strong>{labels[run.status]}</strong>
          </div>
          {run.model && (
            <p className="draft-model">
              {run.provider} / {run.model}
            </p>
          )}
          {run.error && (
            <p className="draft-warning" role="status">
              {run.error}
            </p>
          )}
          {run.costUsdMicros != null && (
            <div className="context-row">
              <span>Metered API cost</span>
              <strong>{usd(run.costUsdMicros)}</strong>
            </div>
          )}
          {run.heldUsdMicros != null && run.heldUsdMicros > 0 && (
            <div className="context-row">
              <span>Budget held</span>
              <strong>{usd(run.heldUsdMicros)}</strong>
            </div>
          )}
          <div className="draft-actions">
            <button className="text-button" onClick={() => void gateway.check(task)}>
              <RefreshCw size={12} />
              Refresh status
            </button>
            {pending && (
              <button className="text-button" onClick={() => void gateway.cancel(task)}>
                <Square size={11} />
                Cancel
              </button>
            )}
          </div>
          <p className="draft-small">
            Request {run.id.slice(0, 8)} · existing IDs are checked, never automatically replayed.
          </p>
        </>
      ) : (
        <>
          <p>Turn your request and pasted notes into a model-written document.</p>
          {ready ? (
            <p className="draft-model">
              {model.provider} / {model.id}
            </p>
          ) : (
            <p className="draft-small">
              {!status.connected
                ? 'Connect a gateway in the desktop app to enable AI drafts.'
                : !status.liveEnabled
                  ? 'Live calls are disabled on your gateway.'
                  : 'This model tier is unavailable or its budget needs review.'}
            </p>
          )}
          <button
            className="button-primary"
            disabled={!ready || task.status === 'running' || sending}
            onClick={() => setOpen(true)}
          >
            <Sparkles size={14} />
            Review AI draft
          </button>
          {!ready && (
            <button className="text-button draft-refresh" onClick={() => void gateway.refresh()}>
              <RefreshCw size={12} />
              Check connection
            </button>
          )}
          <p className="draft-small">
            Drafting only. Web research and folder access are not connected.
          </p>
        </>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!sending) setOpen(value);
        }}
        title="A draft from your ideas"
        description="Your request and the notes below will be sent through your gateway to the selected model."
      >
        <div className="draft-consent-model">
          <Sparkles size={18} />
          <div>
            <strong>
              {model?.provider} / {model?.id}
            </strong>
            <p>
              {model
                ? `${usd(model.reservationUsdMicros)} reserved before the call; unused budget is released when usage is known.`
                : 'No model available.'}
            </p>
          </div>
        </div>
        <label className="draft-notes-label" htmlFor="draft-notes">
          Source notes <span>optional</span>
        </label>
        <textarea
          id="draft-notes"
          className="draft-notes"
          rows={6}
          maxLength={12_000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Paste the source material you want the draft to use…"
        />
        <p className="draft-small">
          {notes.length.toLocaleString()} / 12,000 characters. Notes are sent to the model; their
          content may appear in your saved draft.
        </p>
        <div className="demo-disclosure">
          <ShieldCheck size={18} />
          <p>
            This sends your task request and pasted notes. No folder contents are read or sent. The
            result is an AI draft requiring review, with no live web research.
          </p>
        </div>
        <div className="confirmation-actions">
          <button className="button-secondary" disabled={sending} onClick={() => setOpen(false)}>
            Go back
          </button>
          <button
            className="button-primary"
            disabled={!ready || sending}
            onClick={async () => {
              if (sending) return;
              setSending(true);
              try {
                await gateway.start(task, notes);
                setOpen(false);
                setNotes('');
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}Send to
            model
          </button>
        </div>
      </Modal>
    </div>
  );
}
