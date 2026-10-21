import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import App from '../App';
import { MrAIMark } from './MrAIMark';
import { CloudError, cloudRequest, cloudSnapshot, WorkspaceSaver } from '../lib/cloud';
import type { CloudUser } from '../lib/cloud';
import type { Task } from '../lib/tasks';

function SignIn({
  available,
  notice,
  onUser,
}: {
  available: boolean;
  notice: string;
  onUser: (user: CloudUser) => void;
}) {
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !available) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      const result = await cloudRequest('account', {
        action: signup ? 'signup' : 'login',
        email: fields.get('email'),
        password: fields.get('password'),
      });
      form.reset();
      if (result.user) onUser(result.user);
      else setMessage(result.message ?? 'Check your email, then sign in.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach your account.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-section" aria-label="Cloud account">
      <h3>{signup ? 'Create your account' : 'Your cloud workspace'}</h3>
      <p>
        Sign in to save new tasks and documents across browsers. Existing local history stays on
        this device.
      </p>
      {!available && <p role="status">{notice}</p>}
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
            disabled={!available || busy}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            minLength={8}
            maxLength={256}
            required
            disabled={!available || busy}
          />
        </label>
        <button className="button-primary" disabled={!available || busy}>
          {busy ? 'Connecting…' : signup ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setMessage('');
          }}
        >
          {signup ? 'Already have an account? Sign in' : 'Create an account'}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}

function CloudApp({ user, onSignOut }: { user: CloudUser; onSignOut: () => void }) {
  const [snapshot, setSnapshot] = useState<{ tasks: Task[]; revision: number } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [message, setMessage] = useState('Saved to your account.');
  const [busy, setBusy] = useState(false);
  const saver = useRef<WorkspaceSaver | null>(null);
  useEffect(() => {
    let active = true;
    void cloudRequest('workspace')
      .then((data) => {
        if (active) setSnapshot(cloudSnapshot(data));
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : 'Cloud workspace unavailable.');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    const instance = new WorkspaceSaver(
      snapshot.tasks,
      snapshot.revision,
      (tasks, revision) => cloudRequest('workspace', { tasks, revision }, 'PUT'),
      (next, text) => {
        setState(next);
        setMessage(text);
      },
    );
    saver.current = instance;
    return () => {
      instance.dispose();
      saver.current = null;
    };
  }, [snapshot]);
  useEffect(() => {
    if (state === 'saved') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);
  const changed = useCallback((tasks: Task[]) => {
    // Child effects can run before the parent's effects. Keep the first change
    // until the saver is initialized, rather than dropping that edit.
    if (saver.current) saver.current.update(tasks);
    else queueMicrotask(() => saver.current?.update(tasks));
  }, []);
  async function logout() {
    if (busy || state !== 'saved') return;
    setBusy(true);
    try {
      await cloudRequest('account', { action: 'logout' });
      onSignOut();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign out failed.');
    } finally {
      setBusy(false);
    }
  }
  const panel = (
    <section className="account-section" aria-label="Cloud account">
      <h3>Signed in</h3>
      <p>{user.email}</p>
      <p role="status">{message}</p>
      {state === 'error' && (
        <p>
          Keep this page open and export any unsaved documents. Reloading fetches the latest cloud
          copy and discards unsaved edits.
        </p>
      )}
      <button
        className="button-secondary"
        disabled={busy || state !== 'saved'}
        onClick={() => void logout()}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  );
  if (!snapshot)
    return (
      <div className="account-loading">
        <MrAIMark />
        <h1>{loadError ? 'Your workspace could not load' : 'Opening your workspace…'}</h1>
        <p role="status">{loadError || 'Retrieving your saved tasks and documents.'}</p>
        {loadError && (
          <button className="button-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
        {panel}
      </div>
    );
  return (
    <App
      initialTasks={snapshot.tasks}
      onTasksChange={changed}
      accountPanel={panel}
      cloudEmail={user.email}
      cloudMessage={message}
    />
  );
}

export function AccountWorkspace() {
  const [user, setUser] = useState<CloudUser | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState(
    'Cloud accounts are not connected yet. Local demos remain available.',
  );
  const eligible = !window.ayra && window.location.protocol === 'https:';
  useEffect(() => {
    // Confirmation emails may return an implicit-flow token fragment. We use
    // explicit password sign-in and HttpOnly sessions, so never retain it in URL.
    if (eligible && /(?:^#|&)access_token=/.test(window.location.hash))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!eligible) {
      setReady(true);
      return;
    }
    let active = true;
    void cloudRequest('account')
      .then((data) => {
        if (!active) return;
        setAvailable(true);
        setUser(data.user);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(
            error instanceof CloudError
              ? error.message
              : 'Cloud accounts could not be reached. Local demos remain available.',
          );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [eligible]);
  // Periodically refresh the HttpOnly session through the same-origin API.
  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(
      () => {
        void cloudRequest('account').catch(() => {});
      },
      15 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user]);
  if (!ready)
    return (
      <div className="account-loading">
        <MrAIMark />
        <p>Opening MrAI…</p>
      </div>
    );
  if (user) return <CloudApp key={user.id} user={user} onSignOut={() => setUser(null)} />;
  return (
    <App
      key="local"
      accountPanel={
        <SignIn
          available={available}
          notice={
            eligible
              ? notice
              : 'Cloud sign-in is available on the hosted website. This app keeps local demo history.'
          }
          onUser={setUser}
        />
      }
    />
  );
}
