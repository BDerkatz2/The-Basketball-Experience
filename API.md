# API and persistence

## New integration endpoints

All routes below require a bearer session. Provider settings are server-only; tokens and keys are never returned in app state.

- `POST /api/schedule/assist`: staff-only `{...scheduleRequest, instructions}`. Returns a validated preview plus revised request and AI explanation. Does not publish. Supports AI changes to weekdays, blackoutDates and restHours.
- `POST /api/schedule/preview`: also accepts weekdays (ISO 1–7), blackoutDates, teamBlackouts keyed by selected team ID, restHours and courts. The existing schedule-plan action still requires the matching preview fingerprint.
- `POST /api/drive/import`: staff-only `{fileId, teamId}`. Imports a supported video from the configured club folder into authorized local storage.
- `GET /api/services`: staff-only nonsecret configuration booleans; configuration is not live verification.
- `POST /api/services/stripe-check`: administrator-only read-only test credential check; no charge.
- `POST /api/devices/register`: account-mode `{token}`. One Expo phone token per user; reassigning the token removes prior ownership. Tokens are not visible in state.
- `POST /api/devices/remove`: removes the signed-in user's phone registration. Logout does the same.
- `POST /api/services/send-pending`: administrator-only explicit send, accounts mode plus external-delivery flag required. Processes up to ten pending opted-in notices.
- `POST /api/services/push-receipts`: administrator-only retrieval of available receipts for accepted Expo jobs.

Delivery states now include sending, unknown, provider-accepted and push-service-confirmed. None automatically retries. See INTEGRATIONS.md for operator reconciliation and remaining provider/hardware tests.

The Express server serves the React build and API on one loopback origin. Native calls the same endpoints. JSON failures use `{error: message}` with an appropriate HTTP status. Protected endpoints require `Authorization: Bearer <token>`.

## Identity and state

| Endpoint                | Purpose                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| GET /api/health         | Runtime mode and storage health                                   |
| GET /api/config         | Account/demo mode and payment connection status                   |
| GET /api/demo-users     | Sample role choices; disabled in account mode                     |
| POST /api/demo-session  | Sample sign-in with userId; disabled in account mode              |
| POST /api/auth/register | Account-mode parent signup: name, email, password                 |
| POST /api/auth/login    | Account-mode email/password sign-in                               |
| POST /api/logout        | Revoke the session and close its live streams                     |
| GET /api/state          | Authorized snapshot with secrets removed                          |
| GET /api/stream         | Authenticated server-sent mutation signals; fetch state afterward |

Account endpoints have an IP-based attempt limit. Real account sessions persist as hashes and expire after eight hours. Demo sessions are in memory. See SETUP.md for limitations before deployment.

## Business operations

Use `POST /api/actions/{action}`. Successful mutations return `{ok:true}` and broadcast a content-free refresh signal. Clients refetch their scoped state.

Original actions: enroll, rsvp, checkin, order, fulfill, workout, assign, message, score, schedule and program.

Added actions:

