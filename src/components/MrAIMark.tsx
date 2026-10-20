export function MrAIMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11" fill="var(--primary-700)" />
      <rect
        x="1.5"
        y="1.5"
        width="37"
        height="37"
        rx="10.5"
        stroke="var(--on-fill)"
        strokeOpacity="0.2"
      />
      <path
        d="M10 28.5V12.5L20 24l10-11.5v16"
        stroke="var(--on-fill)"
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m31 4 1.3 2.7L35 8l-2.7 1.3L31 12l-1.3-2.7L27 8l2.7-1.3Z"
        fill="var(--brand-accent)"
      />
    </svg>
  );
}
