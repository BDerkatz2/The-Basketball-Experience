import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
function setup() {
  const db = upgrade(seed()),
    coach = db.users.find((u) => u.role === "coach"),
    parent = db.users.find((u) => u.role === "parent");
  mutate(db, coach, "training-plan-create", {
    name: "Complete practice",
    notes: "Stay controlled",
    drillIds: ["d1", "d3"],
  });
  return { db, coach, parent, plan: db.trainingPlans[0] };
}
test("plans preserve exercise order and snapshots across later drill edits and weekly assignments", () => {
  const { db, coach, plan } = setup();
  const original = plan.exercises[0].instructions;
  db.drills[0].instructions = "Changed later";
  mutate(db, coach, "training-plan-assign", {
    planId: plan.id,
    playerIds: ["p1", "p2"],
    start: "2027-03-07T18:00",
    timeZone: "America/Edmonton",
    count: 2,
  });
  const rows = db.workouts.filter((w) => w.planId === plan.id);
  assert.equal(rows.length, 8);
  assert.equal(rows[0].drillSnapshot.instructions, original);
  assert.deepEqual(
    rows.slice(0, 2).map((w) => w.drillId),
    ["d1", "d3"],
  );
  assert.equal(new Set(rows.map((w) => w.sessionId)).size, 4);
  assert.equal(
    (Date.parse(rows[2].due) - Date.parse(rows[0].due)) / 3600000,
    167,
  );
});
test("plan creation/assignment reject parent access and players outside coach scope", () => {
  const { db, coach, parent, plan } = setup();
  assert.throws(
    () =>
      mutate(db, parent, "training-plan-create", {
        name: "Invalid",
        drillIds: ["d1"],
      }),
    /Coach/,
  );
  db.players.push({ id: "outside", familyId: "f2", teamId: "t3" });
  const before = db.workouts.length;
  assert.throws(
    () =>
      mutate(db, coach, "training-plan-assign", {
        planId: plan.id,
        playerIds: ["p1", "outside"],
        start: "2027-01-01T18:00",
        timeZone: "UTC",
        count: 1,
      }),
    /access denied/,
  );
  assert.equal(db.workouts.length, before);
  assert.equal(visible(db, parent).trainingPlans.length, 0);
});
test("repeated assignments are rejected atomically and completion contributes ordinary workout results", () => {
  const { db, coach, parent, plan } = setup();
  const request = {
    planId: plan.id,
    playerIds: ["p1"],
    start: "2027-01-01T18:00",
    timeZone: "UTC",
    count: 1,
  };
  mutate(db, coach, "training-plan-assign", request);
  const before = db.workouts.length;
  assert.throws(
    () => mutate(db, coach, "training-plan-assign", request),
    /already assigned/,
  );
  assert.equal(db.workouts.length, before);
  const w = db.workouts.at(-1);
  mutate(db, parent, "workout", {
    id: w.id,
    attempts: 0,
    made: 0,
    notes: "Done",
  });
  assert.equal(w.completed, true);
  assert.ok(db.results.some((r) => r.workoutId === w.id));
});
