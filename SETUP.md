# Configure accounts and services

For the latest video, Drive, AI, Stripe validation, email and phone push setup, use [INTEGRATIONS.md](INTEGRATIONS.md). Providers are unconfigured in the preview; no live verification has occurred.

The app remains bound to the local computer. These steps configure a development environment; they do not publish it or make it launch-ready.

## Account sign-in

Copy `.env.example` to `.env`, set `APP_MODE=accounts`, and set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 12 characters. Restart the server. An administrator is created only if the account store has no users. Remove the bootstrap password from `.env` after successful startup.

Accounts use `data/accounts.json`; the sample app uses `data/demo.json`. Never point account mode at sample data. Account mode rejects demo users and disables demo sign-in. Parent registration creates a new family without staff privileges. Administrators create players and assign teams under Operations. Invitations, password reset, verification and MFA remain launch tasks.

Passwords use salted scrypt hashes. Session tokens are stored as hashes, expire after eight hours, and are revoked on sign-out. The browser holds its token in session storage; native holds it in memory. An HTTPS deployment should use hardened cookies and a reviewed recovery flow.

## MongoDB

Set `MONGODB_URI` and `MONGODB_DATABASE` in account mode. Use a replica set or Atlas because the adapter uses multi-document transactions. Entity arrays are stored in separate collections with stable record keys and an optimistic revision record. Conflicting writes from another process are rejected and local state is reloaded.

