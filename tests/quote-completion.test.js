import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, conflicts } from "../server/extended.js";
import { weeklyStarts, suggestSchedule } from "../server/scheduling.js";
import { eligibility } from "../server/registration.js";
function setup() {
  const db = upgrade(seed());
  return {
    db,
    admin: db.users.find((u) => u.role === "admin"),
    parent: db.users.find((u) => u.role === "parent"),
  };
}
test("eligibility validates boundaries, membership, registration windows and waitlist entry", () => {
  const { db, admin, parent } = setup();
  const p = db.players.find((p) => p.id === "p1");
  const rules = {
    id: "a3",
    minAge: p.age,
    maxAge: p.age,
    closed: false,
    membersOnly: false,
    opensAt: "2027-01-01T00:00:00Z",
    closesAt: "2027-02-01T00:00:00Z",
  };
  mutate(db, admin, "registration-rules", rules);
  const b = { programId: "a3", playerId: "p1" };
  eligibility(db, parent, b, Date.parse(rules.opensAt));
  assert.throws(
    () => eligibility(db, parent, b, Date.parse(rules.opensAt) - 1),
    /not opened/,
  );
  assert.throws(
    () => eligibility(db, parent, b, Date.parse(rules.closesAt)),
    /deadline/,
  );
  mutate(db, admin, "registration-rules", {
    ...rules,
    minAge: p.age + 1,
    maxAge: 99,
    opensAt: null,
    closesAt: null,
  });
  assert.throws(() => mutate(db, parent, "waitlist-join", b), /age/);
  assert.throws(
    () =>
      mutate(db, parent, "enroll", { ...b, accepted: true, signature: "Test" }),
    /age/,
  );
  mutate(db, admin, "registration-rules", {
    ...rules,
    membersOnly: true,
    opensAt: null,
    closesAt: null,
  });
  db.families.find((f) => f.id === p.familyId).membership = "Expired";
  assert.throws(() => eligibility(db, parent, b), /membership/);
  assert.throws(() => mutate(db, parent, "registration-rules", rules), /Staff/);
  assert.throws(
    () =>
      mutate(db, admin, "registration-rules", {
        ...rules,
        minAge: 18,
        maxAge: 9,
      }),
    /Minimum age/,
  );
  assert.throws(
    () =>
      mutate(db, admin, "registration-rules", {
        ...rules,
        opensAt: "2027-01-01T12:00",
      }),
    /time zone/,
  );
});
test("season copy preserves all historical records, copies the waiver form, closes registration and rejects duplicate rollover", () => {
  const { db, admin, parent } = setup();
  mutate(db, admin, "form-save", {
    programId: "a3",
    title: "Shooting waiver",
    waiverText: "Test only",
    fields: [],
  });
  const history = JSON.stringify([
    db.enrollments,
    db.invoices,
    db.events,
    db.waivers,
  ]);
  const b = {
    id: "a3",
    season: "Spring 2027",
    name: "Spring shooting",
    confirm: true,
  };
  assert.throws(() => mutate(db, parent, "season-rollover", b), /Staff/);
  mutate(db, admin, "season-rollover", b);
  const next = db.programs.at(-1);
  assert.equal(next.season, "Spring 2027");
  assert.equal(next.registration.closed, true);
  assert.equal(db.programs.find((p) => p.id === "a3").registrationClosed, true);
  assert.notEqual(next.formId, db.programs.find((p) => p.id === "a3").formId);
  assert.equal(db.forms.find((f) => f.id === next.formId).programId, next.id);
  assert.equal(
    JSON.stringify([db.enrollments, db.invoices, db.events, db.waivers]),
    history,
  );
  assert.throws(() => mutate(db, admin, "season-rollover", b), /already/);
  assert.throws(
    () => eligibility(db, parent, { programId: next.id, playerId: "p1" }),
    /closed/,
  );
});
test("recurrence exceptions omit local dates across DST and persist a shared series ID", () => {
  const { db, admin } = setup();
  const b = {
    teamId: "t1",
    title: "Spring practices",
    start: "2027-03-07T18:00",
    timeZone: "America/Edmonton",
    count: 3,
    minutes: 60,
    location: "New court",
    excludeDates: ["2027-03-14"],
  };
  const dates = weeklyStarts(b);
  assert.equal(dates.length, 2);
  assert.equal((Date.parse(dates[1]) - Date.parse(dates[0])) / 3600000, 335);
  mutate(db, admin, "schedule", b);
  const events = db.events.filter((e) => e.title === b.title);
  assert.equal(events.length, 2);
  assert.equal(events[0].seriesId, events[1].seriesId);
  assert.throws(
    () => weeklyStarts({ ...b, count: 1, excludeDates: ["2027-03-07"] }),
    /At least one/,
  );
  assert.throws(
    () => weeklyStarts({ ...b, excludeDates: ["invalid"] }),
    /skipped dates/,
  );
});
test("tournament constraints allow multiple games only within daily limits and rest, with two home/away rounds", () => {
  const { db, admin } = setup();
  db.events = [];
  const b = {
    teamIds: ["t1", "t3"],
    start: "2027-01-04T09:00",
    timeZone: "UTC",
    location: "Court",
    days: 1,
    slots: 4,
    minutes: 60,
    gap: 60,
    maxGamesPerDay: 2,
    restHours: 1,
    rounds: 2,
  };
  const plan = suggestSchedule(db, admin, b, conflicts);
  assert.equal(plan.complete, true);
  assert.equal(plan.games.length, 2);
  assert.equal(plan.games[0].teamId, plan.games[1].opponentId);
  assert.ok(
    Date.parse(plan.games[1].start) - Date.parse(plan.games[0].start) >=
      7200000,
  );
  assert.equal(
    suggestSchedule(db, admin, { ...b, maxGamesPerDay: 1 }, conflicts).complete,
    false,
  );
  assert.equal(
    suggestSchedule(db, admin, { ...b, restHours: 10 }, conflicts).complete,
    false,
  );
  assert.throws(
    () => suggestSchedule(db, admin, { ...b, maxGamesPerDay: 0 }, conflicts),
    /whole number/,
  );
});
