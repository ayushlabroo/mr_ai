import { expect, it, vi } from 'vitest';
import { releaseDownloads, downloadsResponse } from '../../gateway/downloads.mjs';

const asset = (suffix) => ({
  name: `MrAI-0.1.0-${suffix}`,
  state: 'uploaded',
  size: 100_000,
  digest: `sha256:${'a'.repeat(64)}`,
  browser_download_url: `https://github.com/ayushlabroo/mr_ai/releases/download/v0.1.0/MrAI-0.1.0-${suffix}`,
});
const release = {
  tag_name: 'v0.1.0',
  draft: false,
  prerelease: false,
  assets: [asset('mac-arm64.dmg'), asset('mac-x64.dmg'), asset('win-x64.exe')],
};

it('offers only uploaded, checksummed installers from the MrAI repository', () => {
  expect(releaseDownloads(release).assets.map((item) => item.id)).toEqual([
    'mac-arm64',
    'mac-x64',
    'win-x64',
  ]);
  for (const update of [
    { browser_download_url: 'https://attacker.example/MrAI.exe' },
    { browser_download_url: 'https://github.com/other/repo/releases/download/v0.1.0/app.exe' },
    { digest: undefined },
    { state: 'new' },
    { size: 0 },
  ])
    expect(
      releaseDownloads({ ...release, assets: [{ ...asset('win-x64.exe'), ...update }] }).assets,
    ).toEqual([]);
});

it('does not turn draft, prerelease, missing, or malformed releases into downloads', () => {
  for (const value of [
    null,
    {},
    { ...release, draft: true },
    { ...release, prerelease: true },
    { ...release, assets: {} },
  ])
    expect(releaseDownloads(value).assets).toEqual([]);
});

it('checks a fixed public endpoint without credentials and caches the catalog', async () => {
  const fetcher = vi.fn(async () => Response.json(release));
  const response = await downloadsResponse(
    new Request('https://mrai.example/api/downloads'),
    fetcher,
  );
  expect((await response.json()).assets).toHaveLength(3);
  expect(response.headers.get('cache-control')).toContain('s-maxage=300');
  expect(fetcher.mock.calls[0][0]).toBe(
    'https://api.github.com/repos/ayushlabroo/mr_ai/releases/latest',
  );
  expect(fetcher.mock.calls[0][1].headers.authorization).toBeUndefined();
});

it('handles an unpublished release and GitHub failures without inventing download links', async () => {
  const input = new Request('https://mrai.example/api/downloads');
  const missing = await downloadsResponse(input, async () => new Response('', { status: 404 }));
  expect(await missing.json()).toEqual({ version: null, assets: [] });
  const failed = await downloadsResponse(input, async () => {
    throw new Error('private upstream details');
  });
  expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain('private upstream details');
});
