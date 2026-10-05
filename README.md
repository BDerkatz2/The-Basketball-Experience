# The Basketball Experience

October 5: product/play archive and restore controls are available on web and native. Existing orders and play records are preserved; archived products cannot be newly ordered. **110 tests pass**, plus web build and iOS/Android exports. See [ARCHIVING.md](ARCHIVING.md).

October 4 verification: **107 automated tests pass**, and web production build plus iOS/Android exports pass. The new waiver-export HTTP authorization assertions also pass. Native administration, typed forms, waiver exports, document expiry, recurrence updates and protected cloud playback are implemented locally. See [ADMINISTRATION-UPDATE.md](ADMINISTRATION-UPDATE.md) and [DESIGN-HANDOFF.md](DESIGN-HANDOFF.md). Live providers, physical devices and production release remain unverified.

October 3 store/scoring update: multi-color carts and reservations, adjustable credits, ten-player playbook routes, persistent clock/possession/team controls, expanded native staff tools and release configuration are implemented locally. **102 tests pass**; web and iOS/Android exports pass. Live services and physical devices remain unverified. See [STORE-PLAYBOOK-SCORING.md](STORE-PLAYBOOK-SCORING.md).

October 3 update: payment recovery and staff refund approval/reconciliation, video management and private S3 copy preparation, player progress and coaching feedback, message reporting/moderation and group controls, plus deployment configuration, encrypted local backups and readiness monitoring. **95 automated tests pass**, web builds and iOS/Android exports pass. See [OPERATIONS-UPDATE.md](OPERATIONS-UPDATE.md) and [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md). Live providers, Docker deployment and physical phones remain unverified.

Latest September 29 update: native training-plan creation/assignment, configurable registration eligibility and per-program season rollover, skipped practice dates, expanded tournament constraints, persistent phone video drafts with safe retries, fine seeking/loops, and a complete synthetic-payment training journey. See [COMPLETION-BATCH.md](COMPLETION-BATCH.md) for use, validation and limits.

React web portal, React Native mobile client and Node/Express backend based on the supplied five-page quote. This is a usable local development build. The full quote and production launch remain in progress; see [QUOTE-SCOPE.md](QUOTE-SCOPE.md).

Latest update: native video recording/review, advanced scheduling constraints, optional AI drafts, Drive import, Stripe test validation and email/push adapters. See [INTEGRATIONS.md](INTEGRATIONS.md) for setup and remaining live checks.

## Run

Open http://127.0.0.1:4173 while the local server is running.

```sh
pnpm install
pnpm build
pnpm start
```

Requires Node.js 22.13+ and pnpm. `pnpm dev` enables Vite development middleware. `Start-App.ps1` starts the installed build on the original computer. `--production` selects compiled frontend files; it does not enable live payments or publish the app.

## Implemented locally

- Family accounts, role-scoped players, enrollment-based web hubs, shared schedules and calendar export.
- Registrations, capacity checks, cancellation, custom questions and versioned signed waiver records.
- Family/player/team/program/product management and an activity log.
- Bulk scheduling, session edits/cancellation, coach/court/team/player overlap checks, RSVPs and attendance.
- Authenticated web live updates and recipient-scoped schedule notices.
- Size inventory, player-linked orders, annual tee credits, replenishment, cancellation reversal, CSV reports and printable delivery labels.
- Editable drills, strength sets/reps/rest, assigned workouts and result logging.
- Multi-frame five/ten-player tactical playbooks with routes and native frame playback.
- Uploaded or linked training videos, timestamped tags and arrow overlays.
- Division standings, staff scoresheets, player stat lines and seeded 2–16-team playoffs with byes and automatic advancement.
- Staff onboarding, private documents and administrator review.
- Team, direct and custom group text chat, per-member unread tracking, group leave and author-only message removal.
- Separate account mode with parent registration, salted passwords and hashed expiring sessions.
- Configurable MongoDB adapter and Stripe test checkout/webhooks; service connection tests remain outstanding.

Demo records persist in `data/demo.json`. A fresh installation seeds sample data. The current preview also retains sample records created during browser checks.

## Mobile

```sh
cd mobile
pnpm install
pnpm start
```

