# Company evaluation pilot

Prepared October 14, 2026. Hosting is prepared, not deployed. No company invitation has been sent.

## Purpose and boundaries

This is an invitation-only browser pilot for a small group of company testers. It runs the existing application and backend, supports separate accounts and retained changes, and can be opened on desktop, iPhone and Android browsers. It is not an App Store/TestFlight/Google Play release or approval to operate with real children’s data. Use fictional player/family details, test documents and small test video clips. Registration waiver text and branding remain pending organization approval.

APP_STAGE=pilot requires account mode, a clean HTTPS origin and an explicit data path. The server rejects configured Stripe keys or enabled external delivery/cloud uploads in this stage. Public signup and demo role-switching are disabled. An anonymous visitor can load the sign-in screen but cannot access application records. Invitations and recovery links are issued by the administrator and shared manually; the pilot does not send emails or push notifications. Invoices may be created for workflow evaluation, but they remain unpaid and no checkout runs.

## Activate hosting

1. Create your own account at https://dashboard.render.com/register. Complete account terms, identity/GitHub authorization and billing yourself. Review the displayed recurring cost before activating any resources. The supplied blueprint requests a paid 0.5 CPU / 512 MB service plus a 1 GB persistent disk; no cost is authorized or incurred by preparing this file.
2. In Render choose New → Blueprint and connect https://github.com/BDerkatz2/The-Basketball-Experience. Use main and the repository-root render.yaml. Grant the integration access only to the intended repository where possible.
3. Enter BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL and a unique 12–128 character BOOTSTRAP_ADMIN_PASSWORD in Render's secret fields, not GitHub or chat. This creates the first administrator. Do not set provider credentials. The server uses Render's supplied RENDER_EXTERNAL_URL for its trusted HTTPS origin; set APP_URL explicitly only when adding a custom domain.
4. Review the resource summary and cost, then activate the Blueprint. Wait for a successful deploy. Render must build the project and attach its disk; the configuration has not yet been validated by a Render deployment.
5. Open the assigned onrender.com URL and sign in. Remove the bootstrap password variable after confirming the account works. The persisted administrator remains; clearing the data disk would require deliberate re-bootstrap. Keep a password manager copy and configure recovery with the operator.
6. Run the read-only check with PILOT_URL set to the hosted HTTPS origin: node scripts/check-pilot.mjs. It verifies readiness, pilot settings, anonymous record denial and disabled demo access. Then perform the workflows below before sending the URL.

The service runs exactly one instance. /var/data/accounts.json and /var/data/uploads reside on the persistent disk. Do not switch to an ephemeral/free service: changes/uploads would be lost on redeploy. A persistent disk is not a backup; follow LAUNCH-RUNBOOK.md for encrypted file/media backup and restore. Test a restart and confirm records/uploads survive on the hosted disk. Auto-deploy is disabled so later commits do not unexpectedly change a company test session.

Render references: https://render.com/docs/blueprint-spec and https://render.com/docs/disks. This configuration starts in the provider's default region; confirm data-location requirements before any later real-data launch.

## Prepare the company's test workspace

The hosted account database starts empty, intentionally separate from the local demo. In Operations → Manage your community, create fictional families, teams, players, programs and store products. Associate players with families/teams. Add test schedule events, drills, a play and a training assignment. Create a test registration form with wording explicitly identifying it as an evaluation sample, not approved operational terms.

Use Operations → Account invitations & recovery to invite named staff, coaches, parents and players into the appropriate test roles. Coach invitations need the intended team; parents need a family and players need their family/player record. Send individual single-use links through your established private communication channel. Do not share the bootstrap administrator password. Staff can exercise routine management; owner-only actions can be demonstrated by the administrator on a call.

## Acceptance walkthrough

Record each result with date, browser/device, role, steps, expected result, actual result and screenshot where appropriate.

- Sign in as staff, parent and coach in separate browser profiles; confirm each sees only their permitted records.
- Update family details, register a fictional player, inspect saved answers/waiver record, join a full program's waitlist, and cancel a test registration.
- Reserve a store cart, confirm an order, review the unpaid invoice, fulfill a test order, and verify inventory. Archive/restore a product and confirm it disappears/reappears for shoppers.
- Create/edit a play; archive and restore it. Assign a workout, record a result as the parent/player and inspect coaching feedback/progress.
- Create a practice, RSVP, record attendance and review it on another account. Exercise a tournament preview and scoring controls.
- Send an in-app test message, report it and review it as staff. Upload a fictional staff document and verify unrelated users cannot download it.
- Upload a small test video, review/tag it and check access from an authorized team account.
- Refresh, sign out/in and restart the host. Confirm saved records and uploaded files remain.
- Try phone portrait/landscape, keyboard navigation and a screen reader; record problems rather than treating build success as device approval.

Do not mark payments, delivery, Drive, cloud playback or native phone capabilities accepted during this pilot. Those require configured providers/devices and separate verification.

## Local verification evidence

112 automated tests pass, including private pilot configuration, blocked public signup, disabled demos, authenticated writes and retained records after server restart. Web production build passes. Render deployment, hosted-disk persistence, company access and phone-browser acceptance have not yet been performed. Native code is unchanged in this batch.

## Draft message to send after hosted checks pass

The Basketball Experience pilot is ready for your evaluation at [verified hosted URL]. I will send your individual invitation separately. Please use fictional player details and test files. You can evaluate registrations, schedules, store management, training/playbooks, messaging and administration. Payments and external notifications are disabled. Please record issues with the steps, device/browser and expected outcome. This pilot is for workflow feedback before live-service and release approval.
