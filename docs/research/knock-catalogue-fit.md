# Research: Knock's fit for the decided catalogue rules

Ticket: [#9](https://github.com/eliasv6/cohort-005-project/issues/9) (map [#3](https://github.com/eliasv6/cohort-005-project/issues/3)).
Checks the rules decided in [#5](https://github.com/eliasv6/cohort-005-project/issues/5) (the catalogue, with its amendment from [#7](https://github.com/eliasv6/cohort-005-project/issues/7)) and [#6](https://github.com/eliasv6/cohort-005-project/issues/6) (the surfaces) against Knock, which [#8](https://github.com/eliasv6/cohort-005-project/issues/8) chose. It builds on [`notification-vendors.md`](https://github.com/eliasv6/cohort-005-project/blob/research/notification-vendors/docs/research/notification-vendors.md) and doesn't repeat it.
Researched 2026-11-27 against docs.knock.app (pages and their `.md` sources), Knock's OpenAPI spec (`docs.knock.app/openapi.json`), knock.app/pricing, and the published npm sources of `@knocklabs/react@0.15.1`, `@knocklabs/react-core@0.17.1`, `@knocklabs/client@0.23.1` and `@knocklabs/node@1.41.1`.
In-app only; email is out of scope. **Re-check prices and limits before relying on them.**

Verdicts: **native** (a Knock feature does it as stated), **approximated** (doable, but Cadence has to supply part of the behaviour), **impossible** (Knock can't do it). This note doesn't choose between approaches.

## Verdict table

| # | Rule (source) | Verdict | How / why |
|---|---|---|---|
| 1 | Course Activity "collect until read" (#5 type 12, #6) | **Approximated**, *flag* | A batch step only closes on time or activity count, never on read, and its item doesn't appear until it closes. Feed messages can't be edited. What works: Cadence keeps the counts, then archives the Unread summary and triggers a new one on each event. |
| 2 | Badge counts Unseen; cleared when the Inbox opens (#6) | **Native** | `metadata.unseen_count`; the Inbox calls `feedClient.markAllAsSeen()` itself (the headless hooks don't). |
| 3 | Unread until clicked, *Mark read*, *Mark all read* (#6) | **Native** | `markAsRead(item)` and `markAllAsRead()` on the headless feed client, plus `unread_count`. Seen and read are separate timestamps. |
| 4 | Role-specific Inbox filters and the Unread filter (#6) | **Native** | Feed options `status`, `workflow_categories` (list), `source` (one workflow only) and `trigger_data`. |
| 5 | Toasts for Discussion types only (#6) | **Native** (headless) | No toast component. The feed client emits `items.received.realtime`, and Cadence filters by workflow and renders its own themed toast. |
| 6 | Hide Unread Notifications when a Question or Reply is soft-deleted; read ones stay (#5) | **Native** | `POST /v1/channels/{id}/messages/bulk/archive` filtered by `trigger_data` (for example `{"question_id":"42"}`) and `engagement_status: "unread"`. |
| 7 | No time-based Notifications while a Refund Request is Open (#5) | **Approximated** | Knock can't read SQLite. Either mirror a recipient property and put a step condition on the in-app step (recipient data is re-read when the step runs), or cancel pending runs and re-arm them later. |
| 8 | Only Students with an Enrollment get course Notifications (#5, amended by #7) | **Approximated** | Cadence picks the recipients when it triggers. For delayed runs, cancel on refund or completion, or add a recipient-property condition. Types 5–7 also skip Completed Enrollments the same way. |
| 9 | Not started: 3 days, once per Enrollment (#5 type 5) | **Native** | Trigger at enrollment with a 3-day delay step and `cancellation_key`, and cancel on the first lesson start. Delays run up to 365 days. |
| 10 | Inactive at 7 and 21 days, reset by activity, at most twice (#5 type 6) | **Approximated** | One run per Enrollment works: delay 7 d, in-app, delay 14 d, in-app. Activity cancels it and triggers a new run. Knock can't enforce "at most twice" across cancelled and re-armed runs (throttle windows max out at 31 days), so Cadence has to track the count. |
| 11 | Milestone 50% and Course Completed, once per Enrollment (#5 types 7, 9) | **Native** trigger; once-ness is Cadence's | Cadence detects the crossing and triggers. Knock's own dedupe is the 24 h idempotency window, or "once per recipient (per tenant)", which doesn't map to an Enrollment unless a course is a tenant. |
| 12 | Outbox retries don't duplicate Notifications | **Native** (24 h) | `Idempotency-Key` header, on `POST /workflows/{key}/trigger` only. It replays a cached 2xx for 24 h, and the parameters must match. The Node SDK sends a random key unless you pass `idempotencyKey`. |
| 13 | Free tier covers the catalogue | **Native**, with caveats | Only delivered messages are metered (10k/month), and workflow triggers are unlimited. Delay, batch, conditions, schedules and fetch are on every plan. In-app messages in the development environment count, and the in-app channel can't be sandboxed. |
| 14 | React 19 | **Native** | Peer dependency `react ^17 \|\| ^18 \|\| ^19`; `next` and `@tanstack/react-router` are optional peers. |
| 15 | Server-rendered badge on first paint (React Router 8) | **Approximated** | A loader can read `unseen_count` with the secret key, but the SDK store can't be seeded and starts at 0 on the client. The client SDK runs on the server without a socket, and by default identifies the user inline during render. |
| 16 | Local dev with the DevUI user switcher | **Native** | A development environment exists, enhanced security is off by default, and recipients can be identified inline on trigger. `KnockProvider` re-authenticates when the user or token changes and remounts the feed. |

**Flagged as possibly reopening a decided rule:** #1 only. Native batching would turn "collect until read" into a time window, and the summary would stay out of the Inbox until the window closed. That contradicts #6 ("shows 'collecting until read' while Unread … a new event bumps the open summary"). The archive-and-replace approximation keeps the decided behaviour, at the costs listed under rule 1. Nothing else needs a decided rule changed.

## Rule-by-rule findings

### 1. Course Activity, "collect until read"

What #5 and #6 decided: one feed item per Instructor and course. While Unread it absorbs new Enrollments, ratings (with the new star value) and Completions. A bump makes it Unseen again instead of adding a row, and once it is read the next event starts a fresh one.

**The batch step can't do it.**
- A batch opens on the first trigger and closes when its window ends. The window is fixed, dynamic (a timestamp, a duration or a window rule), relative or sliding, and can stay open for at most 90 days. [batch: window](https://docs.knock.app/designing-workflows/batch-function#setting-the-batch-window)
- Nothing closes a batch on read. "Right now we don't offer a way to close a batch from a workflow trigger." The suggested workaround is a sliding window with a tiny max extension, which closes the batch on the *next trigger*, not on read. [batch FAQ](https://docs.knock.app/designing-workflows/batch-function#frequently-asked-questions)
- A batch can also close early at a maximum activity count (2–1000). [max activity limit](https://docs.knock.app/designing-workflows/batch-function#setting-the-maximum-activity-limit)
- The message is only generated when the window closes. Until then the triggers are held as `activities` and their runs are terminated, so nothing shows in the feed while the batch is collecting. [how batching works](https://docs.knock.app/designing-workflows/batch-function#how-batching-works)
- **Render limit:** templates get the first or last 10 `activities` and `actors`. `total_activities` and `total_actors` count everything, and there is no limit on items per batch. The Enterprise plan can render 2–100. [render limit](https://docs.knock.app/designing-workflows/batch-function#setting-the-batch-render-limit-beyond-10), [plans](https://docs.knock.app/manage-your-account/knock-plans#enterprise-features)
- After a batch, trigger `data` is flattened. Nested objects are dropped, strings are cut to 256 characters, and later keys overwrite earlier ones. Per-event values, such as each new star rating, have to come from `activities`. [batch data payload](https://docs.knock.app/designing-workflows/batch-function#the-data-payload)
- Batch windows can't be set per recipient. [batch FAQ](https://docs.knock.app/designing-workflows/batch-function#frequently-asked-questions)

**Feed messages are immutable.** "Can I update a feed message after it's been sent? No. You can update a feed message's engagement statuses … but its content and other metadata can't be changed once Knock generates it. If a message becomes out of date, archive it and trigger the workflow again to send a new one." [feeds FAQ](https://docs.knock.app/in-app-ui/feeds/overview#frequently-asked-questions)

**What works: archive and replace, driven by Cadence.**
1. Cadence keeps the running counts per (Instructor, course) in SQLite, since it owns those events.
2. On each new event it checks whether the current summary is still Unread. `GET /v1/users/{user_id}/messages` filters by `source`, `trigger_data` and `engagement_status=unread` and is tier 4, 200 req/s ([OpenAPI](https://docs.knock.app/api-reference/users/list_messages)). An outbound webhook could report reads instead, but it needs a public URL.
3. If the summary is Unread, Cadence archives it (`PUT /v1/messages/{id}/archived` is tier 2, `POST /v1/messages/batch/archived` is tier 3, or the bulk channel endpoint) and triggers a new message with the cumulative counts. [archive](https://docs.knock.app/api-reference/messages/archive), [batch archive](https://docs.knock.app/api-reference/messages/batch/archive)
4. If it is read, Cadence resets the counts and triggers a fresh summary.

Each new message arrives unseen and unread, so the "Unseen again when bumped" rule holds. Archived messages drop out of the default feed (`archived: "exclude"`). [archive](https://docs.knock.app/api-reference/messages/archive)

What it costs:
- **Every bump is a billed message.** A message is "a single message delivered to a single user on a single channel", and in-app messages always reach `delivered`. [pricing](https://knock.app/pricing), [message statuses](https://docs.knock.app/send-notifications/message-statuses#6-sent)
- **The row's identity and timestamp change on every bump.** It moves to the top of the feed, which returns items in reverse chronological order with no pinning. [feeds FAQ](https://docs.knock.app/in-app-ui/feeds/overview#frequently-asked-questions)
- **Race (inference, not tested):** triggers run asynchronously ([trigger API](https://docs.knock.app/api-reference/workflows/trigger)), so a second bump can arrive before the first replacement exists. Then two summaries can be Unread at once unless Cadence serializes bumps per (Instructor, course) and archives by listed message IDs.

**Flag:** choosing native batching instead would change the decided rule (see the top of this note).

### 2–3. Unseen vs Unread, with our own UI

- The feed API returns `unread_count`, `unseen_count` and `total_count` in `meta` and filters by `status` (`unread`, `read`, `unseen`, `seen`, `all`). [OpenAPI `UserInAppFeedResponse`](https://docs.knock.app/api-reference/users/feeds/list_items), [feeds overview](https://docs.knock.app/in-app-ui/feeds/overview)
- Seen and read are separate engagement statuses with separate timestamps (`seen_at`, `read_at`). A message can be seen and still unread. [message statuses](https://docs.knock.app/send-notifications/message-statuses#engagement-status)
- With the headless hooks (`useNotifications` and `useNotificationStore` from `@knocklabs/react`), "you're responsible for marking items as seen". Call `feedClient.markAllAsSeen()` when the Inbox opens. "If you don't mark items as seen, `unseen_count` never decreases." [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed#marking-items-as-seen)
- The feed client has `markAsRead`, `markAllAsRead`, `markAsSeen`, `markAsInteracted` and `markAsArchived` (source: `@knocklabs/client@0.23.1` `src/clients/feed/feed.ts`; [GitHub](https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts)). [useNotifications](https://docs.knock.app/in-app-ui/react/sdk/hooks/use-notifications)
- **Scope caveat (from source):** `markAllAsRead()` and `markAllAsSeen()` send one bulk update scoped by the feed's `status`, `archived`, `tenant`, `has_tenant` and `trigger_data` options, but **not** by `source` or `workflow_categories`. "Mark all read" on a filtered tab therefore marks every message in the channel read, unless Cadence calls the API with its own filter. (`feed.ts`, `makeBulkStatusUpdate`)
- The optimistic count update has a race the authors acknowledge: a message arriving during the bulk call can restore the old count (code comment in `markAllAsRead`).

### 4. Inbox filters

- Feed options: `status`, `source` ("filtering by multiple sources is not supported"), `workflow_categories` (an array), `tenant`, `has_tenant`, `archived`, `trigger_data` (top-level keys only, exact match, AND logic, one value per key), and `inserted_at` ranges. [filtering feeds](https://docs.knock.app/in-app-ui/feeds/filtering-in-app-feeds), [OpenAPI feed params](https://docs.knock.app/api-reference/users/feeds/list_items)
- Groups that span several workflows (Discussion = types 1, 2, 10, 11; "Courses & Refunds") map to workflow categories or a shared `trigger_data` key, not to `source`. Today / Yesterday / Earlier grouping is ours to do from `inserted_at`.

### 5. Toasts for Discussion only

- `@knocklabs/react` has no toast component. Knock's guide binds to the feed client's real-time events and renders with a toast library. [toasts](https://docs.knock.app/in-app-ui/react/toasts)
- The client emits `items.received.realtime` for socket arrivals and `items.received.page` for fetches (`feed.ts`). Cadence can check `item.source.key` (or categories) and draw the themed toast decided in #6.
- The real-time socket uses Phoenix channels and needs Knock's WebSocket hosts allowed in the CSP. [socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior)

### 6. Hiding on soft-delete

- `POST /v1/channels/{channel_id}/messages/bulk/{action}` with `action = archive` filters by `trigger_data` (a JSON string), `engagement_status` (one of `seen`, `unseen`, `read`, `unread`, …), `recipient_ids`, `workflows`, `tenants` and date range. "For in-app channels, messages can be updated indefinitely." It is asynchronous and returns a `BulkOperation`. Tier 2 (5 req/s). [bulk update](https://docs.knock.app/api-reference/channels/bulk/update_message_status), [bulk endpoints](https://docs.knock.app/api-reference/overview/bulk-endpoints)
- `engagement_status: "unread"` targets only Unread messages, seen or not, and leaves read ones in history as #5 requires. The key is ours, for example `question_id` and `reply_id` sent as top-level trigger data.
- Archived messages are hidden from the default feed but can be unarchived. [archive](https://docs.knock.app/api-reference/messages/archive)
- If a run is still paused (delay or batch), cancel it too. Cancellation can't recall a message that's already delivered; "archive a message instead". [canceling](https://docs.knock.app/send-notifications/canceling-workflows#gotchas-and-recommendations)
- The action enum also lists `delete`. Its meaning (hard delete or not) isn't documented: **unverified**.

### 7–8. Suppression from our data (Open Refund Request, Enrollment only)

Knock has three tools for this.
- **Step conditions** check `data.*`, `recipient.*`, `tenant.*`, `vars.*`, audience membership and message status, and support `contains` against lists and timestamp operators. A false condition on the trigger step halts the run; on any other step it skips that step. [conditions](https://docs.knock.app/concepts/conditions), [step conditions](https://docs.knock.app/designing-workflows/step-conditions#types-of-step-conditions)
- **Recipient data is fresh after a delay:** "Recipient properties and preferences are re-read from your Knock environment each time a step executes." Subscription properties are the exception and are frozen at fan-out. [delay FAQ](https://docs.knock.app/designing-workflows/delay-function#frequently-asked-questions)
- **Cancellation** stops runs paused in a delay, batch, wait-for-event or fetch retry. It is keyed by `cancellation_key` and can be scoped to recipients. [canceling](https://docs.knock.app/send-notifications/canceling-workflows)

How each applies:
- **Open Refund Request.**
  - *Condition:* Cadence sets a property (such as `has_open_refund_request`) with Identify (`PUT /v1/users/{id}`, tier 3) when a request opens or closes. A step condition on each nudge's in-app step skips it while the property is true. A skipped step generates no message and no usage. [plans: message counts](https://docs.knock.app/manage-your-account/knock-plans#message-counts)
  - *Cancellation:* cancel the nudge runs when a request opens and re-arm them when it is declined.
  - Either way the state is mirrored from SQLite, so a missed Identify means a wrong decision. Both fit the free plan.
- **Enrollment only.** Event types: Cadence chooses recipients at trigger time. Delayed types (5, 6) can outlive the Enrollment, for example after an approved refund, or reach a Completed one. Cancel by the Enrollment's key on refund or completion, or condition on a mirrored recipient list such as `recipient.active_course_ids contains data.course_id`.
- A **fetch step** could ask Cadence over HTTP at step time ([fetch function](https://docs.knock.app/designing-workflows/fetch-function)), but Knock has to reach a public URL, which local dev doesn't have.

### 9–11. Nudge mechanics

- **Delay:** fixed up to 365 days, or dynamic (a timestamp, a duration, or a window rule in the recipient's timezone). It resumes within about 1–5 s of the due time. By default it continues on the latest published workflow version. [delay](https://docs.knock.app/designing-workflows/delay-function)
- **Not started (type 5):** delay 3 d, then an in-app step with conditions. The cancellation key comes from the Enrollment, and the first lesson start cancels the run.
- **Inactive 7 and 21 days (type 6):** one workflow (delay 7 d → in-app → delay 14 d → in-app) with one cancellation key covers both. Activity cancels it and triggers a fresh run.
  - Knock can't enforce "at most twice per Enrollment" across re-armed runs. Throttle counts per recipient and key, but its window is at most 31 days. "Once per recipient" trigger frequency is all-or-nothing per recipient, or per recipient and tenant. [throttle FAQ](https://docs.knock.app/designing-workflows/throttle-function#frequently-asked-questions), [trigger frequency](https://docs.knock.app/send-notifications/triggering-workflows/overview#controlling-workflow-trigger-frequency)
  - Cadence would pass how many Inactive nudges remain (for example `data.inactive_remaining`) and gate the steps with conditions. It learns what was sent by listing messages by `source` and `trigger_data`.
- **Re-arming on every watch event.**
  - *Cost:* triggers are unlimited on every plan and only delivered messages are metered, so a cancelled run costs nothing. [pricing](https://knock.app/pricing)
  - *Rate limits:* trigger and cancel are both tier 5, 1,000 req/s per environment. [OpenAPI `x-ratelimit-tier`](https://docs.knock.app/api-reference/workflows/trigger), [rate limits](https://docs.knock.app/api-reference/overview/rate-limits)
  - *Ordering caveats:* cancellation is deferred and runs concurrently. Knock advises against cancelling within 5 s of a trigger and warns that a cancel sent *before* a trigger can overtake and cancel it. So reusing one key with cancel-then-trigger can kill the fresh run. [canceling](https://docs.knock.app/send-notifications/canceling-workflows#gotchas-and-recommendations)
  - The trigger schema says the key "should be unique across trigger requests". Cancel cancels "any queued workflow runs associated with that key/cancellation key pair". [OpenAPI `TriggerWorkflowRequest`](https://docs.knock.app/api-reference/workflows/trigger), [cancel](https://docs.knock.app/api-reference/workflows/cancel)
  - Cadence's player posts a `progress` watch event every 10 s while playing (`app/components/youtube-player.tsx`), so re-arming on every event would run cancel and trigger pairs about every 10 s per watching Student. Rotating keys (stored per Enrollment) or debouncing avoids the overtaking risk. This is an implementation choice, not decided here.
- **Milestone 50% and Course Completed (types 7, 9):** plain event triggers. Cadence records that each one fired. Idempotency covers retries only within 24 h (see rule 12).

### 12. Idempotency

- Set an `Idempotency-Key` header of up to 255 characters. Only `POST /workflows/:key/trigger` honours it. A retry with the same key within 24 hours replays the original response with `idempotent-replayed: true`. Mismatched parameters return an error, and only 2xx responses are cached. [idempotent requests](https://docs.knock.app/api-reference/overview/idempotent-requests), [deduplicating runs](https://docs.knock.app/send-notifications/triggering-workflows/api#deduplicating-workflow-runs)
- The `@knocklabs/node` client adds `Idempotency-Key` to every non-GET request. It defaults to a random `stainless-node-retry-<uuid>` that stays stable only across the SDK's own retries (2 by default). An outbox needs to pass its own `idempotencyKey` request option, such as the Notification row ID, to survive a process restart (`@knocklabs/node@1.41.1` `src/client.ts`).
- An outbox retry more than 24 h later would not be deduplicated.

### 13. Billing and limits

- **Free plan:** up to 10,000 messages a month, where a message is one delivered message to one user on one channel; bounced and failed messages are excluded. Triggers and workflows are unlimited. Feed retention is unlimited, logs are kept 30 days, and environments are unlimited. "We don't hard cap your messages." Batching, conditional sending, scheduled workflows, fetch and preferences are "Yes" on every plan. [pricing](https://knock.app/pricing)
- **Enterprise-only features:** per-tenant preferences and branding, per-tenant guides, i18n, batch render limits beyond 10, custom roles, SAML, directory sync, warehouse export, and some extensions. Delay, batch, throttle, conditions and schedules are not on that list. [plans](https://docs.knock.app/manage-your-account/knock-plans#enterprise-features)
- **Usage accrues in every environment, development included.** "The in-app channel doesn't support sandbox mode"; use channel conditions to limit in-app messages outside production. [plans](https://docs.knock.app/manage-your-account/knock-plans#how-knock-meters-usage)
- **API rate limits** are per endpoint, scoped by environment (and also by user when the request carries a signed user token). Tiers: 1 = 1/s, 2 = 5/s, 3 = 60/s, 4 = 200/s, 5 = 1,000/s. Over the limit returns `429`. Batch and bulk endpoints add a dedupe limit of one update per second per entity. [rate limits](https://docs.knock.app/api-reference/overview/rate-limits), [batch rate limits](https://docs.knock.app/api-reference/overview/batch-rate-limits)
  - Tiers used here: trigger 5, cancel 5, list user messages 4, identify user 3, batch mark/archive 3, single message status 2, bulk channel update 2.
  - The feed list endpoint is tier 2 and "always scoped per-user and per-environment". [OpenAPI](https://docs.knock.app/api-reference/users/feeds/list_items)
- Triggers accept up to 1,000 recipients and 10 MB of `data`. [OpenAPI `TriggerWorkflowRequest`](https://docs.knock.app/api-reference/workflows/trigger)

### 14–15. React 19 and SSR

- `@knocklabs/react@0.15.1` peer dependencies: `react` and `react-dom ^17 || ^18 || ^19`. `next` and `@tanstack/react-router` are optional (npm `peerDependenciesMeta`). Next and TanStack code lives under the `./next` and `./tanstack` subpath exports, and the main entry starts with `"use client"` (package `exports`, `dist/esm/index.mjs`). `@knocklabs/react-core` says it is "not meant to be consumed externally" (its README), so headless use goes through `@knocklabs/react`.
- **No SSR guidance** exists in the docs. The only server-side mention is the Next.js quick start's `"use client"` component. [Next.js quick start](https://docs.knock.app/getting-started/quick-start/nextjs)
- What the source shows happens on the server (read, not run):
  - The socket is only created when `window` and `WebSocket` exist (`client/src/api.ts`).
  - Feeds have no socket manager on the server, so they skip real-time (`feed.ts`, `initializeRealtimeConnection`).
  - `useNotifications` creates the feed client in a `useState` initializer, which also runs during the server render. There is a `FIXME` about an extra instance in Strict Mode (`react-core/src/modules/feed/hooks/useNotifications.ts`).
  - `KnockProvider` creates and authenticates the client inside `useMemo`. With a user object and the default `identificationStrategy: "inline"`, `authenticate()` sends an identify request (`PUT /v1/users/{id}`), which would also fire during SSR. `identificationStrategy: "skip"` or `enabled={false}` avoids it (`useAuthenticatedKnockClient.ts`, `client/src/knock.ts`).
- **Badge on first render:**
  - A loader can call `GET /v1/users/{user_id}/feeds/{channel_id}` with the secret key (`client.users.feeds.listItems` in `@knocklabs/node`) and read `meta.unseen_count`.
  - The feed store starts at `items: []` and counts of 0, and has no way to seed it (`client/src/clients/feed/store.ts`). The client re-fetches on mount, so the server count has to be shown until the store loads.
  - Fetching doesn't mark items seen; headless UIs must call `markAllAsSeen`. [headless feed](https://docs.knock.app/in-app-ui/react/headless/feed#marking-items-as-seen)
  - Each page render then adds a Knock round trip and depends on Knock being up.

### 16. Local dev and the DevUI switcher

- **Environments:** each one has its own users, messages, logs and API keys. Enabling environments adds a development environment, can't be undone, and makes it the CLI's default target. [environments](https://docs.knock.app/version-control/environments)
- **Enhanced security** is off by default. While it's off, "a request with your public key can act as any user". Knock suggests keeping it off in development and on in production. [security](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-without-enhanced-security)
- **Inline identification on trigger:** pass recipient *objects* (`{ id, name, … }`), not ID strings, and Knock identifies them before the run. [triggering via API](https://docs.knock.app/send-notifications/triggering-workflows/api#identifying-recipients-inline), [identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients#faq-inline-identification-not-working)
- **Per-user tokens:** the server signs an RS256 JWT with `sub` (and ideally `iat` and `exp`) using `KNOCK_SIGNING_KEY`. `signUserToken` in `@knocklabs/node` defaults to a 1-hour expiry (`src/lib/tokenSigner.ts`). [security](https://docs.knock.app/in-app-ui/security-and-authentication#authentication-with-enhanced-security)
- **Switching users** in the DevUI means a new user ID and token from the loader. `useAuthenticatedKnockClient` re-authenticates the same client in place, and the feed subtree remounts because `feedProviderKey` includes the user ID. `Knock.authenticate()` tears down feed sockets and reinitializes them when the credentials change (`react-core/.../useAuthenticatedKnockClient.ts`, `client/src/knock.ts`).
- Cross-tab sync uses a `BroadcastChannel` named per user feed (`knock:feed:<userFeedId>`), so tabs signed in as different users don't share state (`feed.ts`).
- **Testing nudges:** trigger `settings.skip_delay: true` skips delay steps. Per-environment variables can shorten delays. [trigger settings](https://docs.knock.app/send-notifications/triggering-workflows/api#testing-workflows-with-trigger-settings), [delay FAQ](https://docs.knock.app/designing-workflows/delay-function#frequently-asked-questions)
- Trigger frequency isn't enforced in the dashboard test runner. [trigger frequency FAQ](https://docs.knock.app/send-notifications/triggering-workflows/overview#controlling-workflow-trigger-frequency)

## Could not verify

- **Bulk `delete` action:** what `POST /channels/{id}/messages/bulk/delete` does (hard delete or not) isn't documented beyond the enum value.
- **Bulk archive with filters:** that `engagement_status: "unread"` combined with `trigger_data` archives exactly the intended set comes from the OpenAPI schema only. Not tested against a live account.
- **Condition type coercion:** whether `contains` and equality are type-sensitive (number vs string IDs) isn't stated. Exact-match type sensitivity is documented only for feed `trigger_data` filters.
- **Archive-and-replace race:** two near-simultaneous bumps leaving two Unread summaries is an inference from asynchronous triggers, not observed.
- **SSR behaviour:** read from package source (versions above), not run under React Router 8. There's no official SSR statement.
- **Free tier overage:** no rate is published; Knock "will get in touch". Whether Free accounts are ever cut off isn't stated.
- **Seen marking on API reads:** whether a server-side `GET` of the feed ever sets `seen_at` isn't stated outright. The headless docs imply it doesn't (the count "never decreases" unless you mark items seen).
- **Prebuilt components on Free:** whether the prebuilt components show Knock branding on Free ("Remove Knock branding: No") doesn't affect headless UI, but this wasn't checked.
