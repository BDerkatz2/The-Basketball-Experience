# Quote implementation status

October 5: product/play archive and restore controls are available on web and native. Existing orders and play records are preserved; archived products cannot be newly ordered. **110 tests pass**, plus web build and iOS/Android exports. See [ARCHIVING.md](ARCHIVING.md).

October 4 verification: **107 automated tests pass**, and web production build plus iOS/Android exports pass. The new waiver-export HTTP authorization assertions also pass. Native administration, typed forms, waiver exports, document expiry, recurrence updates and protected cloud playback are implemented locally. See [ADMINISTRATION-UPDATE.md](ADMINISTRATION-UPDATE.md) and [DESIGN-HANDOFF.md](DESIGN-HANDOFF.md). Live providers, physical devices and production release remain unverified.

October 3 store/scoring batch supersedes older rows: multi-color variants, multi-item carts, 15-minute reservations, annual credit adjustments, ten-player plays/routes, game clock/possession/fouls/timeouts and expanded native staff tools are implemented locally. **102 tests pass**. [STORE-PLAYBOOK-SCORING.md](STORE-PLAYBOOK-SCORING.md) records exact behavior, limits and missing launch inputs.

October 3 operations batch supersedes corresponding older rows below: failed-payment recovery, one-time invoice refund requests/approval/provider reconciliation, video rename/delete/restore and cleanup, private S3 copy preparation, weekly training progress and coaching feedback, message reports/staff moderation/group ownership controls, Docker configuration, encrypted local backup/restore and readiness monitoring are implemented. **95 tests pass**; web and native exports pass. Provider validation, cloud playback/sync, production deployment and physical-device QA remain outstanding. See [OPERATIONS-UPDATE.md](OPERATIONS-UPDATE.md) and [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md).

Next priorities: configure and validate providers in staging, physical-device QA and signing, complete remaining native form/service administration, and close the remaining forms/media/scheduling/design acceptance gaps. Store returns, taxes, archival, curved routes and competition-specific scoring rules need final scope decisions.

September 29 completion batch: native plan creation/assignment, configurable age/membership/registration-window rules, per-program season-copy rollover, skipped weekly dates, one/two tournament rounds with daily limits, phone video draft recovery and review loops, and keyboard/security improvements are implemented. **87 tests pass**, including the signed synthetic-payment training journey. See [COMPLETION-BATCH.md](COMPLETION-BATCH.md) for exact scope and limits. External integrations and real-device testing remain unverified.

September 29 workflow update: parent profile/player management, FIFO waitlists with expiring reserved offers, training-plan edit/archive/session cancellation, mobile navigation improvements and searchable staff reports are now implemented. 82 tests pass. See [WORKFLOWS.md](WORKFLOWS.md) for exact behavior and remaining limits; this update supersedes corresponding older rows below.

Updated September 28, 2026. Source: App Quote and Details Page 1–5.pdf. The provided pages describe features and technology but contain no price, timeline or final acceptance criteria. The user separately authorized building from scratch.

**Implemented locally** does not mean production sign-off. **Integration prepared** means code exists but the external service is not connected and tested. The full quote is still in progress.

Latest update supersedes the older video/scheduling/notification rows below: native camera/library capture and review; multi-court/weekdays/blackouts/team availability/rest constraints; optional OpenAI draft adapter; folder-restricted Drive import; Stripe test credential check and signed HTTP webhook tests; Resend and Expo device/send/receipt adapters are implemented. All 76 automated tests pass. Providers remain unconfigured and phones untested. Cloud storage/sync, full optimization, email delivery webhooks and automatic external dispatch remain outstanding. See [INTEGRATIONS.md](INTEGRATIONS.md).

