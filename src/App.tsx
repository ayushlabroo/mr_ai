import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Asterisk,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Files,
  Folder,
  FolderOpen,
  Globe2,
  House,
  Layers3,
  ListTodo,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Modal } from './components/Modal';
import { DocumentPreview } from './components/DocumentPreview';
import { DraftPanel, GatewaySettings } from './components/GatewayPanel';
import { MrAIMark } from './components/MrAIMark';
import { useGateway } from './lib/useGateway';
import type { GatewayControls } from './lib/useGateway';
import { pendingDraft, usd } from './lib/gateway-types';
import {
  advanceTask,
  documentFor,
  createTask,
  MAX_PROMPT,
  MAX_TASKS,
  previewRoute,
  starters,
  stepsFor,
} from './lib/tasks';
import type { RunMode, Task, TaskKind, TaskStatus, Workspace } from './lib/tasks';
import { loadTasks, saveTasks } from './lib/storage';
import { exportMarkdown } from './lib/platform';

type Screen = 'home' | 'tasks' | 'files';
const kindIcons: Record<TaskKind, LucideIcon> = {
  research: Globe2,
  files: FolderOpen,
  comparison: Layers3,
};
const statusLabels: Record<TaskStatus, string> = {
  planned: 'Ready to start',
  running: 'In progress',
  paused: 'Paused',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
const modeLabels: Record<RunMode, string> = {
  auto: 'Auto',
  economy: 'Economy',
  thorough: 'Thorough',
};

export default function App({
  initialTasks,
  onTasksChange,
  accountPanel,
  cloudEmail,
  cloudMessage,
}: {
  initialTasks?: Task[];
  onTasksChange?: (tasks: Task[]) => void;
  accountPanel?: ReactNode;
  cloudEmail?: string;
  cloudMessage?: string;
} = {}) {
  const [tasks, setTasks] = useState<Task[]>(() => initialTasks ?? loadTasks());
  const [screen, setScreen] = useState<Screen>('home');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<RunMode>('auto');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(
    () =>
      import.meta.env.MODE === 'visual-review' &&
      new URLSearchParams(window.location.search).get('settings') === '1',
  );
  const [clearOpen, setClearOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(
    () => window.matchMedia('(max-width: 767px)').matches,
  );
  const [toast, setToast] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [filter, setFilter] = useState('all');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const directoryRef = useRef<HTMLInputElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const activeTask = tasks.find((task) => task.id === activeId);
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const gateway = useGateway(tasks, setTasks, setToast);
  const unresolvedDrafts = tasks.some((task) => pendingDraft(task.draft));

  useEffect(() => {
    if (onTasksChange) onTasksChange(tasks);
    else setStorageWarning(!saveTasks(tasks));
  }, [tasks, onTasksChange]);
  useEffect(() => {
    directoryRef.current?.setAttribute('webkitdirectory', '');
    document.documentElement.dataset.desktop = window.ayra ? 'true' : 'false';
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => {
      setCompactNavigation(query.matches);
      setSidebarOpen(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!compactNavigation || !sidebarOpen) return;
    const focusable = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]',
        ) ?? [],
      );
    const frame = requestAnimationFrame(() => focusable()[0]?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      navigationTriggerRef.current?.focus();
    };
  }, [compactNavigation, sidebarOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  // Timer-driven demo progression only. No provider, filesystem or browser tools.
  useEffect(() => {
    if (!tasks.some((task) => task.status === 'running')) return;
    const timer = window.setTimeout(() => setTasks((current) => current.map(advanceTask)), 1000);
    return () => window.clearTimeout(timer);
  }, [tasks]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        newTask();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function newTask(initialPrompt = '') {
    setScreen('home');
    setActiveId(null);
    setPrompt(initialPrompt);
    setSidebarOpen(false);
    setSettingsOpen(false);
    setHelpOpen(false);
    setSearchOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }
  function navigate(next: Screen) {
    setScreen(next);
    setActiveId(null);
    setSidebarOpen(false);
  }
  function selectTask(task: Task) {
    setActiveId(task.id);
    setScreen('tasks');
    setSidebarOpen(false);
    setSearchOpen(false);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    if (tasks.length >= MAX_TASKS) {
      setToast(
        'This workspace holds 30 tasks. Export your documents and clear history in Settings to start fresh.',
      );
      return;
    }
    const task = createTask(prompt, mode);
    setTasks((current) => [task, ...current]);
    setActiveId(task.id);
    setScreen('tasks');
    setPrompt('');
  }
  function setTaskStatus(id: string, status: TaskStatus) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, status } : task)));
  }
  async function chooseWorkspace() {
    if (!window.ayra) {
      directoryRef.current?.click();
      return;
    }
    try {
      const selected = await window.ayra.selectWorkspace();
      if (selected) {
        setWorkspace(selected);
        setToast('Folder selected. This demo does not read or modify its contents.');
      }
    } catch {
      setToast('The folder could not be selected. Please try again.');
    }
  }
  async function download(task: Task) {
    try {
      if (await exportMarkdown(task.title, documentFor(task)))
        setToast(
          window.ayra ? 'Your brief has been saved.' : 'Your brief has been sent to Downloads.',
        );
    } catch {
      setToast('The brief could not be saved. Please try again.');
    }
  }
  async function copy(task: Task) {
    try {
      await navigator.clipboard.writeText(documentFor(task));
      setToast('Brief copied to clipboard.');
    } catch {
      setToast('Clipboard access is unavailable. You can download the brief instead.');
    }
  }

  const displayedTasks = tasks.filter(
    (task) =>
      filter === 'all' ||
      (filter === 'active'
        ? ['planned', 'paused', 'running'].includes(task.status)
        : task.status === 'completed'),
  );
  const searchedTasks = tasks.filter((task) =>
    `${task.title} ${task.prompt}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <div className="app-field" aria-hidden="true" />
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        className={`sidebar glass ${sidebarOpen ? 'sidebar-open' : ''}`}
        aria-label="Main navigation"
        role={compactNavigation ? 'dialog' : undefined}
        aria-modal={compactNavigation && sidebarOpen ? true : undefined}
        inert={compactNavigation && !sidebarOpen}
      >
        <div className="window-grip">
          <span />
          <span />
          <span />
          <button
            className="icon-button mobile-nav-close"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <button className="brand" onClick={() => navigate('home')} aria-label="MrAI by Ayush home">
          <span className="brand-mark">
            <MrAIMark />
          </span>
          <span>
            MrAI
            <span className="brand-attribution">by Ayush</span>
          </span>
          <span className="beta-label">BETA</span>
        </button>
        <button className="new-task-button" onClick={() => newTask()}>
          <Plus size={18} />
          <span>New task</span>
          <kbd>⌘ N</kbd>
        </button>
        <nav className="primary-navigation">
          <NavItem
            icon={House}
            active={screen === 'home' && !activeTask}
            label="Workspace"
            onClick={() => navigate('home')}
          />
          <NavItem
            icon={ListTodo}
            active={screen === 'tasks' || !!activeTask}
            label="Tasks"
            count={tasks.length}
            onClick={() => navigate('tasks')}
          />
          <NavItem
            icon={Files}
            active={screen === 'files' && !activeTask}
            label="Files"
            count={completedTasks.length}
            onClick={() => navigate('files')}
          />
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section-heading">
          <span>YOUR SPACE</span>
          <button
            className="icon-button small"
            aria-label="Choose workspace folder"
            onClick={() => void chooseWorkspace()}
          >
            <Plus size={15} />
          </button>
        </div>
        <button className="workspace-link" onClick={() => void chooseWorkspace()}>
          <Folder size={16} />
          <span>{workspace?.name ?? 'My workspace'}</span>
          <ChevronDown size={13} />
        </button>
        <div className="sidebar-section-heading recent-heading">
          <span>RECENT</span>
          <button
            className="icon-button small"
            aria-label="Search tasks"
            onClick={() => setSearchOpen(true)}
          >
            <Search size={14} />
          </button>
        </div>
        <div className="recent-tasks">
          {tasks.length ? (
            tasks.slice(0, 5).map((task) => (
              <button
                key={task.id}
                className={`recent-task ${activeId === task.id ? 'selected' : ''}`}
                onClick={() => selectTask(task)}
              >
                <span className={`task-dot ${task.status}`} />
                <span>{task.title}</span>
              </button>
            ))
          ) : (
            <div className="recent-empty">
              A fresh start.
              <br />
              Your tasks will appear here.
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span className="local-note-icon">
              <ShieldCheck size={17} />
            </span>
            <div>
              <strong>A little space, just for you.</strong>
              <p>{cloudEmail ? cloudMessage : 'Task history stays on this device.'}</p>
            </div>
          </div>
          <button className="profile-button" onClick={() => setSettingsOpen(true)}>
            <span className="avatar">A</span>
            <span>
              <strong>{cloudEmail ?? 'Your workspace'}</strong>
              <small>{cloudEmail ? 'Cloud workspace' : 'Local workspace'}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>

      <div className="workspace-shell" inert={compactNavigation && sidebarOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              ref={navigationTriggerRef}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>My workspace</span>
            <ChevronRight size={13} />
            <strong>
              {activeTask
                ? 'Task'
                : screen === 'home'
                  ? 'Overview'
                  : screen === 'tasks'
                    ? 'Tasks'
                    : 'Files'}
            </strong>
          </div>
          <div className="topbar-actions">
            {!window.ayra && (
              <a
                className="workspace-download-link"
                href={window.location.protocol === 'file:' ? '?view=download' : '/download'}
              >
                <ArrowDownToLine size={15} />
                <span>Desktop apps</span>
              </a>
            )}
            <span className="preview-badge">
              <span />
              {gateway.status.connected &&
              gateway.status.liveEnabled &&
              gateway.status.models.length
                ? 'AI connected'
                : 'Local demo'}
            </span>
            <button
              className="icon-button search-trigger"
              aria-label="Search workspace"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Help and shortcuts"
              onClick={() => setHelpOpen(true)}
            >
              <CircleHelp size={18} />
            </button>
          </div>
        </header>
        {storageWarning && (
          <div className="storage-warning" role="alert">
            Local storage is unavailable. Tasks will last only for this session.
          </div>
        )}
        <main id="main-content" className={`main-content ${activeTask ? 'task-main' : ''}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTask?.id ?? screen}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -5 }}
              className="screen-content"
            >
              {activeTask ? (
                <TaskView
                  gateway={gateway}
                  task={activeTask}
                  onStatus={(status) => setTaskStatus(activeTask.id, status)}
                  onBack={() => navigate('tasks')}
                  onDownload={() => void download(activeTask)}
                  onCopy={() => void copy(activeTask)}
                  onNew={() => newTask()}
                />
              ) : screen === 'home' ? (
                <>
                  <section className="welcome" aria-labelledby="welcome-title">
                    <div className="welcome-eyebrow">
                      <span className="tiny-star">✳</span> A LITTLE SPACE TO DO MORE
                    </div>
                    <h1 id="welcome-title">
                      Big ideas.
                      <br />
                      <span>A little less busywork.</span>
                    </h1>
                    <p>Your thoughts, files, and to-dos. MrAI helps bring them together.</p>
                  </section>
                  <section className="composer-section" aria-label="Create a task">
                    <form className="composer glass-raised" onSubmit={submit}>
                      <label className="sr-only" htmlFor="task-prompt">
                        What would you like to get done?
                      </label>
                      <textarea
                        ref={textareaRef}
                        id="task-prompt"
                        placeholder="What would you like to get done?"
                        value={prompt}
                        maxLength={MAX_PROMPT}
                        rows={3}
                        onChange={(event) => setPrompt(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                      <div className="composer-bottom">
                        <div className="composer-options">
                          <button
                            type="button"
                            className="folder-button"
                            onClick={() => void chooseWorkspace()}
                          >
                            <Plus size={16} />
                            <span>{workspace?.name ?? 'Add a folder'}</span>
                          </button>
                          <span className="composer-divider" />
                          <label className="mode-select">
                            <WandSparkles size={14} />
                            <select
                              aria-label="Routing mode"
                              value={mode}
                              onChange={(event) => setMode(event.target.value as RunMode)}
                            >
                              <option value="auto">Auto</option>
                              <option value="economy">Economy</option>
                              <option value="thorough">Thorough</option>
                            </select>
                            <ChevronDown size={12} />
                          </label>
                        </div>
                        <button
                          className="submit-button"
                          aria-label="Create task plan"
                          disabled={!prompt.trim()}
                          type="submit"
                        >
                          <ArrowUp size={20} />
                        </button>
                      </div>
                    </form>
                    <div className="composer-caption">
                      <span>
                        <ShieldCheck size={12} />A plan first. You stay in control.
                      </span>
                      <span>
                        ↵ to plan <span className="caption-separator">·</span> shift ↵ for a new
                        line
                      </span>
                    </div>
                  </section>
                  <section className="suggestions" aria-labelledby="suggestions-heading">
                    <div className="section-heading">
                      <h2 id="suggestions-heading">A good place to start</h2>
                      <span>SMALL PROMPTS. BIG POSSIBILITIES.</span>
                    </div>
                    <div className="suggestion-grid">
                      {starters.map((starter) => {
                        const Icon = kindIcons[starter.kind];
                        return (
                          <button
                            className={`suggestion-card glass-strong ${starter.kind}`}
                            key={starter.kind}
                            onClick={() => newTask(starter.prompt)}
                          >
                            <span className="suggestion-top">
                              <span className="suggestion-icon">
                                <Icon size={21} strokeWidth={1.5} />
                              </span>
                              <ArrowRight className="suggestion-arrow" size={17} />
                            </span>
                            <h3>{starter.title}</h3>
                            <p>{starter.description}</p>
                            <span className="suggestion-label">
                              {starter.label}
                              <ChevronRight size={12} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                  <section className="intro-panel glass" aria-labelledby="intro-heading">
                    <div className="intro-copy">
                      <span className="eyebrow">FROM A THOUGHT TO A THING</span>
                      <h2 id="intro-heading">
                        A clear path from
                        <br />
                        “what if” to “all done”.
                      </h2>
                      <p>
                        Make a plan. Follow the progress.
                        <br />
                        Keep something worth keeping.
                      </p>
                      <button className="text-button" onClick={() => setHelpOpen(true)}>
                        Meet your workspace <ArrowRight size={15} />
                      </button>
                    </div>
                    <WorkflowArt reduceMotion={!!reduceMotion} />
                  </section>
                  <footer className="workspace-footer">
                    <span>
                      <Asterisk size={13} />
                      MrAI by Ayush. Made for thoughtful work.
                    </span>
                    <span>
                      {gateway.status.connected && gateway.status.liveEnabled
                        ? 'Private preview · Gateway connected'
                        : 'Private preview · Local demos available'}
                    </span>
                  </footer>
                </>
              ) : screen === 'tasks' ? (
                <section className="library-section">
                  <div className="library-heading">
                    <div>
                      <span className="eyebrow">A LITTLE MOMENTUM</span>
                      <h1>Your tasks</h1>
                      <p>From the first thought to the finished thing.</p>
                    </div>
                    <button className="button-primary" onClick={() => newTask()}>
                      <Plus size={16} />
                      New task
                    </button>
                  </div>
                  <div className="filter-tabs" role="group" aria-label="Filter tasks">
                    {[
                      ['all', 'All tasks'],
                      ['active', 'In progress'],
                      ['completed', 'Completed'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        className={filter === value ? 'active' : ''}
                        onClick={() => setFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {displayedTasks.length ? (
                    <div className="task-list glass-strong">
                      {displayedTasks.map((task) => (
                        <TaskRow task={task} key={task.id} onClick={() => selectTask(task)} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={ListTodo}
                      title={
                        tasks.length ? 'Nothing here just yet.' : 'Your next good idea starts here.'
                      }
                      description={
                        tasks.length
                          ? 'Try another filter, or make a little room for something new.'
                          : 'Give MrAI a task and review the plan before you start.'
                      }
                      action="Start a task"
                      onAction={() => newTask()}
                    />
                  )}
                </section>
              ) : (
                <section className="library-section">
                  <div className="library-heading">
                    <div>
                      <span className="eyebrow">SOMETHING TO KEEP</span>
                      <h1>Your files</h1>
                      <p>The briefs and frameworks you create, all in one place.</p>
                    </div>
                    <span className="count-label">
                      {completedTasks.length}{' '}
                      {completedTasks.length === 1 ? 'document' : 'documents'}
                    </span>
                  </div>
                  {completedTasks.length ? (
                    <div className="file-grid">
                      {completedTasks.map((task) => (
                        <button
                          className="file-card glass-strong"
                          key={task.id}
                          onClick={() => selectTask(task)}
                        >
                          <div className="file-paper">
                            <FileText size={30} strokeWidth={1.2} />
                            <span />
                            <span />
                            <span />
                          </div>
                          <h2>{task.title}</h2>
                          <p>
                            Markdown brief <span>·</span>{' '}
                            {task.draft?.status === 'succeeded' ? 'AI draft' : 'Local demo'}
                          </p>
                          <span className="file-open">
                            Open document
                            <ArrowRight size={15} />
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="Good work deserves a home."
                      description="Run a demo task to create your first brief. You can preview it here and save it as Markdown."
                      action="Create a brief"
                      onAction={() => newTask(starters[0].prompt)}
                    />
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <input
        className="sr-only"
        type="file"
        multiple
        ref={directoryRef}
        tabIndex={-1}
        aria-label="Select workspace folder"
        onChange={(event) => {
          const files = event.target.files;
          if (files?.length) {
            setWorkspace({
              id: crypto.randomUUID(),
              name: files[0].webkitRelativePath.split('/')[0] || 'Selected folder',
            });
            setToast('Folder selected for this session. This demo does not read or modify files.');
          }
          event.target.value = '';
        }}
      />

      <Modal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Your workspace"
        description="A few things to know about this early preview."
      >
        <div className="settings-section">
          <span className="settings-icon">
            <Sparkles size={22} />
          </span>
          <div>
            <h3>MrAI by Ayush.</h3>
            <p>
              Your personal agent workspace. Plan a task, run a local demo, and save a document.
            </p>
          </div>
        </div>
        {accountPanel}
        <GatewaySettings gateway={gateway} />
        <div className="setting-row">
          <div>
            <strong>Selected folder</strong>
            <span>Selection expires when the app closes.</span>
          </div>
          <span className="setting-value">{workspace?.name ?? 'None selected'}</span>
        </div>
        {workspace && (
          <button
            className="text-button settings-text-button"
            onClick={() => {
              setWorkspace(null);
              setToast('Folder disconnected.');
            }}
          >
            Disconnect folder
            <X size={14} />
          </button>
        )}
        <div className="settings-data">
          <h3>{cloudEmail ? 'In your account' : 'On this device'}</h3>
          <p>
            {cloudEmail
              ? 'Up to 30 tasks and their documents are saved to your account. Local demo history is kept separately on this device.'
              : 'Your last 30 tasks are kept in local browser storage. Sign in on the website to save new tasks to your account.'}
          </p>
          <button
            className="button-secondary"
            disabled={!tasks.length || unresolvedDrafts}
            onClick={() => {
              setSettingsOpen(false);
              setHelpOpen(false);
              setClearOpen(true);
            }}
          >
            {cloudEmail ? 'Clear account task history' : 'Clear local task history'}
          </button>
          {unresolvedDrafts && <p>Finish or cancel active AI drafts before clearing history.</p>}
        </div>
      </Modal>
      <ClearHistoryModal
        open={clearOpen}
        cloud={!!cloudEmail}
        onOpenChange={setClearOpen}
        onClear={() => {
          setTasks([]);
          setActiveId(null);
          setScreen('home');
          setToast(
            cloudEmail
              ? 'Task history cleared. Saving to your account…'
              : 'Local task history cleared.',
          );
        }}
      />
      <Modal
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="A little help getting started"
        description="Think of MrAI as a workspace for turning intention into a useful result."
      >
        <div className="help-steps">
          {[
            [
              '01',
              'Bring a thought',
              'Describe the outcome you want, or use a starter to find your feet.',
            ],
            [
              '02',
              'Make a plan',
              'Review three clear steps. Nothing starts until you choose Run demo.',
            ],
            ['03', 'Keep the good stuff', 'Preview your brief, copy it, or save a Markdown file.'],
          ].map(([number, title, text]) => (
            <div className="help-step" key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="demo-disclosure">
          <ShieldCheck size={18} />
          <p>
            <strong>Choose your execution.</strong> Local demos generate templates without APIs.
            Optional AI drafts send your request and pasted notes to a configured model after your
            approval. Neither execution searches the web, inspects folders, or moves files.
          </p>
        </div>
        <div className="shortcut-list">
          <span>
            New task<kbd>⌘ / Ctrl N</kbd>
          </span>
          <span>
            Search your tasks<kbd>⌘ / Ctrl K</kbd>
          </span>
          <span>
            Close a dialog<kbd>Esc</kbd>
          </span>
        </div>
      </Modal>
      <Modal
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) setSearch('');
        }}
        title="Find a little clarity"
        description="Search your tasks or start something new."
        className="search-modal"
      >
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your tasks…"
            aria-label="Search tasks"
          />
        </div>
        <div className="search-results">
          {searchedTasks.length ? (
            searchedTasks.map((task) => (
              <TaskRow task={task} key={task.id} onClick={() => selectTask(task)} />
            ))
          ) : (
            <p className="search-empty">
              {search
                ? 'No matching tasks. Try a different word.'
                : 'Your tasks will be searchable here.'}
            </p>
          )}
        </div>
        <button className="search-new-task" onClick={() => newTask(search)}>
          <Plus size={17} />
          <span>Start a new task{search ? ` with “${search.slice(0, 38)}”` : ''}</span>
          <ArrowRight size={15} />
        </button>
      </Modal>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast glass-menu"
            role="status"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Check size={16} />
            <span>{toast}</span>
            <button
              className="icon-button small"
              onClick={() => setToast('')}
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// The explicit confirmation is local to the destructive history action.
function ClearHistoryModal({
  open,
  cloud = false,
  onOpenChange,
  onClear,
}: {
  open: boolean;
  cloud?: boolean;
  onOpenChange: (open: boolean) => void;
  onClear: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={cloud ? 'Clear account task history?' : 'Clear local task history?'}
      description={
        cloud
          ? 'This permanently removes all tasks and generated briefs from your account across devices. Export anything you want to keep first. Downloaded files are unaffected.'
          : 'This removes all tasks and generated briefs from this device. Any files you downloaded will stay where you saved them.'
      }
    >
      <div className="confirmation-actions">
        <button className="button-secondary" onClick={() => onOpenChange(false)}>
          Keep my tasks
        </button>
        <button
          className="button-danger"
          onClick={() => {
            onClear();
            onOpenChange(false);
          }}
        >
          Clear history
        </button>
      </div>
    </Modal>
  );
}

function NavItem({
  icon: Icon,
  active,
  label,
  count,
  onClick,
}: {
  icon: LucideIcon;
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={1.7} />
      <span>{label}</span>
      {!!count && <span className="nav-count tnum">{count}</span>}
    </button>
  );
}
function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const Icon = kindIcons[task.kind];
  return (
    <button className="task-row" onClick={onClick}>
      <span className={`task-row-icon ${task.kind}`}>
        <Icon size={19} strokeWidth={1.5} />
      </span>
      <span className="task-row-copy">
        <strong>{task.title}</strong>
        <small>
          {new Date(task.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
          })}
          <span>·</span>Demo task
        </small>
      </span>
      <span className={`status-label ${task.status}`}>
        <span className={`task-dot ${task.status}`} />
        {pendingDraft(task.draft) ? 'AI draft in progress' : statusLabels[task.status]}
      </span>
      <ChevronRight size={16} />
    </button>
  );
}
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="empty-state glass-strong">
      <span className="empty-icon">
        <Icon size={28} strokeWidth={1.3} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <button className="button-primary" onClick={onAction}>
        {action}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}
function WorkflowArt({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="workflow-art" aria-hidden="true">
      <div className="art-halo" />
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <motion.div
        className="art-card art-idea glass-strong"
        animate={reduceMotion ? {} : { y: [0, -5, 0], rotate: [-8, -6, -8] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="art-card-top">
          <span>
            <Sparkles size={13} />
          </span>
          <i />
          <MoreHorizontal size={13} />
        </div>
        <div className="art-line long" />
        <div className="art-line" />
        <div className="art-line short" />
        <span className="art-card-label">A little idea</span>
      </motion.div>
      <div className="art-connector">
        <span />
        <span />
        <span />
      </div>
      <div className="art-core">
        <MrAIMark size={39} />
      </div>
      <motion.div
        className="art-card art-done glass-strong"
        animate={reduceMotion ? {} : { y: [0, 5, 0], rotate: [7, 5, 7] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="art-card-top">
          <span>
            <FileText size={13} />
          </span>
          <i />
          <Check size={13} />
        </div>
        <div className="art-line long" />
        <div className="art-line" />
        <div className="art-check-line">
          <Check size={10} />
          <div className="art-line short" />
        </div>
        <span className="art-card-label">Something real</span>
      </motion.div>
      <span className="art-spark spark-one">✧</span>
      <span className="art-spark spark-two">✳</span>
    </div>
  );
}

function TaskView({
  gateway,
  task,
  onStatus,
  onBack,
  onDownload,
  onCopy,
  onNew,
}: {
  gateway: GatewayControls;
  task: Task;
  onStatus: (status: TaskStatus) => void;
  onBack: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onNew: () => void;
}) {
  const route = previewRoute(task.prompt, task.mode);
  const complete = task.status === 'completed';
  const running = task.status === 'running';
  const aiComplete = task.draft?.status === 'succeeded';
  const aiPending = pendingDraft(task.draft);
  return (
    <section className="task-detail">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={15} />
        All tasks
      </button>
      <div className="task-title-row">
        <span className={`status-label ${task.status}`}>
          <span className={`task-dot ${task.status}`} />
          {aiPending ? 'AI draft in progress' : statusLabels[task.status]}
        </span>
        <span className="task-type-label">
          {aiComplete ? 'AI DRAFT' : aiPending ? 'CONNECTED AI' : 'LOCAL DEMO'}
        </span>
      </div>
      <h1>{task.title}</h1>
      <p className="task-prompt">{task.prompt}</p>
      <div className={`task-detail-grid ${complete ? 'has-document' : ''}`}>
        <div className="task-primary">
          {complete ? (
            <div className="document-card glass-strong">
              <div className="document-toolbar">
                <span>
                  <FileText size={17} />
                  Your brief
                  <span className="neutral-pill">
                    {aiComplete ? 'AI draft · review needed' : 'Demo template'}
                  </span>
                </span>
                <div>
                  <button className="icon-button" aria-label="Copy brief" onClick={onCopy}>
                    <Copy size={16} />
                  </button>
                  <button className="button-primary compact" onClick={onDownload}>
                    <ArrowDownToLine size={15} />
                    Save .md
                  </button>
                </div>
              </div>
              <DocumentPreview markdown={documentFor(task)} />
            </div>
          ) : (
            <div className="plan-card glass-strong">
              <div className="plan-intro">
                <span className="plan-mrai">
                  <MrAIMark size={25} />
                </span>
                <div>
                  <h2>
                    {task.status === 'cancelled'
                      ? 'A little room for a fresh start.'
                      : running
                        ? 'Bringing it together.'
                        : task.status === 'paused'
                          ? 'Right where you left off.'
                          : 'A little structure goes a long way.'}
                  </h2>
                  <p>
                    {task.status === 'cancelled'
                      ? 'This demo was cancelled. Start a new task whenever you are ready.'
                      : 'Here is a simple plan for your request.'}
                  </p>
                </div>
              </div>
              <ol className="plan-steps">
                {stepsFor(task.kind).map((step, i) => (
                  <li
                    key={step}
                    className={task.step > i ? 'done' : running && task.step === i ? 'current' : ''}
                  >
                    <span className="step-indicator">
                      {task.step > i ? (
                        <Check size={15} />
                      ) : running && task.step === i ? (
                        <LoaderCircle size={15} className="spin" />
                      ) : (
                        `0${i + 1}`
                      )}
                    </span>
                    <div>
                      <strong>{step}</strong>
                      <p>
                        {task.step > i
                          ? 'Done in the local demo'
                          : running && task.step === i
                            ? 'Preparing the template…'
                            : 'A bounded step, ready for your review'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="plan-footer">
                <p>
                  <ShieldCheck size={14} />
                  Local templates only. No live research or file changes.
                </p>
                <div>
                  {task.status === 'cancelled' ? (
                    <button className="button-primary" onClick={onNew}>
                      New task
                      <Plus size={15} />
                    </button>
                  ) : running ? (
                    <>
                      <button className="button-secondary" onClick={() => onStatus('cancelled')}>
                        <Square size={13} />
                        Cancel
                      </button>
                      <button className="button-primary" onClick={() => onStatus('paused')}>
                        <Pause size={15} />
                        Pause
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="plan-cost">
                        API cost <strong>₹0</strong>
                      </span>
                      <button
                        className="button-primary"
                        disabled={aiPending}
                        onClick={() => onStatus('running')}
                      >
                        <Play size={15} />
                        {task.status === 'paused' ? 'Resume demo' : 'Run demo'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          {complete && (
            <div className="completion-note">
              <CheckCheck size={17} />
              <span>
                {aiComplete
                  ? 'Your AI draft is ready. Review the evidence and assumptions before sharing.'
                  : 'Your demo brief is ready. Make it your own, then keep it.'}
              </span>
            </div>
          )}
        </div>
        <aside className="task-context">
          <DraftPanel task={task} gateway={gateway} />
          <div className="context-card glass">
            <span className="context-heading">
              <SlidersHorizontal size={15} />
              Task details
            </span>
            <div className="context-row">
              <span>Mode</span>
              <strong>{modeLabels[task.mode]}</strong>
            </div>
            <div className="context-row">
              <span>Execution</span>
              <strong>{aiComplete ? 'AI draft' : aiPending ? 'Draft pending' : 'Demo'}</strong>
            </div>
            <div className="context-row">
              <span>API cost</span>
              <strong>
                {task.draft?.costUsdMicros != null
                  ? usd(task.draft.costUsdMicros)
                  : task.draft
                    ? 'Unknown'
                    : '₹0'}
              </strong>
            </div>
            <div className="context-row">
              <span>Output</span>
              <strong>Markdown</strong>
            </div>
          </div>
          <details className="context-card router-card glass">
            <summary>
              <Zap size={15} />
              <span>Routing preview</span>
              <ChevronDown size={13} />
            </summary>
            <span className="route-tier">{route.tier}</span>
            <p>{route.reason}</p>
            <p className="router-note">
              Auto balances everyday work and deeper planning. Your selected model is shown before
              sending. Jev is not connected; paid calls are never automatically retried.
            </p>
          </details>
          <div className="context-note">
            <ShieldCheck size={15} />
            <p>
              {complete
                ? 'This is a starting framework. Sources and findings still need to be researched.'
                : 'You can pause or cancel at any time. This demo works entirely on your device.'}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