| Action            | Key input                                                                          | Permission                                                            |
| ----------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| family-save       | id optional, name, email, membership                                               | Staff/admin                                                           |
| player-save       | id optional, name, familyId, teamId, age, number                                   | Staff/admin                                                           |
| team-save         | id optional, name, coach, division                                                 | Staff/admin                                                           |
| program-edit      | id, name, description, location, price, capacity, ages, sessions                   | Staff/admin                                                           |
| enrollment-cancel | enrollment id                                                                      | Owning parent or staff/admin                                          |
| product-save      | id optional, name, category, color, price, sizes comma-list, stock, creditEligible | Staff/admin                                                           |
| restock           | product id, size, quantity                                                         | Staff/admin                                                           |
| order-cancel      | order id                                                                           | Staff/admin; blocked for delivered/cancelled or payment-linked orders |
| session-edit      | id, title, start, minutes, location, address                                       | Staff/admin                                                           |
| session-cancel    | id                                                                                 | Staff/admin                                                           |
| drill-save        | id optional, name, category, instructions, minutes, sets, reps, rest               | Coach/staff; creator restriction for existing drills                  |
| play-save         | id optional, name, teamId, notes, frames                                           | Coach/staff in team scope                                             |
| video-save        | name, teamId, url OR fileId                                                        | Coach/staff in team scope                                             |
| video-tag         | video id, seconds, label, lines                                                    | Coach/staff in team scope                                             |
| bracket-create    | name, ordered teamIds                                                              | Staff/admin; 2–16 same-division teams                                 |
| game-stats        | gameId, playerId, points, rebounds, assists, steals, blocks, fouls                 | Staff/admin                                                           |
| staff-profile     | phone, emergencyContact, availability                                              | Staff/coach/admin for self                                            |
| staff-review      | userId, status, reviewNote                                                         | Administrator                                                         |
| form-save         | programId, title, waiverText, fields                                               | Staff/admin; creates immutable version                                |
| notification-read | id                                                                                 | Recipient only                                                        |

Play frames contain five `{x,y}` positions with integer coordinates 0–100. Video lines contain `[x1,y1,x2,y2]` percentage coordinates. Form fields use text/checkbox types. Registration submits formId, answers keyed by question ID, accepted:true and signature; stale versions fail.

## Uploads and reports

- POST /api/files?purpose=video|staff&name=...&teamId=...: raw application/octet-stream bytes. Returns file metadata. Team ID is required for videos.
- GET /api/files/:id: authorized download. No public static file directory.
- GET /api/export/calendar: scoped ICS calendar.
- GET /api/export/orders and /attendance: staff CSV reports with formula-prefix escaping.

File signatures and size limits are checked. This is not antivirus scanning or a complete production file-processing pipeline.

## Test payments

- POST /api/billing/checkout with invoiceId: server-authorized Stripe test checkout URL.
- POST /api/stripe/webhook: raw-body signature verification and idempotent payment-event processing.

Invoices originate from new orders/registrations; clients cannot supply the amount. Successful redirects do not mark paid. Only test Stripe keys are accepted. Live provider testing, refunds, subscriptions and tax handling remain outstanding.

## Persistence

Mutations work on a cloned state, validate, persist, and only then replace current state. Failed operations leave state unchanged. The file store uses a serialized queue and temporary-file rename. The optional MongoDB adapter stores entity collections inside a snapshot transaction with an optimistic revision record. It is designed for one application instance and currently loads the dataset into memory; production query/index, recovery and scale work remains.

The activity log records successful action, actor, target and timestamp without passwords or raw submitted personal data. It is not an immutable external audit ledger.

## Known implementation limits

Native refresh is pull-based. Team membership/coach assignments, advanced native tools, external communications, cloud files and production operational controls are incomplete. See QUOTE-SCOPE.md for the full remaining scope.

## Schedule previews

POST /api/schedule/preview is staff-only. Supply teamIds (2–12 same-division teams), start (local YYYY-MM-DDTHH:mm), timeZone (IANA), location, days (1–42), slots (1–8 daily), minutes (15–180), gap (0–120). It returns games, complete, unscheduled, explanation and fingerprint. POST /api/actions/schedule-plan with the same fields and fingerprint rechecks bookings and atomically creates events and league games. Incomplete or changed previews return 409. Suggestions are deterministic and may need a wider window; they are not an optimality guarantee or AI integration.

The schedule action accepts timeZone (defaults UTC for legacy callers). Local wall-clock time is retained across DST. Nonexistent and ambiguous recurrence times are rejected.

## Conversations

State includes authorized conversations (team, direct, group), filtered messages and name/role-only contacts. Private conversations require explicit membership even for staff administrators. Contacts share a team or include staff. Every pair of custom-group members must satisfy that rule when creating a group. Existing private membership persists through later team changes; organization-specific safeguarding and retention policy still requires review.

