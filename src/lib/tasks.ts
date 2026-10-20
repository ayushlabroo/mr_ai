import { restoreDraft } from './gateway-types';
import type { DraftRecord } from './gateway-types';

export type TaskKind = 'research' | 'files' | 'comparison';
export type RunMode = 'auto' | 'economy' | 'thorough';
export type TaskStatus = 'planned' | 'running' | 'paused' | 'completed' | 'cancelled';
export type Task = {
  id: string;
  prompt: string;
  title: string;
  kind: TaskKind;
  mode: RunMode;
  status: TaskStatus;
  step: number;
  createdAt: number;
  draft?: DraftRecord;
};
export type Workspace = { id: string; name: string };

export const MAX_TASKS = 30;
export const MAX_PROMPT = 4000;
export const TASKS_KEY = 'ayra.tasks.v1';

export const starters: {
  kind: TaskKind;
  title: string;
  description: string;
  prompt: string;
  label: string;
}[] = [
  {
    kind: 'research',
    title: 'Go down the rabbit hole',
    description: 'Turn a big question into a clear, useful brief.',
    label: 'Research something',
    prompt:
      'Create a research brief on how a small team can use AI agents in its daily work. Include questions to investigate, a comparison framework, and next steps.',
  },
  {
    kind: 'files',
    title: 'Make room for clarity',
    description: 'Give a messy project a little structure.',
    label: 'Organise a project',
    prompt:
      'Create a practical file organisation plan for a project folder, with a proposed structure, naming rules, and a checklist to review before moving anything.',
  },
  {
    kind: 'comparison',
    title: 'Find your best next move',
    description: 'Bring the options. Get a fresh perspective.',
    label: 'Compare my options',
    prompt:
      'Help me compare three tools for managing a small team. Create a decision framework covering cost, ease of use, integrations, and tradeoffs.',
  },
];

export function classify(prompt: string): TaskKind {
  if (/\b(files?|folders?|organis[ez]|organiz[ez]|rename)\b/i.test(prompt)) return 'files';
  if (/\bresearch\b/i.test(prompt)) return 'research';
  if (/\b(compare|comparison|versus|vs|options|tradeoffs)\b/i.test(prompt)) return 'comparison';
  return 'research';
}

export function stepsFor(kind: TaskKind): string[] {
  if (kind === 'files')
    return [
      'Outline a folder structure',
      'Create naming and review rules',
      'Prepare an organisation checklist',
    ];
  if (kind === 'comparison')
    return [
      'Define the decision criteria',
      'Build a comparison framework',
      'Prepare a decision brief',
    ];
  return [
    'Frame the research questions',
    'Build an investigation framework',
    'Prepare a structured brief',
  ];
}

export function previewRoute(prompt: string, mode: RunMode) {
  if (mode === 'thorough')
    return { tier: 'Advanced', reason: 'Thorough mode requests a deeper planning pass.' };
  if (mode === 'economy')
    return { tier: 'Economy', reason: 'Economy mode prioritises the smallest suitable model.' };
  if (/\b(complex|architecture|strategy|strategic|multi-step)\b/i.test(prompt)) {
    return {
      tier: 'Advanced',
      reason: 'This request contains a signal for more involved planning.',
    };
  }
  return {
    tier: 'Economy',
    reason: 'A structured everyday task is a candidate for an economical model.',
  };
}

export function createTask(prompt: string, mode: RunMode): Task {
  const clean = prompt.trim().slice(0, MAX_PROMPT);
  if (!clean) throw new Error('Tell MrAI what you would like to do.');
  const subject =
    clean
      .replace(/\s+/g, ' ')
      .split(/\.\s/)[0]
      .replace(
        /^(?:create|write|draft|prepare)\s+(?:an?\s+)?(?:research brief|brief|report|document)\s+(?:on|about|for)\s+/i,
        '',
      )
      .replace(/^(?:create|write|draft|prepare)\s+(?:an?\s+)?/i, '')
      .replace(/^help me\s+/i, '')
      .replace(/[.!?]$/, '') || clean;
  const title =
    subject.length > 72
      ? `${subject
          .slice(0, 68)
          .replace(/\s+\S*$/, '')
          .trimEnd()}…`
      : subject;
  return {
    id: crypto.randomUUID(),
    prompt: clean,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    kind: classify(clean),
    mode,
    status: 'planned',
    step: 0,
    createdAt: Date.now(),
  };
}

