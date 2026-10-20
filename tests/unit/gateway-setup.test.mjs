import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

it('creates a private matching credential pair without printing tokens or overwriting it', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'ayra-setup-'));
  const root = fileURLToPath(new URL('../../', import.meta.url));
  copyFileSync(
    path.join(root, '.env.gateway.example'),
    path.join(directory, '.env.gateway.example'),
  );
  const script = path.join(root, 'scripts/setup-gateway.mjs');
  const options = { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
  try {
    const output = execFileSync(process.execPath, [script], options);
    const desktop = readFileSync(path.join(directory, '.env.desktop'), 'utf8');
    const gateway = readFileSync(path.join(directory, '.env.gateway'), 'utf8');
    const token = desktop.match(/^AYRA_GATEWAY_TOKEN=(.+)$/m)[1];
    expect(gateway).toContain(
      `AYRA_CLIENT_TOKEN_SHA256=${createHash('sha256').update(token).digest('hex')}`,
    );
    expect(gateway).not.toContain(`AYRA_GATEWAY_TOKEN=${token}`);
    expect(output).not.toContain(token);
    expect(gateway).toContain('AYRA_LIVE_ENABLED=false');
    expect(statSync(path.join(directory, '.env.desktop')).mode & 0o777).toBe(0o600);
    expect(statSync(path.join(directory, '.env.gateway')).mode & 0o777).toBe(0o600);
    expect(() => execFileSync(process.execPath, [script], options)).toThrow();
    expect(readFileSync(path.join(directory, '.env.desktop'), 'utf8')).toBe(desktop);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