The native client includes home, schedules/check-in, program registration and custom forms, player-linked store orders, workouts, playoffs, scores, chat, in-app updates and account sign-in. Training-plan authoring and assignment are available on mobile. More → Administration includes program/season rules, schedule generation, invitations and staff-document review. Playbook editing and frame playback are also available. Native form authoring and operational service controls remain outstanding.

Android emulator API: `http://10.0.2.2:4173`. iOS simulator API: `http://127.0.0.1:4173` on macOS. Physical phones need a secured development API configured through `EXPO_PUBLIC_API_URL`; the current loopback server is not reachable from a phone. Both native JavaScript bundles compile, but device QA and signed releases have not been completed.

## Accounts and services

See [SETUP.md](SETUP.md) and `.env.example`. Account mode uses a separate data store and disables demo sign-in. Stripe accepts test keys only; checkout stays disabled until configured. The MongoDB adapter is implemented but not connected to a real database for integration testing. Run only one application server per dataset.

## Validation and code

`pnpm test` runs the domain and HTTP tests; `pnpm build` compiles the web client. 107 tests passed. See [VALIDATION.md](VALIDATION.md) for evidence and limits.

- `src/`: web UI, feature modules and account screens.
- `server/domain.js` and `extended.js`: business rules and scope enforcement.
- `server/auth.js`, `storage.js`, `billing.js`: accounts, persistence and payment integration.
- `server/index.js`: API, live events, uploads and exports.
- `mobile/`: Expo / React Native source.
- `tests/`: automated validation.

Remaining work includes account email delivery and verification, recurring memberships and financial lifecycle, native device validation and moderation, email/push, cloud media, scheduling optimization, native parity, security/accessibility/device QA and deployment.

Web chat supports up to three PDF/PNG/JPEG attachments per message (10 MB each), with membership-protected downloads. Upload scanning, storage cleanup and physical-device validation remain incomplete.

Account mode now includes administrator-issued invitations and single-use password recovery links, expiration/revocation, server-bound role assignments, and session revocation after reset. Delivery is manual; email delivery and device validation remain outstanding.

Native chat now supports direct/group conversation creation, group leave, file picking/upload and authenticated save/share. Account mode includes invitation/recovery link redemption and a custom tbe URL scheme for rebuilt native binaries. iOS/Android bundles compile; hardware QA and signed releases are still required.

Recurring membership workflows are now available on the web: immutable monthly/yearly CAD plans, archive/restore, family checkout, renewal dates, cancellation at period end, resumed renewal, failed-payment status and recurring invoice records. Stripe test integration is prepared and mocked lifecycle tests pass; actual Stripe account/webhook testing remains outstanding. Existing mobile and one-time-payment limitations still apply.

Local reminders now run every minute while the server is running. Overview includes notification preferences; Operations includes the durable delivery queue and explicit no-send retry simulations. Email/push remain disconnected and no outbound message is sent. Existing mobile Updates can show generated in-app reminders on refresh; native settings and actual push still require implementation.

September 28: mobile Memberships now supports family plan review, Stripe test checkout handoff, status refresh, recurring invoices, cancel-at-period-end and resumed renewal. Mobile Updates includes all notification preferences. These features supersede earlier notes that native membership/settings UI was missing. Signed binaries, device QA and provider validation remain required.

Family calendar now offers month, week and agenda views on the web, with previous/next/today navigation, date selection, player/search filters, optional cancelled sessions, and event-detail/RSVP links. Day layouts use local calendar dates and include overnight sessions on each affected day. Narrow screens can scroll the calendar horizontally. Native month/week views and a subscription feed remain outstanding.

Native Schedule now includes month/week/agenda calendars, player and text filters, date navigation, optional cancelled sessions, and selected-day RSVP/attendance controls. Web and native use shared date calculations. Native calendar UI is compiled but has not been tested on a physical device; the calendar subscription feed remains unfinished.

Training now supports reusable plans of up to 12 exercises and weekly assignments to authorized players. Plans preserve instructions/sets/reps/rest, show grouped completion on the web and exercise labels on mobile. Coaches create/assign plans in the web Training hub. Existing single-drill assignment remains available.