Actions under POST /api/actions/:
- conversation-create: kind (direct/group), memberIds (1–24 recipients, excluding caller), name (required for group). Direct conversations deduplicate by pair.
- message: channel, text (1–2000 characters). Author comes from the authenticated session.
- message-read: channel, messageId. Per-user marker cannot move backward; other users' read records are not exposed.
- message-delete: channel, messageId. Author only; clears text and retains an author-removal placeholder. Recovery is not implemented.
- conversation-leave: channel. Custom groups only; immediately removes server-side access to history. It cannot revoke copies already downloaded by a device. Rejoining and editing group membership are not implemented.

Web supports creating conversations and author removal. Mobile supports reading/replying and marking read; new conversations are created on the web. Neither sends email or device push.

## Chat attachments

POST /api/files?purpose=message&channel=CONVERSATION_ID&name=FILENAME accepts authenticated raw application/octet-stream bytes. The caller must currently belong to that conversation. PDF, PNG and JPEG magic signatures are accepted, up to 10 MB each. Signature checks are not malware scanning or full format validation.

Send a message with attachmentIds (up to three unique uploaded IDs). Each attachment must belong to the authenticated sender and match the conversation. Text is optional when attachments are present. Draft uploads are visible only to their owner; other current members gain download access once a nonremoved message references the file. Staff have no automatic access to private conversations. Removing a message removes its attachment references; the owner can still access retained uploads while a member. Other surviving message references can retain access. Leaving a group revokes future API downloads, not copies already downloaded.

Downloads are authenticated, served as attachments, use private/no-store caching and nosniff. Physical files remain stored after draft removal/message removal; quotas, abandoned-upload cleanup, retention and malware scanning remain launch work. Web supports uploads/downloads; mobile currently displays an attachment indicator and directs users to the web portal.

## Invitations and administrator-assisted recovery

Available only in APP_MODE=accounts. Administrators use POST /api/account-links with kind invite/reset and email. Invites require name and role (parent/player/coach/staff); parent/player require an existing familyId, player requires an unclaimed playerId in that family, coach takes teamIds. Administrator invitations are intentionally unsupported. Reset targets an existing account. Verify the account holder's identity through an established private process before issuing recovery links.

The creation response contains a token once. Only its SHA-256 digest is persisted. Invitations expire in 48 hours; recovery links in 30 minutes. Reissuing the same kind for the same address revokes older links. GET /api/account-links returns admin-only metadata without token hashes; POST /api/account-links/:id/revoke revokes a link. General state excludes these records entirely.

The web URL is /#account-link=TOKEN (fragment, not query string). POST /api/auth/redeem-link takes token and password. Password validation is 12–128 characters. Redemption is serialized and persisted atomically; invitation role/assignments cannot be overridden by the recipient. Reset revokes existing sessions. Sign-in is required afterward. No email is sent; POST /api/auth/recovery-request returns the same administrator-contact instructions to everyone. Email verification, self-service delivery, native deep links, audit expansion and MFA remain outstanding.

Latest native update: mobile now consumes conversation-create/leave, message attachment upload/download, and auth/redeem-link. Earlier statements that these are web-only are superseded. Native dialogs and deep links still require real-device QA. No backend authorization was relaxed; account-link tokens are submitted only to the build's configured API server.

## Recurring memberships

membership-plan action: administrator-only creation requires name, description, amountCents (100–1,000,000 CAD cents) and interval month/year. Prices are immutable; create a new plan for price changes. Existing id plus active boolean archives/restores a plan.

POST /api/memberships/checkout accepts familyId and planId. Parent access is restricted to their family; staff may manage families. Stripe test key and webhook secret are required. The server persists the plan-price snapshot and stable idempotency identity before creating a subscription Checkout Session. Pending sessions are reused; expired sessions receive a new attempt. One nonterminal membership per family is allowed. A redirect never activates membership.

