# Desktop preview releases

MrAI's primary experience is the web workspace. `/download` offers Windows x64,
Apple Silicon Mac, and Intel Mac companions when real installers are published.
They currently run local demo workflows; account sync and hosted AI are not ready.

## Build a reviewable release

The manual **Build desktop preview installers** workflow in GitHub Actions builds
all three targets into a **draft** release. Pushes do not trigger it. It uses
standard GitHub-hosted runners only in this public repository and uploads directly
to the draft release rather than Actions artifact storage. Do not change to
private-repository or larger runners without checking cost eligibility first.

1. Push the source to `ayushlabroo/mr_ai` and open its Actions tab.
2. Select **Build desktop preview installers**, then run it from `main`.
3. Inspect all three job results and the draft release for the package version.
4. Download and test each installer on its target OS. Verify app launch, demo
   creation, export, restart, uninstall, and absence of bundled credentials.
5. Publish the draft only after those checks pass. Do not mark it a prerelease:
   the catalog intentionally lists only a published stable-tagged release.

The first workflow run and all installers remain unverified. A successful build
alone does not verify installation or Windows runtime behavior. These previews
are unsigned; macOS builds are not notarized. OS reputation/security warnings
are expected. Signed distribution is a later milestone requiring separate review
of costs and credentials. Do not weaken OS security to distribute the preview.

## How the website finds installers

`GET /api/downloads` reads the fixed public GitHub `releases/latest` endpoint
without authentication or provider credentials. It accepts uploaded assets with
positive sizes and GitHub SHA-256 digests, matching these exact names and URLs:

- `MrAI-<version>-mac-arm64.dmg`
- `MrAI-<version>-mac-x64.dmg`
- `MrAI-<version>-win-x64.exe`

The release tag must be `v<version>`, such as `v0.1.0`. Drafts, prereleases,
unrelated URLs, missing digests, and missing assets never become download links.
Published assets can take five minutes to appear because the catalog is cached.
No published release shows **Coming soon**; catalog failures show a retry message.

Changing platform provider keys never requires rebuilding installers: the planned
shared backend owns those keys. Until authenticated hosted transport exists, do
not embed founder keys or distribute a shared development token in these builds.

References: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[electron-builder](https://github.com/electron-userland/electron-builder).
