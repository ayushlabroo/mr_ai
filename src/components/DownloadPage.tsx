import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Apple, Globe2, Monitor, ShieldCheck } from 'lucide-react';
import { MrAIMark } from './MrAIMark';

type Asset = { id: string; url: string; size: number; sha256: string };
type Catalog = { version: string | null; assets: Asset[]; unavailable?: boolean };
const empty: Catalog = { version: null, assets: [] };

export function DownloadPage() {
  const [catalog, setCatalog] = useState<Catalog>(empty);
  const [loading, setLoading] = useState(window.location.protocol !== 'file:');
  const workspace = window.location.protocol === 'file:' ? './index.html' : '/';
  useEffect(() => {
    if (window.location.protocol === 'file:') return;
    const controller = new AbortController();
    void fetch('/api/downloads', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Release unavailable');
        const data = (await response.json()) as Catalog;
        if (!Array.isArray(data.assets)) throw new Error('Invalid release');
        setCatalog({
          version:
            typeof data.version === 'string' && /^\d+\.\d+\.\d+$/.test(data.version)
              ? data.version
              : null,
          assets: data.assets.filter(
            (asset) =>
              ['mac-arm64', 'mac-x64', 'win-x64'].includes(asset.id) &&
              /^https:\/\/github\.com\/ayushlabroo\/mr_ai\/releases\/download\/v\d+\.\d+\.\d+\/MrAI-[A-Za-z0-9.\-]+\.(dmg|exe)$/.test(
                asset.url,
              ) &&
              /^[a-f0-9]{64}$/.test(asset.sha256) &&
              Number.isSafeInteger(asset.size) &&
              asset.size > 0,
          ),
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ ...empty, unavailable: true });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function download(id: string, label: string) {
    const asset = catalog.assets.find((item) => item.id === id);
    return asset ? (
      <a className="button-primary download-action" href={asset.url}>
        <ArrowDownToLine size={16} />
        {label}
        <span>{Math.round(asset.size / 1024 / 1024)} MB</span>
      </a>
    ) : (
      <button className="button-secondary download-action" disabled>
        <ArrowDownToLine size={16} />
        {label}
        <span>{loading ? 'Checking…' : 'Coming soon'}</span>
      </button>
    );
  }

  return (
    <main className="download-page">
      <div className="app-field" aria-hidden="true" />
      <nav className="download-nav glass" aria-label="Main navigation">
        <a href={workspace} className="download-brand" aria-label="MrAI by Ayush home">
          <MrAIMark size={36} />
          <span>
            MrAI<small>by Ayush</small>
          </span>
        </a>
        <a href={workspace} className="button-secondary">
          Open web workspace
          <ArrowRight size={16} />
        </a>
      </nav>
      <section className="download-intro">
        <span className="download-eyebrow">
          <span />
          MrAI for desktop
        </span>
        <h1>
          A little space.
          <br />
          On every screen.
        </h1>
        <p>
          Start in your browser. Bring MrAI to your desktop when you want a dedicated place for your
          work.
        </p>
        <a className="download-web-link" href={workspace}>
          <Globe2 size={17} />
          Use the web preview
          <ArrowRight size={15} />
        </a>
      </section>
      <section className="download-grid" aria-label="Desktop downloads">
        <article className="download-card glass-raised">
          <div className="download-platform-icon">
            <Apple size={28} />
          </div>
          <h2>MrAI for macOS</h2>
          <p>A familiar home on your Mac, with native folder and export dialogs.</p>
          <div className="download-choices">
            {download('mac-arm64', 'Apple Silicon')}
            {download('mac-x64', 'Intel Mac')}
          </div>
        </article>
        <article className="download-card glass-raised">
          <div className="download-platform-icon download-windows">
            <Monitor size={28} />
          </div>
          <h2>MrAI for Windows</h2>
          <p>Your own desktop workspace, with the same calm interface and document previews.</p>
          <div className="download-choices">{download('win-x64', 'Windows x64')}</div>
        </article>
      </section>
      <section className="download-note glass-strong" aria-live="polite">
        <ShieldCheck size={21} />
        <div>
          <strong>
            {catalog.assets.length
              ? `Desktop preview · ${catalog.version}`
              : 'Desktop releases are being prepared'}
          </strong>
          <p>
            {catalog.assets.length
              ? 'These early builds are unsigned. Your operating system may show an installation warning. Use the web preview if you prefer.'
              : catalog.unavailable
                ? 'We could not check desktop availability. The web preview is still available.'
                : 'Download buttons become available when a desktop release is published. You can use the web preview now.'}
          </p>
        </div>
      </section>
      <footer className="download-footer">
        <span>MrAI by Ayush</span>
        <span>
          Desktop previews use local history. Cloud accounts are available on the website.
        </span>
      </footer>
    </main>
  );
}
