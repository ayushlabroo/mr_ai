import type { Task } from './tasks';
import { restoreTasks } from './tasks';

export type CloudUser = { id: string; email: string };
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function cloudRequest(path: 'account' | 'workspace', body?: unknown, method = 'POST') {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    ...(body
      ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
    signal: AbortSignal.timeout(18000),
  });
  const data = await response.json();
  if (!response.ok) throw new CloudError(data.message ?? 'Cloud request failed.', response.status);
  return data;
}

export function cloudSnapshot(raw: unknown): { tasks: Task[]; revision: number } {
  const data = raw as { tasks?: unknown; revision?: number };
  if (!Array.isArray(data?.tasks) || !Number.isSafeInteger(data.revision) || data.revision! < 0)
    throw new Error('The cloud workspace response is invalid.');
  const tasks = restoreTasks(JSON.stringify(data.tasks));
  if (tasks.length !== data.tasks.length)
    throw new Error('Some cloud tasks could not be verified.');
  return { tasks, revision: data.revision! };
}

// Serial, revision-checked saves. A conflict or uncertain write stops the queue;
// it never retries an old revision automatically or overwrites a remote edit.
export class WorkspaceSaver {
  private latest: Task[];
  private saved: string;
  private running = false;
  private stopped = false;
  private disposed = false;
  constructor(
    tasks: Task[],
    private revision: number,
    private write: (tasks: Task[], revision: number) => Promise<{ revision: number }>,
    private report: (state: 'saved' | 'saving' | 'error', message: string) => void,
  ) {
    this.latest = tasks;
    this.saved = JSON.stringify(tasks);
  }
  update(tasks: Task[]) {
    if (this.disposed) return;
    this.latest = tasks;
    if (JSON.stringify(tasks) !== this.saved) {
      if (!this.stopped) this.report('saving', 'Saving to your account…');
      void this.flush();
    }
  }
  async flush() {
    if (this.running || this.stopped || this.disposed) return;
    this.running = true;
    try {
      while (!this.disposed && JSON.stringify(this.latest) !== this.saved) {
        const snapshot = this.latest;
        const result = await this.write(snapshot, this.revision);
        if (!Number.isSafeInteger(result.revision) || result.revision !== this.revision + 1)
          throw new Error('Cloud save could not be confirmed. Export your edits before reloading.');
        this.revision = result.revision;
        this.saved = JSON.stringify(snapshot);
      }
      if (!this.disposed) this.report('saved', 'Saved to your account.');
    } catch (error) {
      this.stopped = true;
      if (!this.disposed)
        this.report('error', error instanceof Error ? error.message : 'Cloud save failed.');
    } finally {
      this.running = false;
    }
  }
  dispose() {
    this.disposed = true;
  }
}
