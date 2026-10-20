import { restoreTasks, TASKS_KEY } from './tasks';
import type { Task } from './tasks';

export function loadTasks(): Task[] {
  try {
    return restoreTasks(localStorage.getItem(TASKS_KEY) ?? localStorage.getItem('aster.tasks.v1'));
  } catch {
    return [];
  }
}
export function saveTasks(tasks: Task[]): boolean {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    return true;
  } catch {
    return false;
  }
}
