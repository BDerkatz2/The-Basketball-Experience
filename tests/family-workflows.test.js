import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import { report } from "../server/reports.js";
import { expireOffers } from "../server/family-waitlists.js";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    parent: db.users.find((u) => u.id === "parent"),
    staff: db.users.find((u) => u.id === "staff"),
    coach: db.users.find((u) => u.id === "coach"),
  };
};
test("parents update only contact fields in their own family without changing account or membership", () => {
  const { db, parent, coach } = setup();
  const before = structuredClone(db.families[1]);
  parent.email = "signin@example.test";
  mutate(db, parent, "family-profile", {
    id: "f2",
    name: "Our family",
    email: "contact@example.test",
    phone: "+1 (306) 555-0100",
    address: "Sample address",
    membership: "Expired",
  });
  assert.deepEqual(db.families[1], before);
  assert.equal(db.families[0].name, "Our family");
  assert.equal(db.families[0].membership, "Active");
  assert.equal(parent.email, "signin@example.test");
  assert.equal(visible(db, coach).families.length, 0);
  assert.throws(
    () => mutate(db, parent, "family-profile", { name: "A", email: "bad" }),
    /email/,
  );
});
test("parent player management preserves staff-controlled fields and prevents family transfer", () => {
  const { db, parent } = setup();
  mutate(db, parent, "family-player", {
    id: "p1",
    name: "Alex Updated",
    age: 14,
    teamId: "t3",
    familyId: "f2",
    number: 99,
  });
  assert.equal(db.players[0].teamId, "t1");
  assert.equal(db.players[0].number, 12);
  assert.equal(db.players[0].familyId, "f1");
  assert.throws(
    () =>
      mutate(db, parent, "family-player", { id: "p3", name: "Other", age: 10 }),
    /denied/,
  );
  mutate(db, parent, "family-player", {
    name: "New player",
    age: 2,
    teamId: "t3",
    familyId: "f2",
  });
  const p = db.players.at(-1);
  assert.equal(p.familyId, "f1");
  assert.equal(p.teamId, null);
  assert.ok(!visible(db, parent).channels.includes(null));
});
function queued() {
  const ctx = setup();
  ctx.db.programs.find((p) => p.id === "a3").capacity = 1;
  ctx.db.enrollments.push({
    id: "occupied",
    programId: "a3",
    playerId: "p3",
    status: "Active",
  });
  mutate(ctx.db, ctx.parent, "waitlist-join", {
    programId: "a3",
    playerId: "p1",
  });
  mutate(ctx.db, ctx.parent, "waitlist-join", {
    programId: "a3",
    playerId: "p2",
  });
  return ctx;
}
test("waitlists reject duplicates, enforce FIFO and reserve offers against competing registration", () => {
  const { db, parent, staff } = queued();
  const [first, second] = db.waitlist;
  db.waitlist.reverse(); // Database retrieval order must not alter queue priority.
  assert.throws(
    () =>
      mutate(db, parent, "waitlist-join", { programId: "a3", playerId: "p1" }),
    /already/,
  );
  assert.throws(
    () => mutate(db, staff, "waitlist-offer", { id: first.id }),
    /no unreserved/,
  );
  mutate(db, staff, "enrollment-cancel", { id: "occupied" });
  assert.throws(
    () => mutate(db, staff, "waitlist-offer", { id: second.id }),
    /first waiting/,
  );
  assert.throws(
    () => mutate(db, parent, "waitlist-offer", { id: first.id }),
    /Staff/,
  );
  mutate(db, staff, "waitlist-offer", { id: first.id });
  assert.equal(
    visible(db, parent).programAvailability.find((a) => a.programId === "a3")
      .available,
    0,
  );
  assert.throws(
    () =>
      mutate(db, parent, "enroll", {
        programId: "a3",
        playerId: "p2",
        accepted: true,
        signature: "Test Parent",
      }),
    /reserved/,
  );
  assert.throws(
    () =>
      mutate(db, parent, "enroll", {
        programId: "a3",
        playerId: "p1",
        accepted: false,
      }),
    /waiver/,
  );
  assert.equal(first.status, "Offered");
  mutate(db, parent, "enroll", {
    programId: "a3",
    playerId: "p1",
    accepted: true,
    signature: "Test Parent",
  });
  assert.equal(first.status, "Enrolled");
  assert.equal(db.invoices.at(-1).sourceType, "enroll");
});
test("waitlist positions do not expose other families and expiry/withdrawal release reservations", () => {
  const { db, parent, staff } = queued();
  const other = { id: "other", role: "parent", familyId: "f2" };
  assert.equal(visible(db, other).waitlist.length, 0);
  assert.deepEqual(
    visible(db, parent).waitlist.map((r) => r.position),
    [1, 2],
  );
  assert.throws(
    () => mutate(db, other, "waitlist-leave", { id: db.waitlist[0].id }),
    /denied/,
  );
  mutate(db, staff, "enrollment-cancel", { id: "occupied" });
  mutate(db, staff, "waitlist-offer", { id: db.waitlist[0].id });
  expireOffers(db, Date.parse(db.waitlist[0].expiresAt) + 1);
  assert.equal(db.waitlist[0].status, "Expired");
  assert.equal(visible(db, parent).waitlist[1].position, 1);
  mutate(db, staff, "waitlist-offer", { id: db.waitlist[1].id });
  mutate(db, parent, "waitlist-leave", { id: db.waitlist[1].id });
  assert.equal(
    visible(db, parent).programAvailability.find((a) => a.programId === "a3")
      .available,
    1,
  );
});
test("plan edits preserve assigned snapshots; archiving prevents new assignment; cancellation preserves completed results", () => {
  const { db, parent, coach } = setup();
  mutate(db, coach, "training-plan-create", {
    name: "Plan",
    notes: "Original",
    drillIds: ["d1", "d2"],
  });
  const p = db.trainingPlans[0];
  const assignment = {
    planId: p.id,
    playerIds: ["p1"],
    start: "2027-01-04T18:00",
    timeZone: "America/Edmonton",
    count: 1,
  };
  mutate(db, coach, "training-plan-assign", assignment);
  const rows = db.workouts.filter((w) => w.planId === p.id);
  mutate(db, coach, "training-plan-edit", {
    planId: p.id,
    name: "Revised",
    notes: "New",
    drillIds: ["d3"],
  });
  assert.equal(rows[0].planName, "Plan");
  assert.equal(rows[0].planNotes, "Original");
  assert.equal(p.name, "Revised");
  mutate(db, coach, "training-plan-archive", { planId: p.id, archived: true });
  assert.throws(
    () =>
      mutate(db, coach, "training-plan-assign", {
        ...assignment,
        start: "2027-02-04T18:00",
      }),
    /Restore/,
  );
  mutate(db, parent, "workout", { id: rows[0].id, attempts: 10, made: 5 });
  assert.throws(
    () =>
      mutate(db, parent, "training-plan-cancel", {
        sessionId: rows[0].sessionId,
      }),
    /Coach/,
  );
  mutate(db, coach, "training-plan-cancel", { sessionId: rows[0].sessionId });
  assert.equal(rows[0].cancelledAt, undefined);
  assert.ok(rows[1].cancelledAt);
  assert.ok(db.results.some((r) => r.workoutId === rows[0].id));
  assert.throws(
    () =>
      mutate(db, parent, "workout", { id: rows[1].id, attempts: 0, made: 0 }),
    /cancelled/,
  );
});
test("reports enforce staff scope and distinguish missing attendance from absence", () => {
  const { db, parent, staff } = setup();
  assert.throws(() => report(db, parent, "payments"), /Staff/);
  const e = db.events[0];
  db.attendance = [];
  let a = report(db, staff, "attendance");
  assert.ok(a.rows.every((r) => r[4] === "Not recorded"));
  db.attendance.push({
    eventId: e.id,
    playerId: e.playerIds[0],
    present: false,
  });
  a = report(db, staff, "attendance");
  assert.ok(a.rows.some((r) => r[4] === "Absent"));
  db.invoices.push(
    {
      id: "i1",
      familyId: "f1",
      description: "Unpaid",
      currency: "cad",
      amountCents: 2500,
      status: "Unpaid",
      createdAt: "2027-01-01",
    },
    {
      id: "i2",
      familyId: "f1",
      description: "Paid",
      currency: "cad",
      amountCents: 300,
      status: "Paid (Stripe test)",
    },
  );
  assert.equal(report(db, staff, "payments").rows.length, 1);
  assert.equal(report(db, staff, "payments").rows[0][4], "25.00");
  assert.equal(
    report(db, staff, "inventory").rows.length,
    db.products.reduce((n, p) => n + Object.keys(p.stock).length, 0),
  );
});
