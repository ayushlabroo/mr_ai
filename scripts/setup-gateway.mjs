import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';

if (existsSync('.env.gateway') || existsSync('.env.desktop')) {
  console.error('Existing gateway or desktop configuration found. No files were overwritten.');
  process.exit(1);
}
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const gateway = readFileSync('.env.gateway.example', 'utf8').replace(
  'REPLACE_WITH_SHA256_HEX_DIGEST',
  hash,
);
let wroteGateway = false;
try {
  writeFileSync('.env.gateway', gateway, { mode: 0o600, flag: 'wx' });
  wroteGateway = true;
  writeFileSync(
    '.env.desktop',
    `# Local native gateway connection. Keep this file private.\nAYRA_GATEWAY_URL=http://127.0.0.1:4318\nAYRA_GATEWAY_TOKEN=${token}\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log(
    'Created .env.gateway and .env.desktop with private file permissions. No credentials were printed. Live calls are disabled and no providers are configured.',
  );
} catch {
  if (wroteGateway) unlinkSync('.env.gateway');
  console.error('Could not create the configuration pair. No existing files were overwritten.');
  process.exitCode = 1;
}
