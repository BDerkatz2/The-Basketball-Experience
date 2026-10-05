import test from "node:test";
import assert from "node:assert/strict";
import {
  checkoutDestination,
  canManageMemberships,
  canChangeRenewal,
  endedMembership,
  preferencePayload,
} from "../mobile/membership-utils.mjs";
test("native checkout only opens an HTTPS Stripe checkout destination", () => {
  assert.equal(
    checkoutDestination("https://checkout.stripe.com/c/pay/cs_test_example"),
    "https://checkout.stripe.com/c/pay/cs_test_example",
  );
  for (const url of [
    "http://checkout.stripe.com/pay",
    "https://checkout.stripe.com.evil.test/pay",
    "https://user:secret@checkout.stripe.com/pay",
    "https://checkout.stripe.com:444/pay",
    "javascript:alert(1)",
    "tbe://account",
  ])
    assert.throws(() => checkoutDestination(url));
});
test("native renewal actions respect roles and subscription lifecycle", () => {
  for (const role of ["parent", "staff", "admin"])
    assert.equal(canManageMemberships(role), true);
  for (const role of ["coach", "player"])
    assert.equal(canManageMemberships(role), false);
  assert.equal(canChangeRenewal({ status: "active" }), false);
  for (const status of ["active", "past_due", "trialing"])
    assert.equal(
      canChangeRenewal({ status, subscriptionId: "sub_test" }),
      true,
    );
  for (const status of ["canceled", "incomplete_expired", "unpaid", "pending"])
    assert.equal(
      canChangeRenewal({ status, subscriptionId: "sub_test" }),
      false,
    );
  assert.equal(endedMembership({ status: "canceled" }), true);
});
test("mobile preferences submit only explicit notification booleans", () => {
  const p = preferencePayload({
    inApp: true,
    email: "true",
    push: false,
    sessions: true,
    workouts: true,
    changes: true,
    payments: true,
    userId: "someone-else",
  });
  assert.equal(p.email, false);
  assert.equal(p.userId, undefined);
  assert.equal(Object.keys(p).length, 7);
  assert.ok(Object.values(p).every((v) => typeof v === "boolean"));
});
