import { fail } from "./domain.js";

export function serviceStatus(env = process.env) {
  return {
    externalDeliveryEnabled:
      env.APP_MODE === "accounts" && env.ENABLE_EXTERNAL_DELIVERY === "true",
    email: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    push: !!env.EXPO_ACCESS_TOKEN,
    ai: !!(env.OPENAI_API_KEY && env.OPENAI_SCHEDULING_MODEL),
    drive: !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REFRESH_TOKEN &&
      env.GOOGLE_DRIVE_FOLDER_ID
    ),
    stripe: !!env.STRIPE_SECRET_KEY,
    stripeWebhook: !!env.STRIPE_WEBHOOK_SECRET,
  };
}
export function registerDevice(db, user, token) {
  if (
    typeof token !== "string" ||
    !/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(token)
  )
    fail("Invalid Expo device token.");
  // One phone per account for this release; registering on a shared phone
  // transfers ownership so the previous account cannot keep receiving alerts.
  db.pushDevices = db.pushDevices.filter(
    (d) => d.token !== token && d.userId !== user.id,
  );
  db.pushDevices.push({
    userId: user.id,
    token,
    registeredAt: new Date().toISOString(),
  });
}
export async function sendDelivery(
  job,
  user,
  notification,
  device,
  env = process.env,
  request = fetch,
) {
  const status = serviceStatus(env);
  if (!status.externalDeliveryEnabled)
    fail("External delivery is disabled.", 503);
  let url, headers, body;
  if (job.channel === "email") {
    if (!status.email || !user.email)
      fail("Email provider or recipient address is missing.", 503);
    url = "https://api.resend.com/emails";
    headers = {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Idempotency-Key": "tbe-" + job.id,
    };
    body = {
      from: env.EMAIL_FROM,
      to: [user.email],
      subject: notification.title,
      text: notification.text,
    };
  } else {
    if (!status.push || !device)
      fail("Push provider or phone registration is missing.", 503);
    url = "https://exp.host/--/api/v2/push/send";
    headers = { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` };
    // Keep family details off the phone lock screen.
    body = {
      to: device.token,
      title: "The Basketball Experience",
      body: "You have a new update. Open the app to view it.",
      data: { notificationId: notification.id },
      sound: "default",
    };
  }
  const response = await request(url, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw Error(
      "Provider did not confirm acceptance. Check its dashboard before retrying.",
    );
  const result = await response.json();
  if (job.channel === "email" && typeof result.id === "string")
    return { status: "provider-accepted", providerId: result.id };
  if (
    job.channel === "push" &&
    result.data?.status === "ok" &&
    typeof result.data.id === "string"
  )
    return { status: "provider-accepted", providerId: result.data.id };
  throw Error(
    "Provider rejected the request. Check provider configuration and recipient registration.",
  );
}
export async function pushReceipt(
  providerId,
  env = process.env,
  request = fetch,
) {
  const r = await request("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids: [providerId] }),
  });
  if (!r.ok) throw Error("Could not check Expo receipts.");
  const receipt = (await r.json()).data?.[providerId];
  if (!receipt) return null;
  return receipt.status === "ok"
    ? { status: "push-service-confirmed" }
    : {
        status: "failed",
        lastError:
          "Push receipt failed: " + (receipt.details?.error || "unknown"),
        invalidDevice: receipt.details?.error === "DeviceNotRegistered",
      };
}
