import { describe, expect, it, vi, afterEach } from 'vitest';
import { createTask, documentFor, restoreTasks, TASKS_KEY } from '../../src/lib/tasks';
import { loadTasks, saveTasks } from '../../src/lib/storage';
import { restoreDraft } from '../../src/lib/gateway-types';

afterEach(() => vi.unstubAllGlobals());
describe('draft history and rename compatibility', () => {
  it('migrates the original local history without resurrecting cleared tasks', () => {
    const task = createTask('Research a note', 'auto');
    const map = new Map([['aster.tasks.v1', JSON.stringify([task])]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => map.set(key, value),
    });
    expect(loadTasks()).toEqual([task]);
    expect(saveTasks([])).toBe(true);
    expect(map.has(TASKS_KEY)).toBe(true);
    expect(loadTasks()).toEqual([]);
  });
  it('preserves unresolved run IDs on reload and exports successful model drafts', () => {
    const task = {
      ...createTask('Draft a note', 'auto'),
      draft: { id: crypto.randomUUID(), status: 'running' as const },
    };
    expect(restoreTasks(JSON.stringify([task]))[0].draft).toEqual(task.draft);
    const complete = {
      ...task,
      status: 'completed' as const,
      step: 3,
      draft: {
        ...task.draft,
        status: 'succeeded' as const,
        markdown: '> MrAI AI draft\n\nA useful result.',
      },
    };
    expect(documentFor(complete)).toContain('A useful result.');
    expect(documentFor(complete)).not.toContain('Locally generated template');
  });
  it('rejects malformed or oversized saved receipts', () => {
    expect(
      restoreDraft({ id: crypto.randomUUID(), status: 'succeeded', markdown: '' }),
    ).toBeUndefined();
    expect(
      restoreDraft({ id: crypto.randomUUID(), status: 'succeeded', markdown: 'x'.repeat(101001) }),
    ).toBeUndefined();
    expect(
      restoreDraft({ id: crypto.randomUUID(), status: 'running', costUsdMicros: -1 }),
    ).toBeUndefined();
  });
});
