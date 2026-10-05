# Store, playbook, scoring and mobile update — October 3, 2026

October 4 verification: **107 automated tests pass**, and web production build plus iOS/Android exports pass. The new waiver-export HTTP authorization assertions also pass. Native administration, typed forms, waiver exports, document expiry, recurrence updates and protected cloud playback are implemented locally. See [ADMINISTRATION-UPDATE.md](ADMINISTRATION-UPDATE.md) and [DESIGN-HANDOFF.md](DESIGN-HANDOFF.md). Live providers, physical devices and production release remain unverified.

Implemented and verified locally. This update advances the five requested areas; it does not complete production launch or every native staff workflow.

## Store

Web Team store and native Store now use a multi-item cart. Every line has a player, product, color, size, quantity and credit preference. A cart belongs to one family. Staff can add color variants with independent size inventory, replenish specific variants and adjust a player's annual clothing credits with a reason. The baseline remains two credits per calendar year; adjustments add or remove unused entitlement. Credit changes are audited and cannot remove already-used credits.

Reserve a cart for 15 minutes, then confirm it to create one invoice. Availability subtracts active reservations; expired holds no longer count even before another mutation runs. Reservation snapshots lock product prices and credit eligibility. Credits are calculated at order confirmation, not reserved, so the displayed estimate may change if another order uses credits. Unreserved browser drafts are not persisted. A saved reservation survives refresh. One active reservation is allowed per account; duplicate reservation requests cannot hold inventory twice.

Confirmation is serialized and idempotent by cart ID: a lost-response retry cannot create another order, invoice or credit debit. All lines are debited together. Unpaid invoices use the existing Stripe test checkout flow. A signed matching payment event updates every order line. Inventory remains committed to an unpaid order until staff cancel the whole cart; there is no automatic unpaid-order expiry. Staff cannot cancel a delivered cart, a paid cart, or a cart with an existing Stripe checkout session. Provider reconciliation is required first. Individual cart-line cancellation is intentionally blocked to keep the aggregate invoice consistent. A cancellation restores stock and credits once and voids the invoice. Refunds remain separate from cancellation.

Inventory reports include every color and available quantities; exported orders and printed labels include the purchased color. Older single-item records and the default variant remain compatible. Product images, variant archival, taxes/shipping, payment-session cancellation automation, and partial-cart returns remain outstanding.

## Playbook

Web Training hub → Coaching studio supports either five offensive players or five offensive players plus five defenders, consistently across up to 20 frames. Select a player/defender and move them on the court or use X/Y fields. Duplicate a frame, position the next frame, return to the prior frame and add a cut, dribble or pass route to the next position. Clear routes for an individual frame as needed. Web playback shows the saved route overlays and animates frame positions.

Native Training includes play creation, editing, team choice, frame navigation/duplication, defenders, numeric coordinate editing and route creation. Native routes are presented as labeled coordinates below the positional court; October 4 adds timed frame playback; smooth path animation and graphical route drawing remain outstanding. Routes are straight segments, not curved/freehand paths. Server checks retain coach/team scope and reject out-of-range or inconsistent frames/routes.

## Scoring

Web League hub and native League include a persistent start/pause clock, period and remaining-time controls, possession, +1/+2/+3 scoring and -1 correction, team foul/timeout counters with undo, and period-foul reset. Clock state uses server timestamps; clients display the elapsed time locally. Native League refreshes server state every three seconds while idle; web uses its existing live updates. It is not a certified scoreboard clock and is affected by client/server clock differences. There is no shot clock, automatic buzzer, automatic period advance or rules-engine enforcement of competition limits.

Concurrent game-control writes carry the observed control version and reject stale updates. Final scores stop the clock. Final games must be reopened before controls change them. Existing playoff tie and downstream-round correction checks still apply. Web finalization uses existing scoresheets; native has finalize/reopen controls. Native player-stat editing now supports points, rebounds, assists, steals, blocks and fouls; these stat lines are independent of team totals.

## Native staff parity

More → Reports now includes message-report evidence/review, clothing-credit adjustments, color/size inventory controls, unpaid-cart cancellation, and refund request/approval/rejection. Store supports fulfillment. Chat group owners can rename groups and remove other members. These actions reuse the existing scoped server APIs.

October 4 adds native program/season/schedule administration, invitations and staff-document review. Invitation revoke/reset management, provider refund submission/reconciliation, cloud purge controls and operational service administration still use the web workspace. The native additions are compiled exports, not physical-device sign-off.

## Launch validation and remaining inputs

`node scripts/launch-preflight.mjs` checks configuration locally, prints no secrets, performs no provider operations, and exits nonzero when required configuration is missing. All launch configuration checks were missing in this local demo. Stripe key/signing secret, email provider/sender, S3 bucket/region, MongoDB URI, EAS project, app identifiers and deployment URLs are not configured. Expo access credentials were also absent; presence alone would not prove APNs/FCM or device delivery works.

`mobile/eas.json` prepares internal preview and store build profiles. `mobile/app.config.js` requires an HTTPS API URL, EAS project ID and approved iOS/Android identifiers for those profiles. Configure `EXPO_PUBLIC_API_URL`, `EAS_PROJECT_ID`, `IOS_BUNDLE_IDENTIFIER` and `ANDROID_PACKAGE` in the appropriate build environment. `GOOGLE_SERVICES_JSON` may point to the Android Firebase configuration supplied through the build environment. No identifiers, accounts, signing credentials or submissions were invented. See [Expo build profiles](https://docs.expo.dev/build/eas-json/) and [push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

To validate launch, the organization must supply its hosting/domain choice, Stripe test account and webhook, verified email sender, private S3 access, MongoDB replica set/Atlas, Expo/EAS project, Apple Developer and Google Play accounts, and physical iPhone/Android devices. Put secrets in the server/build environment, not chat, web code or the source archive. Then execute the provider/device checklist in [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md). The server deliberately rejects live Stripe keys until test-mode acceptance and a reviewed live-mode change. No real charge, refund, email, push, cloud transfer, deployment, signed binary or store submission occurred in this batch.

## Verification

102 automated tests pass, including concurrent HTTP reservations, idempotent checkout retries, signed synthetic cart payment, stock/credit cancellation, color reports, credit limits, route validation and stale scoring controls. Web production build and iOS/Android exports pass. Browser checks exercised a two-line reservation/order/cancellation, game-clock start/pause and possession, and saving a two-frame ten-player defensive play with a route. Demo audit history retains those actions; cancelled demo orders remain visible. Physical-device, provider, screen-reader and production security/load acceptance remains outstanding.