This initial adapter has not been tested against your database. It reads the whole dataset into one process and saves snapshot transactions; sessions and live events are not coordinated across instances. Run only one server per dataset. Targeted queries, indexes, migrations, backup/restore and load testing remain before scaling. [MongoDB transaction reference](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

## Stripe test payments

Only test keys are accepted; a live key prevents startup.

1. Set `STRIPE_SECRET_KEY=sk_test_...` and `APP_URL`.
2. Configure a test webhook or Stripe CLI forwarding to `/api/stripe/webhook`.
3. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
4. Listen for `checkout.session.completed` and `checkout.session.async_payment_succeeded`.
5. Create a registration or order; its invoice appears under Members for the family and Operations for staff.
6. Use **Test checkout**. The signed webhook, not the redirect, marks an invoice paid.

Amounts and ownership are derived on the server. Checkout uses idempotency keys. Webhooks verify signatures and validate amount, currency, family and session identity. Duplicate events are ignored. Payment-linked orders cannot use stock-restoration cancellation; refund/reconciliation workflows remain outstanding.

No Stripe account was connected or charged during development. Taxes, recurring memberships, invoice PDFs, refunds, disputes and accounting reconciliation are not implemented. Provider end-to-end tests remain required. [Checkout reference](https://docs.stripe.com/checkout/quickstart), [signature verification](https://docs.stripe.com/webhooks/signature).

## Files and notifications

Uploads are stored alongside the selected data file under `uploads/`. Videos accept MP4/WebM up to 100 MB. Staff documents accept PDF/PNG/JPEG up to 10 MB. File signatures, roles and download authorization are checked. Staff documents are visible only to the uploader and administrators. Cloud storage, antivirus scanning, retention and encrypted backups remain launch work.

Schedule notices are persisted per recipient. Web updates use authenticated server-sent events. Native updates use pull-to-refresh and post-action refreshes. Email reminders and device push delivery are not implemented yet.

## Organization input still needed

- Branding, venues, operating timezone, eligibility and membership rules.
- Fees, taxes, cancellation/refund policy and approved waiver text.
- Database, Stripe test, cloud hosting/storage, email and push configuration.
- Apple/Google developer accounts and real-device test access.
- Messaging/safeguarding rules, staff review and data retention.

Keep secret keys out of chat, source control and the source ZIP. Use the ignored `.env` file or your deployment secret store.

### Account invitation and recovery workflow
In account mode, sign in as the bootstrap administrator and open Operations → Account invitations & recovery. Create families/players/teams first when assigning those roles. Copy the issued link immediately and share through your trusted private channel; the app does not send it. The configured public origin must reach this same account-mode server. The local demo intentionally disables real account links. Recovery requires the administrator to verify the person's identity before issuing a 30-minute single-use link. Redeeming a reset signs out all previous sessions. Automated email delivery remains unconfigured.

### Mobile messaging and account links
The native Chat tab now creates direct/custom group conversations, marks read, leaves groups, uploads up to three PDF/PNG/JPEG attachments, and downloads files into temporary cache before opening the system save/share sheet. Downloads use authenticated requests; temporary downloaded files are removed after the share flow returns. Uploaded picker cache copies are removed after upload. Recipient/scope validation remains server-side. Real-device testing must verify cancellation, revoked access, file-provider behavior, and destination save/share behavior.

In account mode, the sign-in screen has Use invitation / reset link. Paste the full web invitation or reset URL, then set and confirm a new password. Tokens never change the configured API destination. A custom development/production build also registers tbe://account?account-link=TOKEN. Scheme registration requires rebuilding the native app; Expo Go does not provide this custom scheme. HTTPS universal/app links are not configured. Web-issued links can be pasted without converting them. Real account mode and email delivery remain separate from the local demo.

Configure EXPO_PUBLIC_API_URL to the correct reachable backend before building. A physical phone cannot reach your computer through its own 127.0.0.1. Use a trusted development network and production HTTPS for deployment. These changes do not publish or sign an application.

Native APIs checked against Expo SDK 55 documentation:
- https://docs.expo.dev/versions/v55.0.0/sdk/document-picker/
- https://docs.expo.dev/versions/v55.0.0/sdk/filesystem/
- https://docs.expo.dev/versions/v55.0.0/sdk/sharing/

### Stripe test subscriptions
Set STRIPE_SECRET_KEY to an sk_test_ key, STRIPE_WEBHOOK_SECRET to the endpoint signing secret, and APP_URL to the trusted app origin. Subscribe the existing /api/stripe/webhook endpoint to checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted, invoice.paid and invoice.payment_failed (plus the existing one-time payment events).

Create a plan under Operations → Family memberships. Parents use Members → Family memberships. Validate new subscriptions, payment failures and later recovery, billing-period rollover, end-of-period cancellation, resumed renewal, expired checkout, webhook retries and out-of-order delivery using Stripe's test environment. Credentials were not supplied, so this provider validation has not been performed. Demo pricing is sample data, not an approved business price. The subscription engine does not determine program entitlement automatically.

Reference: https://docs.stripe.com/api/checkout/sessions/create and https://docs.stripe.com/billing/subscriptions/webhooks

### Mobile family memberships and notification settings (September 28)
Parents, staff and administrators now see a Memberships tab. Parents manage their own family; staff select an authorized family. The screen lists plans, recurring prices, current status, period-end dates and membership invoice history. Existing memberships block starting a second subscription. Supported subscriptions offer cancel-at-period-end or resume renewal with an in-app confirmation. Plan creation and archiving remain in the web administrator portal.

Test checkout opens the system browser only for an HTTPS checkout.stripe.com URL. The app refreshes local state when foregrounded; Refresh membership status retrieves current provider state. Returning from checkout never marks a subscription paid. Stripe credentials/webhooks still need configuration and real provider testing. The provider success URL currently returns to the web app; users return to mobile manually. There is no production native payment release in this package.

Updates now includes notification preferences for in-app/email/push and sessions/workouts/changes/payments. Saving uses the same authenticated API as the web portal. Email/push switches only queue requests; providers and OS push permission/device-token setup are still absent. Test all switches, failed saves, app background/foreground, payment cancellation and status refresh on real devices before release.

### Native calendar QA
Schedule opens in month view. Choose a player or search session titles/locations, switch Month/Week/Agenda, use Previous/Today/Next, or enter YYYY-MM-DD and tap Go to date. Tap a calendar day for its full session list. Cancelled sessions are hidden by default; enable Show cancelled sessions to review them. Their RSVP/check-in controls are disabled. Session times are shown in the phone's timezone; dates use shared local-calendar calculations with the web app. Staff retain attendance controls and users retain authorized RSVP controls.

Before release, verify touch targets, accessibility labels, large fonts, month/year boundaries, an overnight event, device timezone changes, and server-authorized RSVP/check-in on iPhone and Android. Compilation and helper tests do not replace those device checks.
