import { describe, expect, it } from 'vitest';
import {
  advanceTask,
  buildDocument,
  classify,
  createTask,
  previewRoute,
  restoreTasks,
  starters,
} from '../../src/lib/tasks';

describe('local task lifecycle', () => {
  it('requires explicit approval before any progression', () => {
    const task = createTask('Research a project', 'auto');
    expect(advanceTask(task)).toBe(task);
    const running = { ...task, status: 'running' as const };
    const first = advanceTask(running);
    expect(first.step).toBe(1);
    expect(advanceTask({ ...first, status: 'paused' })).toEqual({ ...first, status: 'paused' });
    expect(advanceTask({ ...first, status: 'cancelled' }).step).toBe(1);
    const completed = advanceTask(advanceTask(first));
    expect(completed.status).toBe('completed');
    expect(completed.step).toBe(3);
    expect(advanceTask(completed)).toBe(completed);
  });
  it('restores an interrupted run as paused without replaying it', () => {
    const task = { ...createTask('Research a project', 'auto'), status: 'running', step: 1 };
    expect(restoreTasks(JSON.stringify([task]))[0]).toEqual({ ...task, status: 'paused' });
  });
  it('rejects corrupted state, duplicate IDs and inconsistent completed tasks', () => {
    const task = createTask('Research a project', 'auto');
    expect(restoreTasks('broken')).toEqual([]);
    expect(restoreTasks(JSON.stringify({ tasks: [task] }))).toEqual([]);
    expect(
      restoreTasks(
        JSON.stringify([
          task,
          task,
          { ...task, id: 'bad', step: -1 },
          { ...task, id: 'wrong', status: 'completed', step: 0 },
        ]),
      ),
    ).toEqual([task]);
  });
  it('keeps each starter in its intended output category', () => {
    for (const starter of starters) expect(classify(starter.prompt)).toBe(starter.kind);
  });
  it('uses readable titles and signals truncation at a word boundary', () => {
    expect(createTask(starters[0].prompt, 'auto').title).toBe(
      'How a small team can use AI agents in its daily work',
    );
    const task = createTask(
      'A thoughtful project with an unusually long description that needs a clear and readable title',
      'auto',
    );
    expect(task.title).toMatch(/…$/);
    expect(task.title.length).toBeLessThanOrEqual(72);
  });
  it('labels exports as templates without invented sources or model usage', () => {
    for (const starter of starters) {
      const output = buildDocument(createTask(starter.prompt, 'auto'));
      expect(output).toContain('Locally generated template');
      expect(output).toContain('No live research, file inspection, or model calls were performed');
      expect(output).toContain(starter.prompt);
    }
  });
  it('rejects blank requests and bounds prompt size', () => {
    expect(() => createTask('   ', 'auto')).toThrow();
    expect(createTask('a'.repeat(5000), 'auto').prompt.length).toBe(4000);
  });
});

describe('deterministic routing preview', () => {
  it('respects explicit modes and escalates planning signals in auto', () => {
    expect(previewRoute('A complex architecture', 'auto').tier).toBe('Advanced');
    expect(previewRoute('A complex architecture', 'economy').tier).toBe('Economy');
    expect(previewRoute('Summarise a note', 'thorough').tier).toBe('Advanced');
    expect(previewRoute('Summarise a note', 'auto').tier).toBe('Economy');
  });
});
