# Deployment and recovery runbook

Prepared October 3, 2026. Not a launch approval.

## Staging deployment

1. Review organization-approved pricing, waivers, eligibility, privacy/retention and moderation policies. Use test data and test credentials for staging.
2. On a host with Docker, create an untracked `.env.production` from `.env.example`. Set `APP_URL` to the staging HTTPS origin, bootstrap administrator variables for initial startup, and optional provider test credentials. Never bake credentials into the image or mobile build. Remove the bootstrap password after creating the administrator.
3. Run `docker compose build`, then `docker compose up -d`. The image runs as the node user, accounts mode, with dropped Linux capabilities; the published port binds only to host loopback. Put an HTTPS reverse proxy in front of it and configure request/time limits to accommodate the 100 MB video cap. Do not expose the raw development port.
4. Keep the `app-data` volume durable: it contains the file database and uploaded media. Use one application instance. The current snapshot-based database adapter is not ready for horizontal scaling. If using MongoDB, configure a transaction-capable replica set and verify database backups separately; uploads still require a volume backup.
5. Verify `/api/health`, `/api/ready`, sign-in, role isolation, private downloads, registration and a Stripe test checkout. Verify webhook signatures, renewal/failure paths, refund pending/success/failure and duplicate delivery. Check S3 public access remains blocked before enabling cloud copies.
6. Record release version, Node/dependency versions, image digest, configuration ownership and rollback target. Docker was not available in this workspace; building and validating the container is still required.

## Encrypted local backup and restore

`scripts/backup.mjs` is for the JSON/file store only. It includes the data snapshot and non-purged uploaded files, encrypted with AES-256-GCM and a scrypt-derived key. It refuses media totals over 256 MB; use encrypted volume snapshots for larger installations. It does not back up MongoDB, remote S3 versions, provider state, or environment secrets.

1. Stop the application and verify it has stopped. Set `BACKUP_PASSWORD` securely in the operator environment (at least 16 characters; use a strong generated value). Keep it separate from backups. Do not paste it into a shell command or source file. The `--server-stopped` flag is an operator acknowledgement, not an automatic lock check.
2. Run `node scripts/backup.mjs backup /absolute/path/accounts.json /absolute/path/backup.tbe --server-stopped`. The destination must not exist. Missing referenced files fail the backup rather than silently producing an incomplete copy.
3. Restart the app and check readiness. Copy the encrypted archive to your chosen restricted backup location. No recurring job or remote destination has been configured; schedule this through the deployment's backup system and alert on failure or stale backup age.
4. Test restore to a new directory: `node scripts/backup.mjs restore /absolute/path/backup.tbe /absolute/path/new-restore-directory --server-stopped`. Authentication must succeed before output is created. Existing destinations are rejected. `restored.json` and its `uploads/` directory are written together; do not restore over the running app.
5. Restored sessions are revoked. Approved/in-flight/pending refunds become unknown and need reconciliation; interrupted external deliveries become unknown. Keep all external delivery disabled while reviewing the restore. Compare invoices, subscriptions, refund requests, cloud copies and notification records against provider state before allowing new provider actions. Restoring an old local snapshot cannot roll back a provider transaction.
6. Point a separate staging instance's `DATA_FILE` at the restored JSON, verify private media and sample account access, then document record/file counts and recovery duration. Keep the previous live volume available for rollback. Do not switch live traffic until this verification passes.

The automated test verifies local encrypted round trip, wrong-password rejection, session revocation, uncertain refund handling and refusal to overwrite. A real disaster-recovery rehearsal and restore of the deployed database remain required.

## Monitoring

- `/api/health` is basic liveness. `/api/ready` returns 503 after a failed persistence write and 200 again after a successful write; it is not a continuous disk/Mongo/provider probe.
- `node scripts/monitor.mjs` performs a five-second readiness request and emits JSON with a nonzero exit code on failure. Set `MONITOR_URL` for staging. Wire this into the hosting platform's health checks/alerts; no scheduled monitor was created here.
- Operations → Launch & storage operations shows uptime, storage kind, cloud configuration, uncertain refunds, eligible video cleanup and pending purges. Configuration does not prove provider connectivity.
- Before launch, add alerts for disk space, server error rate, slow requests, stale backups, missing webhooks, provider delivery failures and growing pending purge/refund queues. Keep logs free of passwords, tokens and message bodies. Test an alert and a recovery notification.

## Physical-phone acceptance checklist

Use signed development builds on at least one actual iPhone and Android phone. Record device, OS, app version, tester, result and evidence for each case.

- [ ] Parent sign-in, logout, recovery link, session expiry and shared-device account switch.
- [ ] Family edits, eligibility rejection, full-program waitlist, offer expiry and current waiver/form acceptance.
- [ ] Test checkout handoff/return, failed payment retry, no duplicate invoice charge and displayed refund status.
- [ ] Coach creates/edits/assigns a multi-exercise plan; parent completes it; progress/feedback refresh correctly.
- [ ] Camera/microphone/library permissions: approve, deny and later restore permission.
- [ ] Video selection, upload timeout/pause, network interruption, app termination, draft recovery and repeated retry without duplicate clip.
- [ ] Private playback, slow speed, seeking, loop start/end, line drawing/undo, and rotated display.
- [ ] Clip rename/delete/restore; deleted file cannot be fetched; grace-period purge and cloud retention checked in staging.
- [ ] Team/direct/group chat, file attachment, message report, staff review, removed message and removed group member access.
- [ ] Opt-in push received on real device, sign-out token ownership, preference opt-out; real email verification in a test mailbox.
- [ ] VoiceOver/TalkBack labels, focus order, dynamic text, contrast, touch targets, reduced motion and keyboard behavior.
- [ ] Poor/no network, expired auth while submitting, double taps, background/foreground and unsaved input recovery.
- [ ] Cross-platform calendar time zones/DST, new season registration, small-screen layouts and safe-area/keyboard overlap.

App-store signing, account ownership, privacy disclosures, screenshots, review notes, provider approval and production rollout are separate unfinished launch steps.
