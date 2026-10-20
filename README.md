# MrAI by Ayush

**MrAI by Ayush** is being built as a web SaaS workspace with downloadable
Windows and macOS companions. The current preview turns requests into local plans
and documents, with blue and peach glass surfaces and an original M-shaped mark. The app supports local demos and an optional, authenticated backend for AI
**drafting from your request and pasted notes**. It has no web research tool,
filesystem agent, Jev connection, customer accounts, checkout, or public release.
No live inference has been tested with paid credentials.

## Deploy the browser preview from GitHub

The browser preview is live at **https://mr-ai-lac.vercel.app** on Vercel Hobby.
It contains local demo workflows and the desktop download page; hosted AI,
accounts, and cloud sync remain disabled or unimplemented.

Import `ayushlabroo/mr_ai` into a personal Vercel Hobby project. The included
`vercel.json` builds the Vite browser demo and preview-only API; no provider keys,
Supabase setup, card details, or paid integrations are needed for this first
deployment. [Deployment steps and verification](docs/deploy-vercel.md).

The web workspace links to `/download`, with Windows x64 and Apple Silicon/Intel
Mac options. Buttons become available only for published, checksummed installers
in this repository. A manual GitHub Actions workflow prepares unsigned desktop
previews in a draft release; packaging and Windows runtime checks remain unverified.
See [desktop release instructions](docs/desktop-releases.md).

The preview API has a public `/api/health`
endpoint and an optional authenticated, always-disabled `/v1/status`. It cannot
dispatch model calls, including when a live flag or provider keys are set.
The current metered SQLite gateway is still local development infrastructure;
hosted AI drafting requires a separate durable accounting/auth migration.

## Run the app

Requires **Node.js 24.16 or newer**; macOS remains the verified native development platform. The gateway uses Node's built-in
SQLite module; no database service or new server dependency is needed.

```sh
npm ci
npm run dev
```

This opens Electron and a Vite server at `127.0.0.1:5173`. Quit the app or use
Ctrl+C to stop development. For a browser preview use `npm run dev:web`.

```sh
npm run build
npm start
```

If local servers are unavailable, `npm run preview:file` creates
`.preview/index.html` for Safari. It also creates `styleguide.html` with computed
design checks, and `review.html` with 390px, 768px, and 1440px review frames.
The static browser preview never connects to the model gateway.
`download.html` opens the download page and `review-downloads.html` displays its
390px, 768px, and 1440px review frames.

## Local demos

Choose a starter or describe a task, choose **Create task plan**, review it, then
choose **Run demo**. Demos use local templates and cost no API credits. They do
not research facts or inspect/move files. Output is clearly labelled.

Task search, filters, pause/resume, a document library, Markdown previews, copy,
and export are implemented. Folder selection is ephemeral and grants no agent
access. The native save dialog requires an explicit destination.

The last 30 tasks are stored in local browser storage, not an encrypted vault or
account sync service. Interrupted demo tasks restore as paused. AI request IDs
are retained for status checks without replaying calls. The original prototype's
`aster.tasks.v1` history migrates to `ayra.tasks.v1`, and an explicitly cleared new
history does not resurrect old entries. The native asset origin `aster://app`
and any existing `aster-workspace` data directory are retained for compatibility;
explicit `--user-data-dir` profiles take precedence.

Internal `AYRA_*` configuration names, the native `window.ayra` bridge, and
`ayra.tasks.v1` storage key are retained for compatibility with existing setups.
The displayed product name is **MrAI by Ayush**.

## Configure AI drafting

Provider keys are intended to be managed centrally by authorized administrators.
All supported desktop versions connected to the shared backend will use its active
keys, with rotation performed server-side. Customers receive their own login/session
credentials, not provider keys, and cannot change platform keys. Today the gateway
reads private development environment variables; hosted user authentication and
administrator access controls have not been implemented.

