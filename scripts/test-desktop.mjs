import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);

async function main() {
  // Listing tests does not launch Electron and needs no runtime preflight.
  if (!args.includes('--list')) {
    if (!existsSync(new URL('../dist/index.html', import.meta.url))) {
      console.error('Build first with npm run build. Electron was not launched.');
      process.exitCode = 1;
      return;
    }
    // Playwright's Electron inspector requires local debugging sockets even
    // when aster://app serves the UI without Vite. Probe with Node, not Electron:
    // known restricted environments then fail without producing crash dialogs.
    const probe = createServer();
    try {
      await new Promise((resolve, reject) => {
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
          probe.close((error) => (error ? reject(error) : resolve()));
        });
      });
    } catch (error) {
      console.error(
        `Native verification cannot open a local debugging socket (${error.code ?? 'unknown error'}). Electron was not launched; native tests have not passed.`,
      );
      process.exitCode = 1;
      return;
    }
  }
  const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
  const child = spawn(
    process.execPath,
    [cli, 'test', '--config', 'playwright.desktop.config.ts', ...args],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  child.once('error', () => {
    console.error('Native verification could not start Playwright.');
    process.exitCode = 1;
  });
  child.once('exit', (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
}

await main();
