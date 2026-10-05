# Operations update — October 3, 2026

Implemented locally. The application remains in development; no external account was connected, no payment/refund was sent and no deployment was performed.

## Payments

Web Members/Operations shows failed or expired checkouts and retry controls; mobile Family now includes one-time invoices and test checkout retry. Signed failed/expired events are recorded without downgrading paid invoices. Open Stripe sessions are reused. Paid or still-processing sessions block a second checkout. Failure counts include expired sessions; closing a browser alone is not treated as a payment failure.

Staff request partial or full refunds against paid one-time invoices with a recorded payment intent. Requested/approved/pending/uncertain/succeeded amounts reserve the paid balance, preventing over-refunding. Administrators approve or reject, then explicitly submit an approved refund to Stripe test mode. A durable sending state and stable request key are saved first. A network or provider error leaves the outcome unknown; it cannot be resubmitted automatically. Administrators reconcile using the Stripe refund ID, verified against the request metadata, amount, currency and payment intent. Signed refund events also update the record. Provider-confirmed failures/cancellations release the reservation.

Refunds do not cancel registrations, restore stock/credits or cancel subscriptions. Subscription refunds, taxes, disputes, payment-method update flows and live-mode launch remain outstanding. Unknown requests without a provider refund ID need provider-dashboard investigation; this implementation deliberately does not guess whether retrying would be safe. Test-mode keys/events remain mandatory. See [Stripe refund creation](https://docs.stripe.com/api/refunds/create) and [idempotency behavior](https://docs.stripe.com/api/errors/handling).

## Video and private cloud preparation

Coaches/staff can rename, soft-delete and restore clips from Training hub → Manage video library, and from the native Video screen. Deleted clips and their uploaded files are removed from normal authorized reads. External link originals are not deleted from their host.

Administrators can review cleanup candidates in Operations. Unreferenced video uploads and soft-deleted video files become eligible after seven days; active references and recent deletion protect a file. Purging first revokes access durably, then removes local bytes and requests deletion of configured cloud objects. Failed purges remain pending for retry. Staff documents and chat attachments are excluded. Restoration is rejected once purging begins. Orphan files that have no metadata because of an interrupted disk/database write require separate operator reconciliation.

Optional private S3 copies use the official AWS SDK and a server IAM role. Configure `ENABLE_CLOUD_UPLOADS=true`, `S3_BUCKET`, and `AWS_REGION`. The bucket must have all four public-access-block settings enabled. The app checks this before copying, sets SSE-S3 encryption, uses stable `private/videos/<file-id>` keys and records pending copies before upload. Keep public access blocked, disable ACLs, require HTTPS, and scope the IAM role to bucket public-access inspection plus PutObject/DeleteObject under that prefix. Changing the destination of an existing copy requires explicit migration outside this workflow. [AWS guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html).

Playback still uses local authorized storage. This is a prepared cloud-copy adapter, not cloud-native playback, multipart/direct phone upload or a complete media migration. S3 versioning, replication and object-lock policies can retain older copies after deletion; configure and verify their retention/lifecycle separately. No AWS request was made during verification; the transport was mocked.

## Training and moderation

Web/native Training shows completion/overdue summaries and the most recent 12 UTC weeks with recorded results. Shooting percentages are weighted by total attempts, not averaged across exercises. Cancelled assignments are excluded from completion totals. A week without results is omitted rather than plotted as zero. Coaches/staff can add feedback visible only to that player's authorized family/roster. Existing results are not changed.

Web/native chat participants can report an accessible message, explicitly sharing its text and report reason with staff. Staff see reported evidence in web Operations; they do not gain the rest of a private conversation. They can dismiss or remove the message with a review note. Removal empties its text and attachments for participants, while the report retains the text as review evidence. Organization-approved retention and abuse/rate-limit policy still need to be decided.

Web custom-group controls show members and the owner, support rename/member removal and preserve the existing leave action. Only the owner manages the group. Removing a member revokes conversation/file access. Owner departure transfers ownership to the first remaining member. Adding members still requires a new group to avoid silently exposing old conversation history. Native group management and staff moderation/review remain in the web portal; native users can report messages and leave groups.

## Verification

- 95 automated tests passed, including refund role/balance/idempotency checks, delayed failure events, uncertain submission/reconciliation, scoped progress/feedback, moderation evidence and member removal, video grace/restore/access rules, private-cloud guard/copy/cleanup, and encrypted backup/restore with wrong-password and overwrite rejection.
- Web production build and iOS/Android JavaScript exports passed. Signed devices were not built or tested.
- Browser verified payment/refund controls, unconfigured cloud/cleanup status, progress summaries and saving a clearly labelled sample coaching-feedback record. No purge, cloud transfer or provider refund was executed.
- Local readiness monitoring passed. Docker was unavailable, so Docker/Compose files are prepared but the container image has not been built or deployed.

See [LAUNCH-RUNBOOK.md](LAUNCH-RUNBOOK.md) for deployment, backup, monitoring and physical-phone acceptance steps.
