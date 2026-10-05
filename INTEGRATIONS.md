# Video, scheduling and service setup

September 29 update: persistent per-account phone video drafts, explicit retry/pause/timeout and duplicate-safe upload/save are implemented; mobile review adds approximate 0.1-second steps and A/B loops. Weekly schedules accept skipped dates; tournaments support 1–4 daily sessions and one/two rounds. See [COMPLETION-BATCH.md](COMPLETION-BATCH.md). Earlier limitations below concerning absent recovery/analysis are superseded; background/chunked uploads and physical-device checks are still outstanding.

September 28, 2026. Adapters are implemented and tested with synthetic responses. No provider credentials are configured in the preview. No external messages, live transactions or physical-phone tests have been performed.

## Video

The native Video tab lets coaches/staff launch the phone camera for a clip up to two minutes or select a library video. Team-scoped uploads are capped at 100 MB. Review supports 0.25×/0.5×/1× playback, one-second seeking, timestamped notes and two-tap line annotations. Web and mobile use the same 16:9 display frame. Playback depends on phone codec support; transcoding, frame-accurate stepping, background uploads and offline queues remain pending.

Staff import Drive files from Training hub → Video analysis. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` and `GOOGLE_DRIVE_FOLDER_ID` on the server, using an already-authorized club account with Drive read access. The importer checks immediate folder membership and download permission before copying a supported video into private app storage. It accepts a file ID, never an arbitrary download URL. Copies keep app permissions even if the Drive original changes or is removed. Browser OAuth onboarding, folder browsing, upload/sync to Drive and cloud object storage remain pending.

References: [Expo picker](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/), [Expo video](https://docs.expo.dev/versions/v55.0.0/sdk/video/), [Drive downloads](https://developers.google.com/workspace/drive/api/guides/manage-downloads), [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

## Scheduling

The planner accepts up to eight courts, allowed weekdays, global/per-team blackout dates and zero to 168 rest hours between a team's sessions. Existing division, daily game limit, court/coach/player conflict, DST and stale-preview checks remain. The bounded greedy scheduler is not a global optimizer; an incomplete preview may fit with a different window or team order.

Set server variables `OPENAI_API_KEY` and `OPENAI_SCHEDULING_MODEL` to enable **Ask AI for a draft**. Use an approved Responses API model supporting strict JSON-schema output. AI interprets weekdays, global blackout dates and rest hours only. It receives the staff request and date settings, without player/family records. Avoid personal information in the request. Output is validated locally and staff review/publish the resulting games. Missing configuration, refusal or incomplete output returns an error without a fabricated result. Requests are limited to one per staff member per ten seconds.

Reference: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Stripe

Live keys and live webhook events remain rejected. Configure test credentials and webhook secret, then use Operations → Service connections → **Validate Stripe test credentials** for a read-only API check. Configuration does not verify webhooks. Local HTTP tests cover synthetic signatures, invalid signatures, live-event rejection, amount mismatch and duplicate delivery; subscription tests use mocks.

Still run actual Stripe test checkout, decline/retry, renewal, cancel/resume and signed webhook forwarding before launch. Compare the family invoice with the provider record after each test. Taxes, refunds, disputes and payment-method recovery remain separate outstanding scope. Never use real cards for testing.

## Email and phone push

Sending requires `APP_MODE=accounts` and `ENABLE_EXTERNAL_DELIVERY=true`. Configure Resend with `RESEND_API_KEY` and a verified `EMAIL_FROM`. Enable Expo enhanced push security and configure `EXPO_ACCESS_TOKEN` for the app's project. Users opt in through notification preferences; only notices created after opt-in are queued.

An administrator sends up to ten pending requests from Operations. There is no automatic external-send worker yet; reminder generation runs every minute. Email uses a stable job idempotency key. Push uses generic lock-screen text. `provider-accepted` does not prove inbox delivery. **Check phone push receipts** checks available Expo receipts; `push-service-confirmed` means provider handoff, not user receipt/read. Email delivery/bounce webhooks remain pending.

A durable `sending` claim precedes provider contact. Network uncertainty becomes `unknown`; a server interruption may leave `sending`. Neither state automatically retries. Inspect the provider dashboard before reconciling an uncertain job; never reset it blindly. Accepted jobs do not requeue. One phone per account is supported: registering a shared phone transfers ownership; signing out removes that account's phone registration.

References: [Resend API](https://resend.com/docs/api-reference/emails/send-email), [Expo sending and receipts](https://docs.expo.dev/push-notifications/sending-notifications/).

## Phone acceptance checks

Use a development/release build on a physical phone with the club's EAS project ID, APNs/FCM credentials and notification plugin. Expo Go is insufficient for this push workflow. Set `EXPO_PUBLIC_API_URL` to a reachable backend. For trusted LAN development explicitly set `HOST=0.0.0.0` and the computer address; the preview remains on loopback. Production requires HTTPS and deployment configuration.

Test camera/microphone denials, recording/library selection, codec playback, size limits, upload interruption/retry, role access, slow playback, cross-platform drawings/notes, foreground/background push, opt-out, shared-phone reassignment, sign-out and invalid-device receipts. Compilation does not replace these hardware checks.

Secrets belong in server `.env` or a deployment secret manager, never a mobile bundle or chat. `.env` and local data are excluded from the source archive.
