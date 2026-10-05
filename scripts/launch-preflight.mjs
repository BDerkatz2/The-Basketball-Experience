// Local configuration check only: never prints credentials or dispatches messages/payments.
try {
  process.loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const env = process.env,
  present = (k) => !!env[k]?.trim();
const checks = [
  ["Account mode", env.APP_MODE === "accounts"],
  ["HTTPS application URL", /^https:\/\//.test(env.APP_URL || "")],
  ["Stripe test key", /^sk_test_/.test(env.STRIPE_SECRET_KEY || "")],
  ["Stripe webhook signing secret", present("STRIPE_WEBHOOK_SECRET")],
  [
    "Email provider and sender",
    present("RESEND_API_KEY") && present("EMAIL_FROM"),
  ],
  ["External delivery enabled", env.ENABLE_EXTERNAL_DELIVERY === "true"],
  [
    "Private S3 configuration",
    present("S3_BUCKET") &&
      present("AWS_REGION") &&
      env.ENABLE_CLOUD_UPLOADS === "true",
  ],
  [
    "Production database configuration",
    present("MONGODB_URI") && present("MONGODB_DATABASE"),
  ],
  ["Mobile HTTPS API", /^https:\/\//.test(env.EXPO_PUBLIC_API_URL || "")],
  ["EAS project", present("EAS_PROJECT_ID")],
  [
    "iOS and Android identifiers",
    present("IOS_BUNDLE_IDENTIFIER") && present("ANDROID_PACKAGE"),
  ],
];
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      kind: "configuration-only",
      ready: checks.every(([, ok]) => ok),
      checks: checks.map(([name, ok]) => ({
        name,
        status: ok ? "configured; not provider-verified" : "missing or invalid",
      })),
      unverified: [
        "Stripe checkout/refunds/webhooks",
        "Email sender verification and inbox delivery",
        "APNs/FCM credentials, device token and push receipts",
        "S3 permissions, upload, playback and restore",
        "MongoDB transactions, backup and restore",
        "Physical iPhone/Android QA",
        "Signed store builds and submissions",
      ],
    },
    null,
    2,
  ),
);
process.exitCode = checks.every(([, ok]) => ok) ? 0 : 2;
