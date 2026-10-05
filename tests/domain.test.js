import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { mutate, visible } from "../server/domain.js";
const setup = () => {
  const db = seed();
  return {
    db,
    parent: db.users.find((u) => u.id === "parent"),
    admin: db.users.find((u) => u.id === "admin"),
    coach: db.users.find((u) => u.id === "coach"),
    player: db.users.find((u) => u.id === "player"),
  };
};
test("family and player scopes do not leak other family records", () => {
  const { db, parent, player } = setup();
  assert.deepEqual(
    visible(db, parent).players.map((p) => p.id),
    ["p1", "p2"],
  );
  assert.deepEqual(
    visible(db, player).players.map((p) => p.id),
    ["p1"],
  );
  assert.equal(visible(db, player).families.length, 0);
  assert.equal(visible(db, parent).users, undefined);
});
test("parent cannot access another family player or staff mutation", () => {
  const { db, parent } = setup();
  assert.throws(
    () =>
      mutate(db, parent, "rsvp", {
        playerId: "p3",
        eventId: "s1",
        status: "Going",
      }),
    /denied/,
  );
  assert.throws(
    () =>
      mutate(db, parent, "score", {
        id: "g1",
        homeScore: 5,
        awayScore: 4,
        status: "Live",
      }),
    /Staff access/,
  );
});
test("registration requires waiver, enforces capacity, rejects duplicates", () => {
  const { db, parent } = setup();
  const b = { playerId: "p2", programId: "a3", signature: "Jordan Morgan" };
  assert.throws(() => mutate(db, parent, "enroll", b), /Accept/);
  mutate(db, parent, "enroll", { ...b, accepted: true });
  assert.equal(db.waivers.length, 1);
  assert.throws(
    () => mutate(db, parent, "enroll", { ...b, accepted: true }),
    /already registered/,
  );
  db.programs.find((p) => p.id === "a3").capacity = 1;
  assert.throws(
    () =>
      mutate(db, parent, "enroll", { ...b, playerId: "p1", accepted: true }),
    /full/,
  );
});
test("shirt credits capped at two per player per year; stock is decremented", () => {
  const { db, parent } = setup();
  const order = {
    playerId: "p1",
    productId: "shirt",
    size: "M",
    quantity: 3,
    useCredits: true,
  };
  mutate(db, parent, "order", order);
  assert.equal(db.orders[0].free, 2);
  assert.equal(db.orders[0].total, 30);
  assert.equal(db.products[0].stock.M, 9);
  mutate(db, parent, "order", { ...order, quantity: 1 });
  assert.equal(db.orders[0].free, 0);
  assert.equal(db.orders[0].total, 30);
  mutate(db, parent, "order", { ...order, playerId: "p2", quantity: 1 });
  assert.equal(db.orders[0].free, 1);
});
test("checkout rejects missing player, bad size, insufficient stock and negative quantities", () => {
  const { db, parent } = setup();
  const b = { playerId: "p1", productId: "shirt", size: "M", quantity: 1 };
  for (const bad of [
    { playerId: "" },
    { size: "invalid" },
    { quantity: -1 },
    { quantity: 99 },
  ])
    assert.throws(() => mutate(db, parent, "order", { ...b, ...bad }));
  db.products[0].stock.M = 0;
  assert.throws(() => mutate(db, parent, "order", b), /stock/);
  assert.equal(db.orders.length, 0);
});
test("RSVP is idempotent and parents cannot check players in", () => {
  const { db, parent, coach } = setup();
  const b = { eventId: "s1", playerId: "p1", status: "Going" };
  mutate(db, parent, "rsvp", b);
  mutate(db, parent, "rsvp", { ...b, status: "Unavailable" });
  assert.equal(db.rsvps.length, 1);
  assert.equal(db.rsvps[0].status, "Unavailable");
  assert.throws(
    () => mutate(db, parent, "checkin", { ...b, present: true }),
    /Coach or staff/,
  );
  mutate(db, coach, "checkin", { ...b, present: true });
  assert.equal(db.attendance[0].present, true);
});
test("workout cannot log impossible results or be completed twice", () => {
  const { db, player } = setup();
  assert.throws(
    () => mutate(db, player, "workout", { id: "w1", attempts: 10, made: 11 }),
    /exceed/,
  );
  mutate(db, player, "workout", { id: "w1", attempts: 50, made: 20 });
  assert.equal(db.results[0].made, 20);
  assert.throws(
    () => mutate(db, player, "workout", { id: "w1", attempts: 50, made: 20 }),
    /already complete/,
  );
  assert.throws(
    () => mutate(db, player, "workout", { id: "w3", attempts: 0, made: 0 }),
    /denied/,
  );
});
test("bulk schedule is all-or-nothing when a later week conflicts", () => {
  const { db, admin } = setup();
  const existing = db.events[0];
  const before = db.events.length;
  const first = new Date(
    +new Date(existing.start) - 7 * 86400000,
  ).toISOString();
  assert.throws(
    () =>
      mutate(db, admin, "schedule", {
        title: "Practice",
        teamId: "t1",
        start: first,
        minutes: 60,
        count: 2,
        location: "Another court",
      }),
    /conflict/,
  );
  assert.equal(db.events.length, before);
  mutate(db, admin, "schedule", {
    title: "Practice",
    teamId: "t4",
    start: first,
    minutes: 60,
    count: 2,
    location: "Another court",
  });
  assert.equal(db.events.length, before + 2);
});
test("team chat is scoped and cannot impersonate authors", () => {
  const { db, player } = setup();
  assert.throws(
    () => mutate(db, player, "message", { channel: "t2", text: "hello" }),
    /denied/,
  );
  mutate(db, player, "message", {
    channel: "t1",
    text: "Good practice",
    author: "Fake",
  });
  assert.equal(db.messages.at(-1).author, player.name);
  assert.equal(
    visible(db, player).messages.some((m) => m.channel === "t2"),
    false,
  );
});
test("coaches can assign only to their roster and cannot change scores", () => {
  const { db, coach } = setup();
  db.players.push({ id: "other", familyId: "f2", teamId: "t3" });
  assert.throws(
    () =>
      mutate(db, coach, "assign", {
        playerId: "other",
        drillId: "d1",
        due: "2026-10-01",
      }),
    /denied/,
  );
  mutate(db, coach, "assign", {
    playerId: "p1",
    drillId: "d1",
    due: "2026-10-01",
  });
  assert.equal(db.workouts.length, 4);
  assert.throws(
    () =>
      mutate(db, coach, "score", {
        id: "g1",
        homeScore: 2,
        awayScore: 4,
        status: "Final",
      }),
    /Staff access/,
  );
});
