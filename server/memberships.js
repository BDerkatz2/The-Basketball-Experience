import { fail, id, text, integer, isStaff } from "./domain.js";
export const terminal = (m) =>
  ["canceled", "incomplete_expired"].includes(m.status);
export function familyAccess(db, u, familyId) {
  const f = db.families.find((f) => f.id === familyId);
  if (!f || !(isStaff(u) || (u.role === "parent" && u.familyId === familyId)))
    fail("Family access denied.", 403);
  return f;
}
export function savePlan(db, u, b) {
  if (u.role !== "admin") fail("Administrator access required.", 403);
  if (b.id) {
    const p = db.membershipPlans.find((p) => p.id === b.id);
    if (!p) fail("Plan not found.", 404);
    if (typeof b.active !== "boolean") fail("Choose plan availability.");
    p.active = b.active;
    return;
  }
  if (!["month", "year"].includes(b.interval))
    fail("Choose monthly or yearly billing.");
  db.membershipPlans.push({
    id: id(),
    name: text(b.name, 100),
    description: text(b.description, 1000),
    amountCents: integer(b.amountCents, 100, 1000000),
    currency: "cad",
    interval: b.interval,
    active: true,
    createdAt: new Date().toISOString(),
  });
}
export function prepareMembership(db, u, b) {
  familyAccess(db, u, b.familyId);
  const existing = db.memberships.find(
    (m) => m.familyId === b.familyId && !terminal(m),
  );
  if (existing) {
    if (existing.planId !== b.planId)
      fail(
        "This family already has a membership or pending checkout. Resume it first.",
        409,
      );
    return existing;
  }
  const p = db.membershipPlans.find((p) => p.id === b.planId && p.active);
  if (!p) fail("Choose an available membership plan.");
  const m = {
    id: id(),
    familyId: b.familyId,
    planId: p.id,
    planName: p.name,
    amountCents: p.amountCents,
    currency: p.currency,
    interval: p.interval,
    status: "pending",
    attempt: 1,
    createdAt: new Date().toISOString(),
  };
  db.memberships.push(m);
  return m;
}
export function checkoutParams(m, origin) {
  const metadata = { membershipId: m.id, familyId: m.familyId };
  return {
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: m.currency,
          unit_amount: m.amountCents,
          recurring: { interval: m.interval },
          product_data: { name: m.planName },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
    success_url: origin + "/?membership=received",
    cancel_url: origin + "/?membership=cancelled",
  };
}
const ref = (v) => (typeof v === "string" ? v : v?.id);
export function syncMembership(db, subscription) {
  const m = db.memberships.find(
    (m) => m.id === subscription.metadata?.membershipId,
  );
  if (!m) return false;
  const items = subscription.items?.data || [],
    item = items[0],
    price = item?.price;
  if (
    subscription.livemode !== false ||
    subscription.metadata.familyId !== m.familyId ||
    (m.subscriptionId && m.subscriptionId !== subscription.id) ||
    items.length !== 1 ||
    item.quantity !== 1 ||
    price?.unit_amount !== m.amountCents ||
    price?.currency !== m.currency ||
    price?.recurring?.interval !== m.interval ||
    price?.recurring?.interval_count !== 1
  )
    fail("Subscription does not match the membership.", 409);
  m.subscriptionId = subscription.id;
  m.customerId = ref(subscription.customer);
  m.status = subscription.status;
  m.cancelAtPeriodEnd = subscription.cancel_at_period_end === true;
  m.periodEnd =
    item.current_period_end || subscription.current_period_end || null;
  m.updatedAt = new Date().toISOString();
  const family = db.families.find((f) => f.id === m.familyId);
  // A delayed event for a canceled historical subscription must not overwrite a newer membership.
  if (
    family &&
    !db.memberships.some(
      (x) => x.familyId === m.familyId && x.id !== m.id && !terminal(x),
    )
  )
    family.membership = ["active", "trialing"].includes(m.status)
      ? "Active"
      : m.status === "canceled"
        ? "Cancelled"
        : ["past_due", "unpaid"].includes(m.status)
          ? "Payment overdue"
          : "Pending";
  return true;
}
export async function membershipEvent(db, event, stripe) {
  const object = event.data?.object;
  const isCheckout =
    object?.object === "checkout.session" && object.mode === "subscription";
  const isSub = event.type.startsWith("customer.subscription.");
  const subscriptionId = isSub
    ? object.id
    : ref(
        object?.subscription ||
          object?.parent?.subscription_details?.subscription,
      );
  if (!isCheckout && !isSub && !subscriptionId) return false;
  if (db.paymentEvents.some((e) => e.id === event.id)) return true;
  if (event.livemode === true)
    fail("Live membership events are disabled.", 400);
  if (subscriptionId) {
    const latest = await stripe.subscriptions.retrieve(subscriptionId);
    const matched = syncMembership(db, latest);
    if (matched && object?.object === "invoice") {
      const invoice = await stripe.invoices.retrieve(object.id);
      if (
        ref(
          invoice.subscription ||
            invoice.parent?.subscription_details?.subscription,
        ) !== subscriptionId
      )
        fail("Invoice subscription mismatch.", 409);
      const m = db.memberships.find(
        (m) => m.id === latest.metadata.membershipId,
      );
      const record = {
        id: "membership-" + invoice.id,
        sourceId: invoice.id,
        sourceType: "membership",
        familyId: m.familyId,
        description: m.planName + " renewal",
        amountCents: invoice.amount_due,
        currency: invoice.currency,
        status:
          invoice.status === "paid"
            ? "Paid (Stripe test)"
            : invoice.status === "void"
              ? "Voided"
              : "Unpaid",
        createdAt: new Date(invoice.created * 1000).toISOString(),
      };
      const old = db.invoices.find((i) => i.id === record.id);
      if (old) Object.assign(old, record);
      else db.invoices.push(record);
    }
  }
  db.paymentEvents.push({
    id: event.id,
    type: event.type,
    processedAt: new Date().toISOString(),
  });
  return true;
}
