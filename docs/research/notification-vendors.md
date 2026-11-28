# Research: in-app notification vendors vs an in-house build

Ticket: [#4](https://github.com/eliasv6/cohort-005-project/issues/4) (map [#3](https://github.com/eliasv6/cohort-005-project/issues/3)).
Researched 2026-11-27 against official docs, pricing pages, and npm package manifests.
**Pricing pages change often. Re-check every number before relying on it.**

This note compares options. It does not recommend build or buy; that decision belongs to [#8](https://github.com/eliasv6/cohort-005-project/issues/8).

Constraints from the map: a real deployment on free tiers, in-app only for now, email in a second round, audience is Students and Instructors. Cadence today: React Router 8 SSR, React 19, one SQLite file through Drizzle, no scheduler or job runner, `sonner` installed, and a `video_watch_events` table already recording watch activity (`app/db/schema.ts`).

## Summary table

| | Knock | Novu Cloud | Novu self-hosted | MagicBell | Courier | SuprSend | In-house (SQLite) |
|---|---|---|---|---|---|---|---|
| Free tier | 10k messages/mo, unlimited seats and environments, feed retention unlimited, logs 30 days | 10k workflow runs/mo, **5 workflows**, 3 seats, 2 environments, inbox retention 30 days, activity log 1 day | No usage fee; you pay for infra. 1 team member | **1k deliveries/mo**, 1 project | 10k sends/mo | 10k notifications/mo, **no batching, digest or preferences on free** | No vendor fee |
| What a unit is | A message, per channel | One run per recipient, whatever the channels | n/a | One delivery per channel | One send per recipient, whatever the channels | One per channel | n/a |
| Over the limit | No hard cap. Knock contacts you to add billing; Starter is $250/mo | Not stopped; free-tier overage not documented. Pro from $30/mo | n/a | Billed per delivery above 1k; Startup is $249/mo | Add a card: Business is $0.005 per send, **including the first 10k** | Not stopped; SuprSend contacts you. Essentials is $100/mo | n/a |
| React feed UI | `@knocklabs/react`: popover, feed, bell, hooks | `@novu/react`: Inbox, Bell, Notifications, Preferences, hooks | Same as Cloud (no Snooze) | `@magicbell/react`: Inbox, FloatingInbox, UserPreferences, toasts | `@trycourier/courier-react` v9: Inbox, toasts, preferences (web components inside) | `@suprsend/react`: Inbox, NotificationsFeed, Preferences, headless core | Build it (shadcn/Radix already in the app) |
| React 19 peer dep | Yes (`^17 \|\| ^18 \|\| ^19`) | Yes (`^18 \|\| ^19`) | Yes | `@magicbell/react`: none declared | Yes (`>=18`) | Yes (`>=16.8`) | n/a |
| Real-time | WebSocket (Phoenix channels) | WebSocket (socket.io / partysocket) | Needs its own WS service | Persistent connection (Ably, per API reference) | Real-time sync, transport undocumented | socket.io | Revalidate on navigation for free; polling or SSE to build |
| Delay | Yes, up to 365 days | **Max 24 h on free** (7 d Pro) | Yes | `wait` in seconds; limits unverified | Yes, up to 93 days | Yes | Build it |
| Batch / digest | Batch (up to 90 days) | Digest, **max 24 h on free** | Digest | No digest found | Batch and digest (pricing lists them as Enterprise; billing docs don't gate them) | **Paid only** | Build it (collapse by group key) |
| Recurring schedules | Schedules API (per-recipient, timezone-aware) | Scheduled digest and scheduled delay | Same | Not found | Send windows, digest schedules | Digest schedule, time windows | Build it |
| Cancel a pending run | `cancellation_key` | `DELETE /v1/events/trigger/{transactionId}` | Same | `abort` command | Cancel node (cancellation token) | Cancel Workflow node | n/a |
| Preferences | Per workflow, category, channel type; API; hosted page | Inbox Preferences component | Yes | Per category and channel; API and component | Preferences API and component | **Paid only** | Build it |
| Browser auth | Public key + RS256 JWT you sign locally | Public app ID + HMAC-SHA256 of subscriber ID | Same | HS256 user JWT you sign locally | JWT minted by **calling Courier's API** | Public key + ES256 JWT you sign locally | Existing session cookie |
| Server secrets | Secret API key, signing key | Secret key | Secret key, plus Mongo, Redis, S3 credentials | Secret key, API key | API key | Signing key, workspace key and secret | None new |
| Code-defined workflows | CLI pull/push files, commits, promote | `@novu/framework` (workflows in your repo via a bridge endpoint) | Same | JSON workflow definitions via API | CLI | CLI promote staging to production | It is all code |
| Local dev / tests | Dev environment; no emulator found | Dev environment; no emulator confirmed | Fully local, but heavy | Not found | Test environment (counts toward billing) | Staging with Test Mode; Sandbox off security | In-memory SQLite in vitest, as today |

## The facts that matter most for the decision

1. **In-app nudges do not need a scheduler; email nudges do.** A Student who hasn't watched in 7 days only sees an in-app nudge when they come back, so Cadence can compute it at read time from `video_watch_events` in a loader. A vendor can model the same nudge without our cron: on each watch, trigger a workflow with a 7-day delay and cancel the previous pending run. That works on Knock (delay up to 365 days, `cancellation_key`), Courier (93 days, Cancel node) and SuprSend (delay and Cancel Workflow node). It does **not** work on Novu Cloud Free, which caps delays at 24 hours. Once email arrives, an absent Student has to be reached while they're away. At that point an in-house build needs a real scheduler, and a vendor with delays does not.
2. **Free tiers differ more in feature gates than in volume.** Knock, Novu, Courier and SuprSend all allow about 10k units a month; MagicBell allows 1k. SuprSend's free tier drops batching, digests and preferences, which the map's open questions depend on. Novu's free tier allows 5 workflows, 24-hour delay and digest windows, and a 1-day activity log. Knock documents no workflow-function gates on free. Units also differ: once email arrives, Knock, MagicBell and SuprSend count each channel separately, while Novu (per run) and Courier (per send) don't. Courier's first paid step bills every send, including the first 10k.
3. **Every vendor makes the server sign a per-Student token, and some leave this off by default.** Without it, anyone holding the public key can read another recipient's feed. Knock's enhanced security mode and SuprSend's are toggles, and SuprSend's Sandbox ignores bad tokens. Novu HMAC is opt-in. Knock, MagicBell and SuprSend sign locally. Courier needs a network call to Courier for each token, so a Courier outage also breaks sign-in to the feed.
4. **Lock-in is in feed state and workflow logic, not in the UI.** Read and seen state and notification history live with the vendor. The vendor's workflow DSL (delays, batches, cancellation keys) has to be rewritten on another vendor. Novu Framework (workflows as TypeScript in our repo) and Knock's CLI (workflows as files) reduce that cost. No vendor documents a one-shot export of feed history; Knock offers warehouse sync and a Messages API with date filters. Self-hosted Novu removes the vendor but needs MongoDB, Redis, S3 and four services (API, worker, WS, dashboard), and supports one team member. That is a big step up from one SQLite file.
5. **Feed widgets are client-side, and each one brings its own UI stack.** None of the SDKs documents server-rendering the feed. Expect the bell to hydrate on the client after SSR. Courier documents that its web components are safe to import on the server. Novu's Inbox renders with Solid.js inside React. Knock pulls in its own Telegraph and Radix packages. Courier uses web components. Matching Cadence's shadcn look means headless hooks or theming in every case.

## Per-option notes

### Knock

- **Free tier**: "Developer" plan: 10,000 messages/month, unlimited seats and environments, unlimited feed retention, 30-day log retention; "We don't hard cap your messages". Starter: $250/month with 50,000 messages, then $0.005 each. Per-tenant preferences, i18n and branding removal are paid. [knock.app/pricing](https://knock.app/pricing)
- **React**: `@knocklabs/react` (0.15.1) ships `NotificationFeedPopover`, `NotificationFeed` and `NotificationIconButton`, plus "a complete set of React hooks". [docs](https://docs.knock.app/in-app-ui/react/overview). npm peer deps: `react ^17 || ^18 || ^19`; `next` and `@tanstack/react-router` are optional peers. No SSR guidance is documented. You import a required CSS file (`@knocklabs/react/dist/index.css`) and theme it with `--rnf-` variables. [feed docs](https://docs.knock.app/in-app-ui/react/feed)
- **Real-time**: socket-based. `auto_manage_socket_connection` disconnects inactive tabs. You have to allow Knock's WebSocket hosts in your CSP. The client uses Phoenix channels (npm `@knocklabs/client` deps). [feed docs](https://docs.knock.app/in-app-ui/react/feed)
- **Workflows**: Delay, Batch, Branch, Throttle, Fetch, Wait for event, Trigger workflow and others. [overview](https://docs.knock.app/designing-workflows/overview). Delays run up to 365 days. [delay](https://docs.knock.app/send-notifications/designing-workflows/delay-function). Batches stay open up to 90 days, can use fixed or sliding windows and a batch key, and render the first 10 activities (more on Enterprise). [batch](https://docs.knock.app/send-notifications/designing-workflows/batch-function). Pending delay and batch runs can be canceled with a `cancellation_key`; Knock advises against canceling within 5 seconds of the trigger. [canceling](https://docs.knock.app/send-notifications/canceling-workflows). The Schedules API supports per-recipient recurring triggers (hourly, daily, weekly, monthly) in each recipient's timezone. [schedules](https://docs.knock.app/concepts/schedules)
- **Recipients and preferences**: a preference set covers workflows, categories, channel types and channels, and everything defaults to `true`. There is an API, a bulk set for up to 1,000 recipients, and a hosted preference page. No prebuilt React preference component is documented. [preferences](https://docs.knock.app/preferences/overview)
- **Security**: in enhanced security mode Knock rejects client requests without a signed user token. Your backend signs that token as an RS256 JWT with a signing key (`KNOCK_SIGNING_KEY`); the `sub` claim is required, and `exp` is recommended. Without enhanced mode, "feeds are accessible to anyone who has the feed ID". [security](https://docs.knock.app/in-app-ui/security-and-authentication)
- **Email later**: add an email channel step to the existing workflow and configure an email provider. The free tier counts each delivered message, so email doubles the count for each notification sent on both channels.
- **Leaving**: warehouse sync now includes a `message_events` table ([changelog 2026-07-07](https://knock.app/changelog/2026-07-07)). The Messages API filters by `inserted_at` ([API](https://docs.knock.app/api-reference/messages)). Workflows can be pulled as files with the CLI ([CLI](https://docs.knock.app/cli/overview)).
- **Testing**: development and production environments with commits and promotion ([environments](https://docs.knock.app/concepts/environments)). No local emulator is documented; the CLI works against your account.

### Novu (Cloud)

- **Free tier**: 10,000 workflow runs/month, 5 workflows, 2 environments, 3 seats, Novu branding. Pro is from $30/month, Team from $250/month. [novu.co/pricing](https://novu.co/pricing). Limits by plan (Free / Pro / Team): delay max 24 h / 7 d / 90 d, digest max 24 h / 7 d / 90 d, workflows 5 / 20 / 100, inbox retention 30 / 90 / 90 days, activity log 1 / 7 / 90 days. [limits](https://docs.novu.co/platform/developer/limits). A run is one workflow execution for one subscriber, whatever the number of steps or channels, and Development runs count too. [billing](https://docs.novu.co/platform/account/billing). What happens above 10k on Free: **not documented**.
- **React**: `@novu/react` (3.21.0) provides `<Inbox />` with Bell, Notifications, InboxContent and Preferences, plus headless hooks. It requires React 18 or later and supports 19. [inbox](https://docs.novu.co/platform/inbox/overview). Under the hood `@novu/js` renders with Solid.js (npm deps).
- **Real-time**: the docs say updates are real-time. `@novu/js` depends on `socket.io-client` and `partysocket`.
- **Workflows**: Digest has regular and scheduled windows, the scheduled one in the subscriber's timezone. [digest](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/digest). Delay can be fixed, scheduled or dynamic. [delay](https://docs.novu.co/platform/workflow/add-and-configure-steps/configure-action-steps/delay). Pending runs can be canceled by `transactionId`. [cancel API](https://docs.novu.co/api-reference/events/cancel-triggered-event). Workflows can also live in code through `@novu/framework` and a bridge endpoint. Quickstarts cover Next, Remix, Express, H3, Hono and others, but not React Router 8 by name. [framework](https://docs.novu.co/framework/overview)
- **Security**: set `subscriberHash = HMAC-SHA256(secretKey, subscriberId)` on the server; without it, someone could guess a `subscriberId`. Keep `NOVU_SECRET_KEY` on the server. [prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)
- **Email later**: add an email step to the workflow and connect a provider. It is still one run per subscriber, so the bill doesn't grow per channel.

### Novu (self-hosted)

- Repo license: MIT for the core (`LICENSE-MIT`), with a separate `LICENSE-ENTERPRISE` for enterprise code (GitHub `novuhq/novu` root).
- Infra: API, Worker, WS and Dashboard services, plus MongoDB, Redis (with AOF on the queue cluster) and S3-compatible storage. The minimum is one VM with 4 vCPU and 8 GB RAM. [self-hosting](https://docs.novu.co/community/self-hosting-novu/overview)
- Compared with Cloud: no custom environments or more than 2 environments, no environment variables, no translations, no Snooze, no branding removal, no email activity tracking, **1 team member**, no MFA or SSO. Inbox, digest and the preferences component work. [comparison](https://docs.novu.co/community/self-hosted-and-novu-cloud)
- Novu's pricing page lists self-hosting under Enterprise. The docs describe the community self-hosted edition as for testing and experimenting.

### MagicBell

- **Free tier**: "Builder": 1,000 deliveries/month, 1 project, unlimited users and team members. Deliveries are counted per channel. Startup is $249/month for 50,000. [pricing](https://www.magicbell.com/pricing)
- **React**: `@magicbell/react` (1.14.0) provides Inbox, FloatingInbox, UserPreferences and ToastContainer; `ContextProvider` takes a User JWT. [docs](https://www.magicbell.com/docs/libraries/magicbell-react). The package declares no React peer dependency; the older `@magicbell/magicbell-react` (11.x) needs `react >= 18.3.1`.
- **Real-time**: "persistent connection" ([in-app channel](https://www.magicbell.com/docs/channels/in_app)). The API reference mentions Ably connection IDs.
- **Workflows**: `wait` (in seconds), `pause`, `abort`, conditions, and webhook or API triggers. [workflows](https://www.magicbell.com/workflows). **No digest, batching or schedules found**, and plan availability and wait limits aren't stated.
- **Security**: the backend signs a User JWT with HS256 using the project Secret Key, with `user_email` or `user_external_id` plus `api_key` claims. The docs' examples use a 1-year expiry. [user auth](https://www.magicbell.com/docs/api/authentication/user)
- **Preferences**: per category and channel, through `/channels/user_preferences` in API v2. [API v2](https://www.magicbell.com/docs/api/reference)

### Courier

- **Free tier**: "Developer": 10,000 sends/month. A send is one template to one recipient, whatever the channels. Test environments count. Going over means adding a card, which moves you to Business at $0.005 per send, including the first 10k. [pricing](https://www.courier.com/pricing), [billing](https://www.courier.com/docs/workspaces/billing). Inbox has "no fee beyond the per-send price". The pricing page lists "Digest & batching" under Enterprise, but the billing docs don't gate it: **unresolved**.
- **React**: `@trycourier/courier-react` v9 (React 18+) renders `<CourierInbox />` and toasts from web components; the older `@trycourier/react-inbox` is deprecated. [inbox](https://www.courier.com/docs/platform/inbox/inbox-overview). For SSR, the Next guide says `"use client"` is enough because elements register only when `window` exists. Effects run twice in dev, and a second `signIn` signs the first person out. [Next guide](https://www.courier.com/docs/guides/add-an-inbox-to-nextjs)
- **Workflows (Journeys)**: Send, Branch, Delay (up to 93 days), Send to Digest (schedule per topic), Batch (max items, quiet period, max wait), Throttle (drops sends over the cap), Fetch data, AI, and Cancel (by cancellation token). [nodes](https://www.courier.com/docs/journeys/nodes)
- **Security**: the server calls `POST /auth/issue-token` with the API key and a scope such as `user_id:<id> inbox:read:messages inbox:write:events`. Without `expires_in` the token never expires, and the SDK doesn't refresh tokens. [auth](https://www.courier.com/docs/in-app/authenticate-users)

### SuprSend

- **Free tier**: 10k notifications/month (each channel counts), unlimited team members, 30-day logs, SuprSend branding. **Batching, digest, user preferences, timezone sending, throttling and i18n are excluded.** Processing doesn't stop at the limit. Essentials is $100/month and Business (which adds batching, digest and preferences) $250/month. [pricing](https://www.suprsend.com/pricing)
- **React**: `@suprsend/react` (1.6.0) ships Inbox (bell and popover), NotificationsFeed and Preferences, with `@suprsend/react-core` for headless use. `@suprsend/react-inbox` is end-of-support. [react sdk](https://docs.suprsend.com/docs/react-sdk), [overview](https://docs.suprsend.com/docs/inbox-react). Real-time runs over `socket.io-client` (npm deps of `@suprsend/web-sdk`).
- **Workflows**: delay (fixed, dynamic or relative) ([delay](https://docs.suprsend.com/reference/workflow-nodes/delay)), batch ([batch](https://docs.suprsend.com/docs/batch)), digest on a recurring schedule ([digest](https://docs.suprsend.com/docs/digest)), time window ([time window](https://docs.suprsend.com/docs/time-window)), and a Cancel Workflow node that stops runs waiting on a delay or batch ([cancel](https://docs.suprsend.com/docs/cancel-workflow)).
- **Security**: the backend signs an ES256 JWT with `entity_type: "subscriber"` and `entity_id`. Enhanced security mode rejects requests without a token, but it is **off in Sandbox**. `refreshUserToken` handles renewal. [client auth](https://docs.suprsend.com/docs/client-authentication)
- **Testing**: Sandbox (a 30-day demo), Staging (with Test Mode, which limits delivery to internal testers) and Production workspaces. The CLI promotes from staging to production. [changelog](https://docs.suprsend.com/changelog/overview)

### In-house (SQLite through Drizzle)

What we'd build to match a vendor's in-app feature set (an estimate, not a design):

- **Data**: a `notifications` table (recipient, type, payload, created, seen and read timestamps, and a group key for collapsing bursts), plus a small preferences table. Rows are written in the same transaction as the event (comment created, lesson published), so there's no "vendor down at trigger time" failure mode and no duplicate-send retry logic.
- **Feed UI**: a bell in the app layout whose loader reads the unread count, and a dropdown or page with mark-read actions built from existing shadcn and Radix parts. It server-renders with the rest of the page, unlike the vendor widgets.
- **Freshness**: React Router revalidates loaders after every navigation and action, so the bell updates on navigation at no cost. Live updates would need polling (`useRevalidator` on an interval) or an SSE resource route, which assumes a single long-lived Node process.
- **Batching**: update the existing unread row for the same group key instead of inserting a new one, which covers cases like 30 comments on one lesson.
- **Time-based nudges**: computed at read time from `video_watch_events`, so no scheduler is needed while delivery is in-app only.
- **Tests**: covered by the existing in-memory SQLite `createTestDb()` in vitest. No vendor to mock, and it works with the DevUI user switcher.
- **What it doesn't give us**: email. Round two would need an email provider, templates, an unsubscribe and preferences page, retries, and a scheduler (cron, or an external pinger calling a route) for nudges sent to absent Students. A vendor's workflow engine covers most of that.

## Could not verify / open points

- **Pricing** comes from live pricing pages on 2026-11-27. Novu's docs pages carry old metadata and may lag the pricing page. Re-check everything.
- Novu Free behavior above 10k runs is undocumented.
- Courier: whether digest and batching need Enterprise (the pricing page and the billing docs disagree), plus retention per plan and the real-time transport.
- MagicBell: retention, the maximum `wait`, which plans include workflows, and whether `@magicbell/react` supports React 19 (it declares no peer dependency).
- Knock: whether schedules or batch have plan gates (none documented). Knock's free tier has no documented overage rate.
- SuprSend: retention of in-app feed items, and SSR guidance.
- SSR: no vendor documents React Router 8 specifically. Client-only hydration of the bell is an inference from the SDKs' Next.js guides and how they're built.
- Data export: no vendor documents a bulk export of in-app feed history and read state; only per-API pagination or warehouse sync (Knock).
- Self-hosted Novu delay support isn't listed in the comparison table. It's assumed to work because the workflow engine is the same.