| Quote area               | Implemented / prepared                                                                                  | Remaining                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dynamic hubs             | Enrollment-derived web navigation and badges                                                            | Full entitlement rules and mobile parity                                                           |
| Family calendar          | Month/week/agenda views, date navigation, player/search filters, RSVP and ICS export                                                             | Native device validation and subscription feed                                                                |
| Web and native apps      | React portal and expanded React Native client; both bundles compile                                     | Native feature parity, device QA, signing, stores                                                  |
| Roles and accounts       | Scoped server authorization; parent signup; hashed passwords and sessions; separate demo/account stores; admin-issued invitations and recovery links | Email delivery, verification, MFA, configurable roles                                       |
| Activity management | Program create/edit, eligibility windows/ages/membership, FIFO waitlists, capacity, cancellation and closed season copies | Birth-date/cutoff rules, bulk season migration and full refund lifecycle |
| Mass scheduling | DST-aware 1–12-week batches, skipped dates, individual and following-session edits, atomic conflicts; native tournament controls | Arbitrary recurrence rules and global tournament optimization |
| Family CRM | Family/player/team editing, self-service profiles and recurring membership workflows | Provider/device validation and advanced CRM automation |
| Forms and waivers        | Typed text/long answer/checkbox/email/number/date/select fields, immutable signed records, scoped JSON export and approval-reference tracking | Approved wording, native form authoring, polished PDF records                                                   |
| Check-in                 | Coach/staff attendance, web live refresh and CSV                                                        | Offline handling and native live subscription                                                      |
| Products | Multi-color variants, product editing, independent size inventories | Images and variant archive rules |
| Inventory | Serialized cart holds, 15-minute expiry, legacy-order reservation guards, restocking | Production database/load validation, long-lived unpaid-order policies |
| Player-linked orders | Multi-item family carts, one invoice, player/color snapshots and retry-safe checkout | Partial returns and payment-session cancellation automation |
| Fulfillment              | Player/coach table, delivered status, CSV and printable labels                                          | Shipping and advanced fulfillment                                                                  |
| Credits | Two annual baseline credits, audited grants/removals, cancellation reversal | Organization acceptance of grant policies |
| Drill archive/playbook | Drill editing; five/ten-player framed tactics, cut/dribble/pass segments, native editing and timed frame playback | Rich media catalog, curved routes and smooth native path animation |
| At-home workouts/results | Web/native plan authoring and weekly assignment, snapshots, editing/archive/cancel and results | Load/trend analytics and physical-device validation |
| Video analysis | Native camera/library, safe retry/drafts, slow review, 0.1s seek, loops, timestamps and lines | Hardware QA, frame-accurate stepping, transcoding, background/chunked transfers and cloud storage |
| AI-assisted scheduling | Multi-court round robin, weekdays/blackouts/rest, daily limits/home-away rounds, optional AI adapter | Provider validation and global optimization |
| RSVPs                    | Player availability and live web updates                                                                | Push and offline behavior                                                                          |
| Live scoring/stats | Scoresheets, standings, player stats, persistent clock, possession, team fouls/timeouts and native controls | Shot clock, automatic period progression, competition-specific rules and device validation |
| Playoff brackets         | Seeded 2–16 teams, byes, advancement, champion, correction guards                                       | Reseeding and alternative formats                                                                  |
| Media integration | Scoped local/private S3 playback and folder-restricted Drive importer | Live provider verification, OAuth onboarding, continuous sync and sharing lifecycle |
| Staff onboarding         | Web/native profiles, private upload/download, expiry/supersession and review; native invitations | Authenticity verification, scanning/retention, automated expiry reminders                                               |
| Maps                     | Google Maps links                                                                                       | Real venue addresses, Apple Maps selection                                                         |
| Finance / Stripe         | Invoices, test checkout, signed/idempotent amount-bound webhooks                                        | Connect/test Stripe; taxes, refunds, disputes, PDFs, payment-method recovery and live launch |
| Communication | Scoped chat/files/live updates, report evidence/staff moderation, group ownership controls on web/native | Email reminders and physical-device validation |
| Notifications | Recipient notices, reminders/preferences, durable queue, Resend/Expo adapters, device tokens and receipts | Provider/hardware validation, delivery webhooks and automatic external dispatch |
| MERN stack               | React, RN, Node/Express; optional MongoDB adapter                                                       | Database integration tests, indexes/queries/migrations, backup/load tests                          |
| Cloud infrastructure | Docker configuration, encrypted local backups, readiness monitor, private S3 copy adapter | Actual resources, TLS/secrets, provider validation and recovery exercises |
| Design deliverables      | Responsive design, editable SVG board and seven workflow diagrams | Approved branding and native Figma component source                                            |
| QA/documentation | 107 tests, signed synthetic payment journeys, browser checks, web/native exports and runbooks | Real-device, screen-reader, load and production security audits |
| Deployment | Local preview/source archive, Docker and EAS profiles, signed-build configuration guards | Provider setup, CI/CD, hosting, signed binaries and store submissions |

## Next implementation priorities

1. Configure Stripe test webhooks, verified email, Expo/APNs/FCM, private storage and MongoDB staging. Run actual provider journeys and backup recovery.
2. Test on physical iPhone/Android hardware, close accessibility/performance issues and complete remaining native administration.
3. Complete remaining forms/evidence exports, staff-document lifecycle, media cloud playback and scheduling optimization against agreed acceptance criteria.
4. Approve branding/Figma/flow deliverables and organization rules.
5. Deploy TLS hosting, validate operations, create signed binaries and submit through organization-owned store accounts.

See [STORE-PLAYBOOK-SCORING.md](STORE-PLAYBOOK-SCORING.md) for this batch and [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md) for launch checks. Prepared code is not a verified live integration.
