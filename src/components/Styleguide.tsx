import { useEffect, useRef, useState } from 'react';

const checks = [
  { cls: 'neu-raised', prop: 'box-shadow', valid: (v: string) => v !== 'none' },
  { cls: 'glass', prop: 'backdrop-filter', valid: (v: string) => v.includes('blur') },
  { cls: 'glass-strong', prop: 'box-shadow', valid: (v: string) => v !== 'none' },
  { cls: 'glass-raised', prop: 'box-shadow', valid: (v: string) => v !== 'none' },
  { cls: 'glass-menu', prop: 'backdrop-filter', valid: (v: string) => v.includes('blur') },
  {
    cls: 'app-field',
    prop: 'background-image',
    valid: (v: string) => v.includes('radial-gradient'),
  },
  { cls: 'tnum', prop: 'font-variant-numeric', valid: (v: string) => v === 'tabular-nums' },
  {
    cls: 'duration-fast',
    prop: 'transition-duration',
    valid: (v: string) =>
      v === '0.18s' ||
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches && parseFloat(v) < 0.01),
  },
  {
    cls: 'bg-surface-base',
    prop: 'background-color',
    valid: (v: string) => v !== 'rgba(0, 0, 0, 0)',
  },
];
const pairs = [
  { fg: '--ink-600', bg: '--surface-base', pass: true },
  { fg: '--ink-500', bg: '--surface-base', pass: false },
  { fg: '--primary-600', bg: '--surface-base', pass: false },
  { fg: '--primary-700', bg: '--surface-base', pass: true },
  { fg: '--on-fill', bg: '--primary-600', pass: true },
  { fg: '--accent', bg: '--surface-base', pass: false },
  { fg: '--success-ink', bg: '--success-bg', pass: true },
  { fg: '--accent-ink', bg: '--accent-pale', pass: true },
  { fg: '--on-fill', bg: '--danger', pass: true },
];

function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function Styleguide() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [canaries, setCanaries] = useState<{ cls: string; value: string; ok: boolean }[]>([]);
  const [contrasts, setContrasts] = useState<
    { fg: string; bg: string; ratio: number; pass: boolean; ok: boolean }[]
  >([]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCanaries(
        checks.map((check) => {
          const probe = rootRef.current!.querySelector(`[data-canary="${check.cls}"]`)!;
          const value = getComputedStyle(probe).getPropertyValue(check.prop).trim();
          return { cls: check.cls, value, ok: !!value && check.valid(value) };
        }),
      );
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      const probe = document.createElement('span');
      rootRef.current!.append(probe);
      function resolve(token: string) {
        probe.style.color = `var(${token})`;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(probe).color;
        context.fillRect(0, 0, 1, 1);
        return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
      }
      setContrasts(
        pairs.map((pair) => {
          const foreground = luminance(resolve(pair.fg)),
            background = luminance(resolve(pair.bg));
          const ratio =
            (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
          return { ...pair, ratio, ok: ratio >= 4.5 === pair.pass };
        }),
      );
      probe.remove();
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <main className="styleguide" ref={rootRef}>
      <div className="app-field" aria-hidden="true" />
      <h1>MrAI design system</h1>
      <p>Blue + warm peach. Soft surfaces, glass, and clear reading contrast.</p>
      <section data-sg-section="surfaces">
        <h2>Surface behavior</h2>
        <div className="styleguide-samples">
          <div className="neu-raised">Raised on ambient</div>
          <div className="glass">Glass chrome</div>
          <div className="glass-strong">Reading surface</div>
          <div className="glass-raised">Glass over soft UI</div>
        </div>
        <div className="on-white">
          <p>On white, the light shadow should recede.</p>
          <div className="styleguide-samples">
            <div className="neu-raised" style={{ background: 'var(--white)' }}>
              White ambient control
            </div>
          </div>
        </div>
      </section>
      <section
        data-sg-section="contrast"
        data-contrast-surprises={
          contrasts.length ? contrasts.filter((row) => !row.ok).length : 'pending'
        }
      >
        <h2>Real contrast</h2>
        <table>
          <thead>
            <tr>
              <th>Foreground / surface</th>
              <th>Ratio</th>
              <th>Expected</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {contrasts.map((row) => (
              <tr key={row.fg + row.bg}>
                <td>
                  {row.fg} / {row.bg}
                </td>
                <td>{row.ratio.toFixed(2)}:1</td>
                <td>{row.pass ? 'Pass' : 'Fill only'}</td>
                <td>{row.ok ? 'As designed' : 'Unexpected'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section
        data-canary-failures={
          canaries.length ? canaries.filter((row) => !row.ok).length : 'pending'
        }
      >
        <h2>Computed utilities</h2>
        {canaries.map((row) => (
          <p key={row.cls}>
            {row.cls}: {row.ok ? 'OK' : `FAILED (${row.value})`}
          </p>
        ))}
      </section>
      <div className="canary-probes" aria-hidden="true">
        <div data-canary="neu-raised" className="neu-raised" />
        <div data-canary="glass" className="glass" />
        <div data-canary="glass-strong" className="glass-strong" />
        <div data-canary="glass-raised" className="glass-raised" />
        <div data-canary="glass-menu" className="glass-menu" />
        <div data-canary="app-field" className="app-field" />
        <div data-canary="tnum" className="tnum" />
        <div data-canary="duration-fast" className="duration-fast" />
        <div data-canary="bg-surface-base" className="bg-surface-base" />
      </div>
    </main>
  );
}