POST /api/memberships/:id/manage accepts operation refresh/cancel/resume. Refresh retrieves the current Stripe subscription; cancel schedules cancel_at_period_end, and resume clears that flag for active/trialing/past_due subscriptions. Ended subscriptions require a fresh checkout. A pending abandoned checkout must be resumed/allowed to expire; plan switching and immediate cancellation are not implemented.

Signed Stripe events retrieve the latest subscription to resist out-of-order event payloads. Expected events: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid and invoice.payment_failed. Invoice snapshots are retrieved from Stripe and recorded once by invoice ID. Subscriptions validate test mode, family, subscription ID, single-item quantity and recurring price against the saved plan. Family membership status is updated without letting a historical canceled subscription overwrite its replacement. Membership invoices cannot be paid through the one-time invoice endpoint.

This is a test-only integration. Automatic retries follow Stripe settings; the app displays overdue status but payment-method recovery remains staff-assisted. Taxes, discounts, proration, plan changes, refunds, disputes, native membership UI, automatic entitlement policy, reconciliation jobs, and network-failure recovery beyond Stripe's idempotency retention need completion and provider testing.

## Local reminder processing and delivery staging
A serialized worker runs every 60 seconds while this single server is running. It generates deduplicated 24-hour session/workout reminders and membership overdue notices, then stages email/push jobs only for opted-in channels. There are no provider adapters and nothing is transmitted. Older notices predating channel opt-in are not newly queued. In-app notifications default on; email/push default off. Users can separately choose sessions/workouts/changes/payments.

notification-preferences action requires boolean inApp, email, push, sessions, workouts, changes, payments. General state returns only the current user's settings. Staff see deliveryQueue metadata; other users receive an empty queue. Staff actions reminders-run, delivery-test-failure (id) and delivery-retry (id) support immediate processing and explicit failure simulation. Simulated retries back off from one minute up to one hour, stop after five attempts, and never claim delivery. Manual retry requeues without resetting the historical attempt count. Jobs wait for an unconfigured provider; they are not automatically sent when time advances.

Cancellation, scope loss, preference opt-out, completed workouts and recovered payments suppress obsolete notices and cancel queued jobs. External session/workout jobs expire at their source time; other jobs expire after 24 hours. Cancelled/expired jobs are not resurrected by subsequent preference changes. Storage cleanup, multi-worker leases, real provider retry/receipts, device-token registration, email-address verification, timezone/quiet-hour controls, native settings UI and missed-reminder policy after prolonged downtime remain unfinished.

September 28 native update: the mobile Memberships screen consumes existing memberships/checkout and memberships/:id/manage endpoints. Mobile notification settings use notification-preferences with the seven boolean fields. No server authorization or billing semantics changed. Earlier references to absent native membership/settings UI are superseded; actual external delivery, provider tests and physical-device validation are still outstanding.

## Reusable training plans
training-plan-create is coach/staff-only and takes name, optional notes, and 1–12 unique drillIds in execution order. It stores immutable drill snapshots. Staff can use all plans; coaches only their own; players/parents see assigned workout snapshots rather than the plan library.

training-plan-assign takes planId, 1–30 unique authorized playerIds, start, timeZone and count (1–12 weekly assignments). Maximum 360 exercise rows per request. All roster checks, timezone validation and duplicate plan/player/due-date checks occur before writing assignments. Each player/date has a sessionId and one ordinary workout per exercise. Completion uses the existing workout result endpoint. Weekly local due times are preserved across DST; ambiguous/nonexistent times are rejected. Editing the drill catalog does not change saved plans or assigned snapshots.

Web Training provides creation, assignment and grouped completion summaries. Mobile renders plan names, exercise sequence, notes and frozen exercise details and uses existing completion controls. Plan editing, archive/cancellation, weight/load records, advanced progress charts and native plan authoring remain unfinished.
