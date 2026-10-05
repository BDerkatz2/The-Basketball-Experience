export function checkoutDestination(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error("Unexpected checkout destination.");
  return url.href;
}
export const canManageMemberships = (role) =>
  ["parent", "staff", "admin"].includes(role);
export const endedMembership = (m) =>
  ["canceled", "incomplete_expired"].includes(m.status);
export const canChangeRenewal = (m) =>
  !!m.subscriptionId && ["active", "trialing", "past_due"].includes(m.status);
export const preferenceLabels = {
  inApp: "Show in-app notifications",
  email: "Queue email notifications",
  push: "Queue phone push notifications",
  sessions: "Practices and games · 24-hour reminders",
  workouts: "Workouts due within 24 hours",
  changes: "Schedule changes",
  payments: "Membership payment issues",
};
export function preferencePayload(settings) {
  return Object.fromEntries(
    Object.keys(preferenceLabels).map((k) => [k, settings[k] === true]),
  );
}
