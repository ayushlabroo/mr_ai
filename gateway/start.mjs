import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { configFromEnv } from './config.mjs';
import { Ledger, acquireGatewayLock } from './ledger.mjs';
import { createGateway } from './service.mjs';
import { makeProviderCaller } from './providers.mjs';
import { createGatewayHttpServer } from './http.mjs';

let config;
try {
  config = configFromEnv(process.env);
} catch (error) {
  console.error(`MrAI gateway configuration: ${error.message}`);
  process.exit(1);
}
const port = Number(process.env.AYRA_GATEWAY_PORT ?? 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid gateway port.');
const dataDirectory = path.resolve('.data');
mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
chmodSync(dataDirectory, 0o700);
const filename = path.join(dataDirectory, 'gateway.sqlite');
const ownership = acquireGatewayLock(path.join(dataDirectory, 'gateway-owner.sqlite'));
const ledger = new Ledger(filename);
chmodSync(filename, 0o600);
const gateway = createGateway({ config, ledger, callProvider: makeProviderCaller(config.keys) });
const server = createGatewayHttpServer({ gateway, port });
server.listen(port, '127.0.0.1', () =>
  console.log(
    `MrAI single-user development gateway: http://127.0.0.1:${port}. Live calls ${config.liveEnabled ? 'enabled' : 'disabled'}.`,
  ),
);
server.on('error', () => {
  console.error('MrAI could not open its local gateway port.');
  process.exitCode = 1;
  ledger.close();
  ownership.close();
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    gateway.shutdown();
    server.close(() => process.exit(0));
  });
