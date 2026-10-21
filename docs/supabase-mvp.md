# Supabase Free SaaS MVP

Scope: personal, non-commercial MVP. No beta program, subscriptions, checkout,
paid hosting, or paid add-ons. Use the existing Vercel Hobby deployment and a
Supabase Free organization/project. Live inference remains disabled.

## Database and configuration

1. Create the `mrai` project in the `MrAI` Free organization. The account owner
   enters/generates and saves the database password. It is not needed by the app.
2. Leave Data API enabled, disable automatically exposing new tables, and enable
   automatic row level security. Apply
   `supabase/migrations/202610210001_workspace.sql` once in the SQL editor.
3. Run `supabase/verify-workspace.sql`. It exercises two synthetic auth identities,
   owner reads, cross-user isolation, revision conflicts, direct-write rejection,
   malformed payloads and anonymous-access rejection. All fixtures roll back.
4. Copy the existing **publishable** key, not a secret or service-role key.
5. Set the three backend environment variables listed in `.env.cloud.example`
   on the Vercel **Production** environment. Do not use `VITE_` variables.
   `MRAI_APP_ORIGIN` must exactly match the HTTPS app origin, with no trailing
   slash. Preview deployment origins are not implicitly trusted.
6. In Supabase Auth URL Configuration, set Site URL to
   `https://mr-ai-lac.vercel.app`. Retain email confirmation and password security.
   Do not weaken authentication to bypass email-delivery restrictions.
7. Redeploy and verify `/api/account` returns `user: null` without credentials.
   Sign up/confirm/sign in as the owner, create and complete a demo, reload, verify
   the same document, then sign out. A second browser should load the same account
   data. Account credentials are entered by the owner, never shared in chat.

## Boundaries

The web app uses same-origin Vercel account/data APIs. Sessions use HttpOnly,
Secure, SameSite=Lax host cookies; access/refresh tokens are not returned to the
renderer or stored in localStorage. The API verifies the user with Supabase Auth
and forwards their token to the database, retaining row-level isolation. API
responses are non-cacheable, requests/responses are bounded, redirects are refused,
and cross-origin mutations are rejected. Neither the database password nor an
administrative Supabase key is required in Vercel.

One JSON workspace row per account holds up to 30 tasks and their generated
documents. Server-side bounds and SQL constraints limit storage. Writes use a
revision-checked function and transaction lock; direct table writes are denied.
Concurrent-device edits are not merged. A stale or uncertain save stops further
saves and leaves open documents available for export; export edits before
reloading. Do not claim every network failure has a known write outcome.

Guest history stays in its existing local storage. Signing in loads that
account's cloud workspace; local history is **not uploaded automatically**.
Signed-in workspace data is kept in memory and in Supabase, without an offline
browser cache. Cloud-saving state warns before leaving with unsaved changes and
blocks sign-out until changes are confirmed saved. Hosted AI is still disabled,
and cloud history is not a trusted provider-usage or spending ledger.

Electron and file previews retain local behavior. Native cloud authentication and
cross-device offline caching are not implemented in this milestone. No provider
adapter, usage ledger migration, object-storage bucket, or paid service is enabled.

Supabase's built-in mail sender only sends to authorized project-team addresses
and is rate limited. General email signup/recovery requires separately configured
SMTP or an OAuth provider. No mail provider or OAuth app is provisioned here.
The account form surfaces a failed email delivery without disabling confirmation.
Password-reset UI is not implemented yet.

Supabase Free projects can pause after inactivity and have bounded resources;
the Free plan is not charged. Keep the organization on Free without upgrades or
add-ons. Database hosting does not pay for model APIs or prove model-provider
spending is bounded.

## Validation

`npm test` includes injected Supabase Auth/REST boundary tests and cloud-save
serialization/conflict tests. These do not prove hosted authentication or RLS.
The separate SQL verification and real owner sign-in/reload checks must be
recorded as actually run before reporting the SaaS integration complete.

On 2026-10-21 the `MrAI` Free organization and `mrai` project were created.
The workspace migration succeeded in Supabase's SQL editor. The verification
script then returned PASS for owner reads, cross-user isolation, stale-write and
direct-write rejection, malformed-payload rejection, and anonymous access; its
synthetic identities/workspaces were rolled back. Vercel Production has the
project URL, publishable key and allowed app origin configured. No database
password, service-role key or model-provider key was added to Vercel.

References checked 2026-10-21:

- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/platform/cost-control
