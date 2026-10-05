import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, visible } from "../server/extended.js";
import {
  savePlan,
  prepareMembership,
  checkoutParams,
  syncMembership,
  membershipEvent,
} from "../server/memberships.js";
function setup() {
  const db = upgrade(seed()),
    admin = db.users.find((u) => u.role === "admin"),
    parent = db.users.find((u) => u.role === "parent");
  savePlan(db, admin, {
    name: "Monthly family",
    description: "Family membership",
    amountCents: 2500,
    interval: "month",
  });
  const plan = db.membershipPlans[0],
    m = prepareMembership(db, parent, { familyId: "f1", planId: plan.id });
  const sub = {
    id: "sub_test",
    livemode: false,
    metadata: { membershipId: m.id, familyId: "f1" },
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1900000000,
          price: {
            unit_amount: 2500,
            currency: "cad",
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
  return { db, admin, parent, plan, m, sub };
}
test("membership checkout binds server price, family and idempotent pending record", () => {
  const { db, parent, plan, m } = setup();
  assert.equal(
    prepareMembership(db, parent, { familyId: "f1", planId: plan.id }).id,
    m.id,
  );
  assert.throws(
    () => prepareMembership(db, parent, { familyId: "f2", planId: plan.id }),
    /access denied/,
  );
  const p = checkoutParams(m, "https://example.test");
  assert.equal(p.mode, "subscription");
  assert.equal(p.line_items[0].price_data.unit_amount, 2500);
  assert.equal(p.subscription_data.metadata.membershipId, m.id);
});
test("plans require admin and supported prices; archive preserves existing snapshot", () => {
  const { db, admin, parent, plan, m } = setup();
  assert.throws(
    () => savePlan(db, parent, { id: plan.id, active: false }),
    /Administrator/,
  );
  savePlan(db, admin, { id: plan.id, active: false });
  assert.equal(m.amountCents, 2500);
  assert.throws(
    () => prepareMembership(db, admin, { familyId: "f2", planId: plan.id }),
    /available/,
  );
});
test("subscription synchronization validates amounts and marks renewal/cancellation state", () => {
  const { db, m, sub } = setup();
  assert.throws(() => syncMembership(db, { ...sub, livemode: true }), /match/);
  const wrong = structuredClone(sub);
  wrong.items.data[0].price.unit_amount = 1;
  assert.throws(() => syncMembership(db, wrong), /match/);
  syncMembership(db, sub);
  assert.equal(db.families[0].membership, "Active");
  syncMembership(db, { ...sub, cancel_at_period_end: true });
  assert.equal(m.cancelAtPeriodEnd, true);
  assert.equal(m.periodEnd, 1900000000);
  syncMembership(db, { ...sub, status: "canceled" });
  assert.equal(db.families[0].membership, "Cancelled");
});
test("webhooks retrieve latest subscription and invoice, handle failure and paid retry idempotently", async () => {
  const { db, sub, m } = setup();
  let calls = 0;
  let latest = { ...sub, status: "past_due" };
  let inv = {
    id: "in_test",
    object: "invoice",
    subscription: "sub_test",
    amount_due: 2500,
    currency: "cad",
    status: "open",
    created: 1800000000,
  };
  const stripe = {
    subscriptions: {
      retrieve: async () => {
        calls++;
        return latest;
      },
    },
    invoices: { retrieve: async () => inv },
  };
  const e = {
    id: "evt_fail",
    type: "invoice.payment_failed",
    data: {
      object: { object: "invoice", id: "in_test", subscription: "sub_test" },
    },
  };
  await membershipEvent(db, e, stripe);
  assert.equal(m.status, "past_due");
  assert.equal(db.invoices[0].status, "Unpaid");
  await membershipEvent(db, e, stripe);
  assert.equal(calls, 1);
  latest = { ...sub, status: "active" };
  inv = { ...inv, status: "paid" };
  await membershipEvent(
    db,
    { ...e, id: "evt_paid", type: "invoice.paid" },
    stripe,
  );
  assert.equal(m.status, "active");
  assert.equal(db.invoices.length, 1);
  assert.equal(db.invoices[0].status, "Paid (Stripe test)");
  await membershipEvent(db, { ...e, id: "evt_old" }, stripe);
  assert.equal(m.status, "active");
});
test("historical cancellations do not overwrite a newer family membership; state is scoped", () => {
  const { db, parent, m, sub, plan } = setup();
  syncMembership(db, { ...sub, status: "canceled" });
  const newer = prepareMembership(db, parent, {
    familyId: "f1",
    planId: plan.id,
  });
  syncMembership(db, {
    ...sub,
    id: "sub_new",
    metadata: { ...sub.metadata, membershipId: newer.id },
  });
  syncMembership(db, { ...sub, status: "canceled" });
  assert.equal(db.families[0].membership, "Active");
  assert.equal(
    visible(db, { role: "parent", id: "other", familyId: "f2" }).memberships
      .length,
    0,
  );
  assert.equal(
    visible(db, parent).memberships.find((x) => x.id === m.id).customerId,
    undefined,
  );
});