// A fixed, local template. It contains no factual research or model output.
export function buildDocument(task: Task): string {
  const header = `# ${task.title}\n\n> MrAI demo · Locally generated template. No live research, file inspection, or model calls were performed.\n\n## Your request\n\n${task.prompt}\n\n`;
  if (task.kind === 'files')
    return (
      header +
      `## Proposed structure\n\n- 01_Inbox — unreviewed material\n- 02_Working — active drafts and project files\n- 03_Reference — source material and supporting documents\n- 04_Deliverables — approved outputs\n- 05_Archive — completed work\n\n## Naming rules\n\nUse descriptive names, a YYYY-MM-DD date when useful, and a clear version suffix. Keep originals until their replacements have been reviewed.\n\n## Before making changes\n\n- Inventory the real folder contents.\n- Back up important material.\n- Review proposed moves and possible duplicate names.\n- Confirm the plan before moving or deleting files.\n\nNo files have been read, moved, or renamed.\n`
    );
  if (task.kind === 'comparison')
    return (
      header +
      `## Decision to make\n\nDefine the outcome, available budget, and non-negotiable requirements before scoring options.\n\n## Comparison framework\n\n| Criterion | Option A | Option B | Option C |\n| --- | --- | --- | --- |\n| Total cost | To verify | To verify | To verify |\n| Ease of use | To evaluate | To evaluate | To evaluate |\n| Required capabilities | To evaluate | To evaluate | To evaluate |\n| Integrations | To verify | To verify | To verify |\n| Limitations and tradeoffs | To evaluate | To evaluate | To evaluate |\n\n## Next steps\n\n1. Name the actual options and weight the criteria.\n2. Collect evidence from current primary sources.\n3. Test the strongest candidates on the same real task.\n4. Make a recommendation supported by that evidence.\n\nThis is a blank decision framework, not an evaluated recommendation.\n`
    );
  return (
    header +
    `## Research questions\n\n1. What outcome matters most for this request?\n2. What evidence would support or challenge the main assumptions?\n3. Which options or approaches deserve comparison?\n4. What constraints could change the conclusion?\n\n## Investigation framework\n\n| Area | Evidence to collect | Status |\n| --- | --- | --- |\n| Context | Definitions, stakeholders, and current situation | Not researched |\n| Options | Relevant approaches and alternatives | Not researched |\n| Tradeoffs | Costs, effort, benefits, and limitations | Not researched |\n| Recommendation | Evidence tied to the desired outcome | Not researched |\n\n## Sources\n\nNo sources have been fetched. Add current primary sources with links and dates before treating this brief as research.\n\n## Next steps\n\n1. Narrow the question and define a useful deliverable.\n2. Gather and cross-check source material.\n3. Replace the framework with evidence and findings.\n4. Review the final brief before sharing it.\n`
  );
}

const statuses = new Set(['planned', 'running', 'paused', 'completed', 'cancelled']);

export function restoreTasks(raw: string | null): Task[] {
  if (!raw || raw.length > 3_600_000) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data
      .filter((entry): entry is Task => {
        if (!entry || typeof entry !== 'object') return false;
        const t = entry as Task;
        if (typeof t.id !== 'string' || !/^[\w-]{1,80}$/.test(t.id) || seen.has(t.id)) return false;
        if (typeof t.prompt !== 'string' || !t.prompt.trim() || t.prompt.length > MAX_PROMPT)
          return false;
        if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 72) return false;
        if (
          !['research', 'files', 'comparison'].includes(t.kind) ||
          !['auto', 'economy', 'thorough'].includes(t.mode)
        )
          return false;
        if (!statuses.has(t.status) || !Number.isInteger(t.step) || t.step < 0 || t.step > 3)
          return false;
        if ((t.status === 'completed' && t.step !== 3) || (t.status !== 'completed' && t.step >= 3))
          return false;
        if (!Number.isFinite(t.createdAt) || t.createdAt < 0) return false;
        if (t.draft !== undefined && !restoreDraft(t.draft)) return false;
        seen.add(t.id);
        return true;
      })
      .slice(0, MAX_TASKS)
      .map((t) => ({
        id: t.id,
        prompt: t.prompt,
        title: t.title,
        kind: t.kind,
        mode: t.mode,
        status: t.status === 'running' ? 'paused' : t.status,
        step: t.step,
        createdAt: t.createdAt,
        ...(t.draft ? { draft: restoreDraft(t.draft) } : {}),
      }));
  } catch {
    return [];
  }
}

export function documentFor(task: Task): string {
  return task.draft?.status === 'succeeded' && task.draft.markdown
    ? task.draft.markdown
    : buildDocument(task);
}

export function advanceTask(task: Task): Task {
  if (task.status !== 'running') return task;
  const step = Math.min(task.step + 1, stepsFor(task.kind).length);
  return { ...task, step, status: step === 3 ? 'completed' : 'running' };
}
