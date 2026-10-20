import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { pendingDraft, restoreDraft } from './gateway-types';
import type { DraftRecord, GatewayReply, GatewayStatus } from './gateway-types';
import type { Task } from './tasks';
import { saveTasks } from './storage';

const offline: GatewayStatus = {
  connected: false,
  liveEnabled: false,
  models: [],
  message: 'Open the desktop app with a configured gateway to use live models.',
};
export function useGateway(
  tasks: Task[],
  setTasks: Dispatch<SetStateAction<Task[]>>,
  notify: (text: string) => void,
) {
  const [status, setStatus] = useState<GatewayStatus>(offline);
  const refresh = useCallback(async () => {
    try {
      setStatus(window.ayra?.gatewayStatus ? await window.ayra.gatewayStatus() : offline);
    } catch {
      setStatus({ ...offline, message: 'The gateway could not be reached.' });
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const apply = useCallback(
    (taskId: string, runId: string, reply: GatewayReply) => {
      let record: DraftRecord | undefined;
      if ('message' in reply)
        record = {
          id: runId,
          status: reply.error === 'NOT_FOUND' ? 'not-found' : 'unknown',
          error: reply.message,
        };
      else record = restoreDraft(reply);
      if (!record || record.id !== runId)
        record = {
          id: runId,
          status: 'unknown',
          error: 'The gateway returned an invalid receipt. Refresh to check this draft.',
        };
      const incoming = record;
      setTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId || task.draft?.id !== runId) return task;
          if (task.draft.status === 'succeeded') return task;
          if (
            ['failed', 'cancelled', 'uncertain', 'not-found'].includes(task.draft.status) &&
            pendingDraft(incoming)
          )
            return task;
          return {
            ...task,
            draft: incoming,
            ...(incoming.status === 'succeeded' ? { status: 'completed' as const, step: 3 } : {}),
          };
        }),
      );
      if (!pendingDraft(record)) void refresh();
    },
    [setTasks, refresh],
  );

  useEffect(() => {
    const pending = tasks.filter((task) => pendingDraft(task.draft));
    if (!pending.length || !window.ayra?.getDraft) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void Promise.all(
        pending.map(async (task) => {
          try {
            const reply = await window.ayra!.getDraft(task.draft!.id);
            if (!disposed) apply(task.id, task.draft!.id, reply);
          } catch {
            if (!disposed)
              apply(task.id, task.draft!.id, {
                error: 'CONNECTION_UNCERTAIN',
                message:
                  'Connection interrupted. This draft will be checked again without resubmitting it.',
              });
          }
        }),
      );
    }, 1800);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [tasks, apply]);

  async function start(task: Task, notes: string) {
    if (task.draft || !window.ayra?.startDraft || !status.liveEnabled) return;
    // One paid draft per durable task ID also deduplicates a submission if the
    // app exits between persistence and receiving the gateway acknowledgement.
    const id = task.id;
    const draft: DraftRecord = { id, status: 'submitting' };
    const snapshot = tasks.map((item) => (item.id === task.id ? { ...item, draft } : item));
    // Persist the idempotency ID before a potentially billable request leaves.
    if (!saveTasks(snapshot)) {
      notify('Local storage is unavailable. No model request was sent.');
      return;
    }
    setTasks(snapshot);
    try {
      apply(
        task.id,
        id,
        await window.ayra.startDraft({ id, prompt: task.prompt, notes, mode: task.mode }),
      );
    } catch {
      apply(task.id, id, {
        error: 'CONNECTION_UNCERTAIN',
        message: 'The request may have reached the gateway. Checking its ID without repeating it.',
      });
    }
  }
  async function check(task: Task) {
    if (!task.draft || !window.ayra?.getDraft) return;
    try {
      apply(task.id, task.draft.id, await window.ayra.getDraft(task.draft.id));
    } catch {
      notify('The gateway could not be reached. No draft was resubmitted.');
    }
  }
  async function cancel(task: Task) {
    if (!task.draft || !window.ayra?.cancelDraft) return;
    try {
      apply(task.id, task.draft.id, await window.ayra.cancelDraft(task.draft.id));
    } catch {
      notify(
        'Cancellation could not be confirmed. Check the draft status before taking another action.',
      );
    }
  }
  return { status, refresh, start, check, cancel };
}
export type GatewayControls = ReturnType<typeof useGateway>;
