import { spawn } from 'node:child_process';
import electron from 'electron';

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    DEEPSEEK_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    AYRA_DEV_URL: undefined,
  },
});
child.on('error', () => {
  console.error('MrAI could not start Electron.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill());
