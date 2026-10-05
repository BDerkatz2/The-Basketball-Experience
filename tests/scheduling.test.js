import test from "node:test";
import assert from "node:assert/strict";
import { weeklyStarts, suggestSchedule } from "../server/scheduling.js";
import { seed } from "../server/seed.js";
import { upgrade, mutate, conflicts } from "../server/extended.js";
const request = {
  teamIds: ["t1", "t3", "t4"],
  start: "2027-01-04T18:00",
  timeZone: "America/Edmonton",
  location: "Test court",
  days: 7,
  slots: 3,
  minutes: 60,
  gap: 15,
};
test("weekly practices preserve local time across daylight saving and reject nonexistent or ambiguous times", () => {
  const dates = weeklyStarts({
    start: "2027-03-07T18:00",
    timeZone: "America/Edmonton",
    count: 2,
  });
  assert.equal((Date.parse(dates[1]) - Date.parse(dates[0])) / 3600000, 167);
  assert.throws(
    () =>
      weeklyStarts({
        start: "2027-03-07T02:30",
        timeZone: "America/Edmonton",
        count: 2,
      }),
    /invalid or ambiguous/,
  );
  assert.throws(
    () =>
      weeklyStarts({
        start: "2027-11-07T01:30",
        timeZone: "America/Edmonton",
        count: 1,
      }),
    /invalid or ambiguous/,
  );
  assert.throws(
    () =>
      weeklyStarts({
        start: "2027-01-04T18:00",
        timeZone: "Bad/Zone",
        count: 1,
      }),
    /time zone/,
  );
});
test("round robin previews all unique pairings, commits matching games and rejects stale plans", () => {
  const db = upgrade(seed()),
    admin = db.users.find((u) => u.role === "admin");
  const plan = suggestSchedule(db, admin, request, conflicts);
  assert.equal(plan.complete, true);
  assert.equal(plan.games.length, 3);
  assert.equal(
    new Set(plan.games.map((g) => [g.teamId, g.opponentId].sort().join(":")))
      .size,
    3,
  );
  assert.equal(new Set(plan.games.map((g) => g.start.slice(0, 10))).size, 3);
  const before = db.games.length;
  mutate(db, admin, "schedule-plan", {
    ...request,
    fingerprint: plan.fingerprint,
  });
  assert.equal(db.games.length, before + 3);
  assert.ok(
    db.games.slice(-3).every((g) => db.events.some((e) => e.id === g.eventId)),
  );
  assert.throws(
    () =>
      mutate(db, admin, "schedule-plan", {
        ...request,
        fingerprint: plan.fingerprint,
      }),
    /Preview|preview|fit/,
  );
});
test("planner refuses unauthorized and mixed division requests and exposes incomplete plans", () => {
  const db = upgrade(seed()),
    admin = db.users.find((u) => u.role === "admin");
  assert.throws(
    () => suggestSchedule(db, { role: "parent" }, request, conflicts),
    /Staff/,
  );
  assert.throws(
    () =>
      suggestSchedule(
        db,
        admin,
        { ...request, teamIds: ["t1", "t2"] },
        conflicts,
      ),
    /division/,
  );
  const plan = suggestSchedule(db, admin, { ...request, days: 1 }, conflicts);
  assert.equal(plan.complete, false);
  assert.equal(plan.unscheduled.length, 2);
  assert.throws(
    () =>
      mutate(db, admin, "schedule-plan", {
        ...request,
        days: 1,
        fingerprint: plan.fingerprint,
      }),
    /does not fit/,
  );
});
test("planner skips occupied court slots and produces no overlapping proposals", () => {
  const db = upgrade(seed()),
    admin = db.users.find((u) => u.role === "admin");
  db.events.push({
    id: "busy",
    start: "2027-01-05T01:00:00.000Z",
    minutes: 60,
    location: "Test court",
    playerIds: [],
    status: "Scheduled",
  });
  const plan = suggestSchedule(db, admin, request, conflicts);
  assert.equal(plan.games[0].start, "2027-01-05T02:15:00.000Z");
  for (const e of plan.games)
    assert.equal(
      conflicts(
        { ...db, events: [...db.events, ...plan.games.filter((g) => g !== e)] },
        e,
      ).length,
      0,
    );
});
