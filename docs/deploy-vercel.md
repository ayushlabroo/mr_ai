# GitHub → Vercel preview

Repository: https://github.com/ayushlabroo/mr_ai

Deployed preview: https://mr-ai-lac.vercel.app

The first deployment completed from `main` commit `0bee284` on Vercel Hobby.
Safari verification covered task planning, demo completion, Markdown download,
and the download page showing unavailable installers. The health response
reports `deployment-preview` and `liveEnabled: false`.

This first deployment publishes the existing browser demo and a small Node.js
preview API. It does not deploy Electron, enable model inference, or move the
development SQLite ledger into a serverless function. No Supabase project or
provider credentials are needed to deploy the demo.

## Import the repository

1. Sign in at https://vercel.com/new and choose your personal **Hobby** account.
2. Import `ayushlabroo/mr_ai` from GitHub. If it is missing, grant the GitHub
   integration access to that repository only.
3. Use repository root `./` and framework **Vite**. `vercel.json` supplies:
   - Install: `ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci`
   - Build: `npm run build`
   - Output: `dist`
4. Use Node.js **24.x**. Leave environment variables empty for this preview.
5. Deploy using the included `vercel.app` address. Do not select a Pro trial,
   enter card details, buy a domain, or install paid Marketplace integrations.

Once connected, Vercel's Git integration deploys updates pushed to `main` and
creates previews for other branches/pull requests. Repository secrets, local
`.env.*` files, `.data/`, generated builds, and Electron binaries must not be
committed. `.gitignore` and `.vercelignore` exclude private/generated files;
Vercel serves only the built `dist` output and bundled function entry points.

## Verify the deployment

Open the provided Vercel URL. Create a demo task, run it, and export its Markdown
document. The browser stores that history locally, and the AI panel stays disabled.

Open `/download` and verify the Windows and Apple Silicon/Intel Mac options.
`/api/downloads` returns an empty catalog until a valid release is published;
buttons remain disabled rather than linking to missing installers. The
[desktop release workflow](desktop-releases.md) prepares installers separately
from the Vercel web deployment. Vercel hosts the web app and API; GitHub hosts
the downloadable binaries.

Open `/api/health` on the same domain. Expect HTTP 200 and:

```json
{
  "service": "MrAI by Ayush",
  "mode": "deployment-preview",
  "liveEnabled": false
}
```

The optional native status route `/v1/status` requires the private
`AYRA_CLIENT_TOKEN_SHA256` backend variable and the corresponding desktop token.
Do not share the development founder token with testers. Without that
configuration the route returns HTTP 503, not an unauthenticated live gateway.
Even with valid credentials, the preview reports no models and rejects
`POST /v1/runs` with `LIVE_DISABLED`. It imports no provider adapter or SQLite
ledger. Provider keys and `AYRA_LIVE_ENABLED=true` cannot enable it.

## Cost boundary

Vercel documents Hobby as a free plan with usage restrictions: an exhausted
allowance generally makes the affected feature unavailable until it resets.
That is different from paid Pro overage billing. Keep this deployment on Hobby
without paid add-ons. The current use must remain eligible for personal,
non-commercial hosting; absence of checkout alone does not establish eligibility.

This preview makes no inference requests, so it creates no model API usage.
Third-party services have independent billing terms and are not covered by a
hosting quota. The user requires no card details and no outstanding bill; do not
enable a service until its billing arrangement satisfies that requirement.

## Before hosted AI drafting

The existing gateway is a single-user loopback process. A shared live gateway
requires authenticated users, a durable shared ledger, atomic global/per-user
budget reservations, and execution/recovery that survives function shutdowns.
Vercel cannot provide the existing ledger's persistent local SQLite filesystem.
Supabase Auth/PostgreSQL is the working candidate for those capabilities. Keys
will remain server-side and managed only by authorized administrators. Live
provider pricing, payment methods, and enforced spending limits still require
verification before any paid call.

References checked on 2026-10-20:

- [Git integration](https://vercel.com/docs/git)
- [Node.js functions](https://vercel.com/docs/functions/runtimes/node-js)
- [Hobby usage limits](https://vercel.com/docs/plans/hobby)
- [Commercial fair use](https://vercel.com/docs/limits/fair-use-guidelines)
- [SQLite limitation](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
