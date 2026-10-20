const API = 'https://api.github.com/repos/ayushlabroo/mr_ai/releases/latest';
export const downloadTargets = [
  { id: 'mac-arm64', suffix: 'mac-arm64.dmg' },
  { id: 'mac-x64', suffix: 'mac-x64.dmg' },
  { id: 'win-x64', suffix: 'win-x64.exe' },
];

export function releaseDownloads(release) {
  if (
    !release ||
    release.draft ||
    release.prerelease ||
    !/^v\d+\.\d+\.\d+$/.test(release.tag_name ?? '')
  )
    return { version: null, assets: [] };
  const version = release.tag_name.slice(1);
  const prefix = `https://github.com/ayushlabroo/mr_ai/releases/download/${release.tag_name}/`;
  const assets = downloadTargets.flatMap((target) => {
    const name = `MrAI-${version}-${target.suffix}`;
    const asset = Array.isArray(release.assets)
      ? release.assets.find((item) => item && item.name === name && item.state === 'uploaded')
      : undefined;
    if (
      !asset ||
      !Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.browser_download_url !== `${prefix}${name}` ||
      !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '')
    )
      return [];
    return [
      {
        id: target.id,
        url: asset.browser_download_url,
        size: asset.size,
        sha256: asset.digest.slice(7),
      },
    ];
  });
  return { version, assets };
}

export async function downloadsResponse(request, fetcher = fetch) {
  const headers = {
    'cache-control': 'public, max-age=0, s-maxage=300',
    'x-content-type-options': 'nosniff',
  };
  if (request.method !== 'GET')
    return Response.json(
      { error: 'METHOD_NOT_ALLOWED' },
      { status: 405, headers: { ...headers, allow: 'GET' } },
    );
  try {
    const response = await fetcher(API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'MrAI-download-catalog' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) {
      await response.body?.cancel();
      return Response.json({ version: null, assets: [] }, { headers });
    }
    if (!response.ok) throw new Error('Release catalog unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No release catalog');
    const chunks = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 200_000) {
        await reader.cancel();
        throw new Error('Release catalog too large');
      }
      chunks.push(Buffer.from(value));
    }
    return Response.json(releaseDownloads(JSON.parse(Buffer.concat(chunks).toString('utf8'))), {
      headers,
    });
  } catch {
    return Response.json(
      { version: null, assets: [], unavailable: true },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
