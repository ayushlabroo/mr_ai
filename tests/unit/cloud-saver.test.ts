import { expect, it, vi } from 'vitest';
import { WorkspaceSaver, cloudSnapshot } from '../../src/lib/cloud';
import { createTask } from '../../src/lib/tasks';

it('serializes overlapping edits and advances the revision before the next write', async () => {
  let finish!: (value: { revision: number }) => void;
  const write = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce({ revision: 2 });
  const report = vi.fn();
  const saver = new WorkspaceSaver([], 0, write, report);
  const first = createTask('First request', 'auto');
  const second = createTask('Second request', 'auto');
  saver.update([first]);
  saver.update([second, first]);
  expect(write).toHaveBeenCalledTimes(1);
  finish({ revision: 1 });
  await vi.waitFor(() =>
    expect(report).toHaveBeenLastCalledWith('saved', 'Saved to your account.'),
  );
  expect(write.mock.calls[1]).toEqual([[second, first], 1]);
});
it('stops after conflicts or ambiguous writes and never silently overwrites remote work', async () => {
  const write = vi.fn().mockRejectedValue(new Error('Workspace changed elsewhere'));
  const report = vi.fn();
  const saver = new WorkspaceSaver([], 3, write, report);
  const task = createTask('Draft a brief', 'auto');
  saver.update([task]);
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith('error', 'Workspace changed elsewhere'),
  );
  saver.update([{ ...task, title: 'Edited' }]);
  await saver.flush();
  expect(write).toHaveBeenCalledTimes(1);
});
it('does not write restored initial state or keep saving after account unmount', async () => {
  const task = createTask('Draft a brief', 'auto');
  const write = vi.fn();
  const saver = new WorkspaceSaver([task], 1, write, vi.fn());
  saver.update([task]);
  saver.dispose();
  saver.update([]);
  expect(write).not.toHaveBeenCalled();
});
it('pauses restored running demos and refuses snapshots that would silently drop tasks', () => {
  const task = createTask('Draft a brief', 'auto');
  expect(
    cloudSnapshot({ tasks: [{ ...task, status: 'running' }], revision: 1 }).tasks[0].status,
  ).toBe('paused');
  expect(() => cloudSnapshot({ tasks: [{ ...task, id: 'bad id' }], revision: 1 })).toThrow();
});
