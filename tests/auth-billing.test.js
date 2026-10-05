import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import {
  hashPassword,
  verifyPassword,
  register,
  newSession,
  publicUser,
  digest,
} from "../server/auth.js";
import { processPaymentEvent, canInvoice } from "../server/billing.js";
import { rowKey } from "../server/storage.js";
test("passwords are salted, verified, bounded, and excluded from user responses", async () => {
  const a = await hashPassword("a long sample password"),
    b = await hashPassword("a long sample password");
  assert.notEqual(a, b);
  assert.ok(await verifyPassword("a long sample password", a));
  assert.equal(await verifyPassword("wrong password", a), false);
  await assert.rejects(() => hashPassword("short"));
  assert.equal(
    publicUser({ id: "one", passwordHash: a }).passwordHash,
    undefined,
  );
});
test("registration can create only a parent and session tokens are persisted as hashes", async () => {
  const db = upgrade(seed());
  db.users = [];
  db.families = [];
  const u = await register(db, {
    name: "New Parent",
    email: "TEST@example.test",
    password: "sample password 123",
    role: "admin",
  });
  assert.equal(u.role, "parent");
  assert.equal(u.email, "test@example.test");
  assert.equal(db.families[0].id, u.familyId);
  const session = newSession(db, u);
  assert.equal(db.authSessions[0].id, digest(session.token));
  assert.notEqual(db.authSessions[0].id, session.token);
  assert.equal(visible(db, u).authSessions, undefined);
  await assert.rejects(
    () =>
      register(db, {
        name: "Duplicate",
        email: "test@example.test",
        password: "sample password 123",
      }),
    /already exists/,
  );
});
test("payment completion is amount-bound, family-bound and idempotent", () => {
  const db = upgrade(seed()),
    u = db.users[0];
  mutate(db, u, "order", {
    playerId: "p1",
    productId: "shirt",
    size: "M",
    quantity: 1,
    useCredits: false,
  });
  const i = db.invoices[0];
  assert.equal(i.amountCents, 3000);
  const event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: 3000,
        currency: "cad",
        payment_intent: "pi_test_1",
        metadata: { invoiceId: i.id, familyId: "f1" },
      },
    },
  };
  const bad = structuredClone(event);
  bad.data.object.amount_total = 1;
  assert.throws(() => processPaymentEvent(db, bad), /match/);
  assert.equal(i.status, "Unpaid");
  processPaymentEvent(db, event);
  processPaymentEvent(db, event);
  assert.equal(i.status, "Paid (Stripe test)");
  assert.equal(db.paymentEvents.length, 1);
  assert.equal(db.orders[0].paymentStatus, "Paid (Stripe test)");
  assert.equal(canInvoice({ role: "parent", familyId: "f2" }, i), false);
  assert.equal(visible(db, u).paymentEvents, undefined);
});
test("unpaid checkout completion cannot mark an invoice paid; paid order cancellation is blocked", () => {
  const db = upgrade(seed()),
    u = db.users[0],
    admin = db.users.find((u) => u.role === "admin");
  mutate(db, u, "order", {
    playerId: "p1",
    productId: "shirt",
    size: "M",
    quantity: 1,
    useCredits: false,
  });
  const i = db.invoices[0];
  processPaymentEvent(db, {
    id: "evt_pending",
    type: "checkout.session.completed",
    data: { object: { payment_status: "unpaid" } },
  });
  assert.equal(i.status, "Unpaid");
  i.status = "Paid (Stripe test)";
  assert.throws(
    () => mutate(db, admin, "order-cancel", { id: db.orders[0].id }),
    /Reconcile/,
  );
});
test("form versions and answers are preserved and stale forms are rejected", () => {
  const db = upgrade(seed()),
    admin = db.users.find((u) => u.role === "admin"),
    parent = db.users[0];
  const form = {
    programId: "a3",
    title: "Camp consent",
    waiverText: "Sample approved terms",
    fields: [
      { label: "Contact name", type: "text", required: true },
      { label: "Confirm sample consent", type: "checkbox", required: true },
    ],
  };
  mutate(db, admin, "form-save", form);
  const first = db.forms[0];
  assert.throws(
    () =>
      mutate(db, parent, "enroll", {
        playerId: "p1",
        programId: "a3",
        accepted: true,
        signature: "Parent",
        formId: "old",
      }),
    /changed/,
  );
  mutate(db, parent, "enroll", {
    playerId: "p1",
    programId: "a3",
    accepted: true,
    signature: "Parent",
    formId: first.id,
    answers: { q0: "Sample contact", q1: true },
  });
  mutate(db, admin, "form-save", { ...form, waiverText: "Updated terms" });
  assert.equal(db.waivers[0].text, "Sample approved terms");
  assert.equal(db.waivers[0].answers.q0, "Sample contact");
  assert.equal(db.forms[1].version, 2);
  assert.equal(db.invoices.length, 1);
});
test("Mongo record keys remain stable for attendance and staff profiles", () => {
  assert.equal(rowKey({ eventId: "e1", playerId: "p1" }), "e1:p1");
  assert.equal(rowKey({ userId: "staff" }), "staff");
  assert.throws(() => rowKey({ name: "no key" }));
});