The hosting requirement is no card details and no outstanding usage bill. Use
only a no-card free hosting plan; do not enable paid trials, add-ons, overages,
automatic upgrades, or automatic credit top-ups. Supabase states that its Free
plan is not charged ([cost controls](https://supabase.com/docs/guides/platform/cost-control));
its quota restrictions can follow notifications and a grace period rather than
an instant universal cutoff ([billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)).
The planned hosted gateway must separately deny new paid work before its global
or per-user allowance is exceeded, including reservations for in-flight work,
and deny dispatch when quota/budget state cannot be verified. Local documents
remain viewable/exportable when AI usage stops. Those hosted controls are not
implemented today.

Model-provider billing is separate from hosting. Keep live inference disabled
until the provider's payment method and enforced limits satisfy the no-card,
no-debt requirement. Neither prepaid credit alone, cancellation, nor the local
development ledger proves that external invoices cannot accrue. No paid
provider or hosting account has been enabled.

This gateway is **single-user development infrastructure**, not a public beta
service. It binds to loopback and has no user signup or plan entitlements yet.
Do not give friends your founder token or provider keys. Multi-user auth is a
separate milestone before inviting users into live inference.

```sh
npm run setup:gateway
```

This creates two gitignored files with private file permissions, refuses to
overwrite an existing configuration, and prints no credentials:

| File           | Used by                     | Contents                                                           |
| -------------- | --------------------------- | ------------------------------------------------------------------ |
| `.env.gateway` | Backend only                | Client-token hash, provider keys, model/rate configuration, budget |
| `.env.desktop` | Native desktop process only | Gateway URL and original client token                              |

Setup leaves live calls disabled and the model list empty. No provider account,
paid resource, or inference call is created. The frontend receives neither the
client token nor provider keys. Desktop launch scripts also omit provider keys
from the Electron child environment.

1. Add your provider keys to `.env.gateway` only.
2. Configure `AYRA_MODELS_JSON` with the exact model IDs and verified current
   context limits/rates. Each model needs `id`, `provider` (`deepseek` or
   `anthropic`), `tier` (`economy` or `advanced`), `contextTokens`,
   `maxOutputTokens`, and `prices` containing `input`, `output`, `cacheRead`, and
   `cacheWrite`.
3. Set the USD budget and, only when ready for billable requests,
   `AYRA_LIVE_ENABLED=true`.
4. Start the gateway in one terminal and the desktop app in another:

```sh
npm run gateway
npm run dev
```

Desktop commands load `.env.desktop`; the gateway command loads only
`.env.gateway`. In a task, **Review AI draft** shows the selected model and budget
reservation. Paste optional source notes, then explicitly choose **Send to model**.
The request and notes are sent to that model. Original notes aren't stored as a
separate task field, but their content can appear in the saved generated draft.
The backend stores generated documents and metering records locally in `.data/`.
It does not log prompts, notes, keys, bearer tokens, or raw provider errors.

Models and prices are deliberately unset until verified. For schema illustration
only, **these IDs and prices are fictional, not current model recommendations**:

```json
[
  {
    "id": "your-exact-deepseek-model-id",
    "provider": "deepseek",
    "tier": "economy",
    "contextTokens": 131072,
    "maxOutputTokens": 2048,
    "prices": {
      "input": 1000000,
      "output": 2000000,
      "cacheRead": 100000,
      "cacheWrite": 2000000
    }
  }
]
```

Money uses integer **USD millionths**: `$1 = 1000000`. Model prices are integer
USD millionths per million tokens: `$1/M input tokens = 1000000` for `input`.
A `5000000` monthly budget therefore means `$5`, not INR 5 or five million tokens.
Use the full supported input context and a conservative cache-write rate for all
applicable cache durations. Model IDs must match the provider response; a changed
identity blocks further calls pending review. No streaming, tools, reasoning
mode, automatic fallback, or paid retries are enabled in this milestone.

Protocols were checked against the official [DeepSeek chat API](https://api-docs.deepseek.com/api/create-chat-completion/)
and [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages/create).
Verify rates using [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing)
and [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
before enabling a model. The TypeSafe Jev vendor choice remains unconfirmed.

## Routing and budget behavior

Auto sends routine tasks to the configured economy tier and planning signals to
advanced. Economy and Thorough explicitly choose their respective tiers. A
missing model tier fails visibly; it is never silently replaced with another paid
model. Jev does not currently influence any decision.

The SQLite ledger reserves the full configured input-context cost, using the
highest applicable input/cache rate, plus permitted output **before dispatch**.
This is intentionally conservative. Transactions prevent concurrent calls from
spending the same budget, with at most two active drafts. Request IDs are
idempotent; changed content under an existing ID is rejected. Each task has one
paid draft ID, persisted before sending. Provider response usage reconciles the
reservation, including cache reads/writes and inclusive output token counts.

Provider cost and customer debit preview are separate columns. `AYRA_MARKUP_BPS`
is a markup on cost: `10000` means a 100% markup (a 2× debit preview), not a 100%
margin. **No customer payment is taken.** The preview excludes payment fees,
search, hosting, tax, and other future costs.

Known rejections release their reservation. Cancellation after dispatch,
connection loss, missing usage, or restart after dispatch retain a hold when
cost is unknown. Uncertain holds survive month boundaries and are not reset or
retried automatically. Interrupted queued work is failed without dispatch.
A separate process lock prevents another gateway from recovering live work in
this data directory. Unexpected model identity or usage over its configured
ceiling blocks further calls. Uncertain records currently require operator review;
there is no self-service reconciliation UI.

Metered costs are **provider-reported usage × configured rates**, not reconciled
provider invoices. Budget checks depend on correct model configuration and do not
limit spending outside this gateway. The INR 1,500 beta budget remains a planning
target; no exchange rate conversion or subscription price is implied.

## Security and implementation

The renderer has sandboxing and context isolation enabled, with Node integration
disabled. The Electron production CSP blocks direct renderer network access. The hosted
web CSP permits same-origin requests for the public download catalog.
The native bridge validates IPC senders and exposes only folder selection, export,
and specific gateway operations. Its gateway address is configured in the native
process, accepts HTTPS or loopback HTTP, refuses redirects, bounds responses, and
never forwards arbitrary server fields into the renderer. The local server checks
Host, rejects browser Origin headers, authenticates bearer tokens against a hash,
and returns no CORS grants. Provider endpoints are fixed official HTTPS URLs.

| Location                          | Responsibility                                                |
| --------------------------------- | ------------------------------------------------------------- |
| `src/App.tsx`                     | Workspace, navigation, task UI and local lifecycle            |
| `src/components/GatewayPanel.tsx` | AI consent, connection status, cost and cancellation          |
| `src/lib/useGateway.ts`           | Persist-before-send, status recovery, no replay               |
| `src/lib/tasks.ts`                | Task validation, demo templates and document selection        |
| `desktop/gateway.mjs`             | Credential-isolated, bounded native transport                 |
| `desktop/main.mjs`                | Window, legacy asset protocol, validated native operations    |
| `gateway/service.mjs`             | Authenticated handlers and dispatch policy                    |
| `gateway/ledger.mjs`              | Durable reservations, cost records, recovery and process lock |
| `gateway/providers.mjs`           | DeepSeek/Anthropic adapters and usage normalization           |
| `gateway/pricing.mjs`             | Integer price and debit calculations                          |
| `gateway/http.mjs`                | Bounded HTTP adapter, local authority and header validation   |
| `gateway/start.mjs`               | Loopback HTTP service and private SQLite storage              |

No arbitrary code or model-requested tools are executed. A future Cowork executor
needs its own verified sandbox; renderer isolation alone does not sandbox tools.
Do not package `.env.*`, `.data/`, or the backend's configuration inside a release.
Unsigned release packaging and Vercel preview configuration are prepared. No
installer has been built or published, and signing/notarization are not configured.
The shared authenticated SaaS backend remains a separate implementation milestone.

## Validation

```sh
npm run format:check
npm run build
npm test
npm run test:e2e
```

Run `npm run build && npm run test:e2e:desktop` to test the built Electron app
independently of the Vite browser server. The offline native test uses a temporary
profile, clears inherited gateway/provider credentials, and checks the disconnected
gateway through the actual preload/IPC bridge before testing the demo and export
dialogs. A second native test connects to the synthetic gateway described below.

`npm run test:e2e` and `npm run check` run browser tests only; native launches are
kept in the explicit desktop command. Its Node preflight checks that local
debugging sockets are allowed before spawning Electron. If binding is denied,
the command exits unsuccessfully without a GUI launch or another crash dialog.
This preflight does not diagnose every macOS startup failure. Listing tests with
`npm run test:e2e:desktop -- --list` does not launch Electron.

To reproduce runtime verification, run this in a normal macOS Terminal:

```sh
npm run verify:runtime
```

This builds the app, runs two real-loopback HTTP tests for economy/advanced
routing with the desktop gateway-client module, then runs both native tests.
The connected native test checks explicit consent through the actual IPC bridge,
HTTP transport, provider adapters, SQLite accounting, Markdown export, and app
restart without a repeated dispatch. `npm run test:gateway:runtime` runs only the
two HTTP cases. A failed step stops the combined command and returns a nonzero
exit status.

The runtime fixture opens an OS-assigned loopback port, generates a temporary
token and private SQLite files, and cleans up afterward. It ignores `.env` files
and inherited provider credentials. Provider fetches return synthetic receipts
inside the test process; they never delegate to the internet or incur API charges.
The fixture's enabled-drafting flag is limited to this simulated provider path;
it does not enable the development gateway's live configuration. These tests
cannot verify live-provider access or invoice reconciliation.

The build, TypeScript checks, and 61 automated tests pass. Current coverage includes task
approval/recovery, rename migration, output selection, transport validation,
authentication, duplicate/conflicting IDs, concurrent budget reservations,
known/unknown failure costs, cancellation, restart recovery, process ownership,
cache math, usage ceilings, routing, and private credential setup. Provider
adapters and gateway handlers are tested with fixtures; no paid API call is part
of these tests.

Four offline integration cases also connect the desktop gateway-client module,
authenticated handlers, provider adapters, and disk-backed SQLite. They cover both
provider routes, cache accounting, cost/debit separation, saved output after
restart, duplicate/conflicting requests, credential filtering, and retained holds
after ambiguous failures. Both fetch boundaries are injected; these cases do not
verify native IPC, an HTTP listener, or a live provider.

Sixteen HTTP cases feed raw request bytes through Node's real HTTP parser and the
production adapter using an in-memory Duplex, without binding a port. They cover
authenticated status, credential filtering, browser-Origin rejection, duplicate
Host/auth/content-type/Origin headers, foreign authority, non-local request
targets, oversized declared/chunked bodies, and UTF-8 JSON. The adapter rejects
ambiguous headers before normalization and rejects excessive Content-Length
before waiting for the body. These checks do not verify TCP connectivity or the
listener's timeouts.

On 2026-10-19 the user supplied a successful `npm run verify:runtime` run from
their regular macOS Terminal: the build, both real-loopback HTTP cases, and both
native Electron cases passed. The native suite completed in 13.7s. This verifies
the tested native IPC, local HTTP transport, explicit consent, synthetic draft
accounting, folder/export dialogs, Markdown export, and app restart without
redispatch on their Mac. All provider receipts were simulated; this was not a
live-provider or invoice-reconciliation test. Listener timeout behavior also
remains unverified.

The separate browser Playwright project covers explicit AI consent with a bridge
fixture and the demo/browser workflow, but remains unverified. Agent-sandbox
attempts on 2026-10-18/19 could not bind loopback sockets (`EPERM`) and Electron
aborted (`SIGABRT`) during macOS application registration/AppKit initialization.
These failures do not reproduce in the user's successful Terminal run. The exact
cause within the restricted environment remains unresolved; the stack resembles
an [upstream Launch Services registration failure](https://github.com/electron/electron/issues/52815)
reported on different Electron/macOS versions. No OS security settings or Electron
security preferences were weakened. Repeated GUI probes have stopped, and the
native wrapper's Node preflight was verified to exit at `EPERM` without spawning
Electron. The passing runtime results above are user-reported, not an
agent-sandbox execution result.

The download page was reviewed in static Safari at 390/768/1440px. All nine
computed contrast expectations and nine utility diagnostics were checked.
The first visual review covered home/document layouts at 390/768/1440px. Static
Safari review of this milestone covered MrAI by Ayush branding, settings, and the disabled
AI draft panel alongside a completed demo document. All nine contrast expectations
and nine utility diagnostics were checked again. The native connected draft flow
subsequently passed with synthetic provider receipts; browser and live-provider
integration remain unverified. The latest logo/sidebar refinement
was visually checked in static Safari frames at 390/768/1440px, including the open
mobile navigation. Build and TypeScript checks passed again; no behavior changed.
The app is a development foundation,
not a production multi-user service. Next are deployment verification, tested desktop installers, authenticated tester
accounts, shared durable accounting and enforced allowances. Live provider calls
remain disabled until the no-card/no-debt billing requirement is verified.
