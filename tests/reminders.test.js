import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, visible } from "../server/extended.js";
import {
  processReminders,
  reminderAction,
  defaults,
} from "../server/reminders.js";
function setup() {
  const db = upgrade(seed()),
    parent = db.users.find((u) => u.id === "parent"),
    staff = db.users.find((u) => u.role === "staff"),
    now = Date.now();
  db.events = [
    {
      id: "future",
      title: "Practice",
      teamId: "t1",
      playerIds: ["p1"],
      start: new Date(now + 3600000).toISOString(),
      status: "Scheduled",
    },
  ];
  db.workouts = [];
  db.notifications = [];
  db.notificationPreferences = [
    { id: parent.id, userId: parent.id, ...defaults, email: true, push: true },
  ];
  return { db, parent, staff, now };
}
test("reminders deduplicate across repeated worker runs and stay recipient scoped", () => {
  const { db, parent, now } = setup();
  assert.equal(processReminders(db, now), true);
  const count = db.notifications.length;
  processReminders(db, now + 1);
  assert.equal(db.notifications.length, count);
  assert.equal(db.deliveryQueue.length, 2);
  assert.equal(visible(db, parent).deliveryQueue.length, 0);
  assert.equal(
    visible(db, { id: "other", role: "parent", familyId: "none" }).notifications
      .length,
    0,
  );
});
test("cancellation and opt-out cancel queued deliveries; past reminders expire", () => {
  const { db, parent, now } = setup();
  processReminders(db, now);
  reminderAction(db, parent, "notification-preferences", {
    ...defaults,
    email: false,
    push: false,
  });
  processReminders(db, now + 1);
  assert.ok(db.deliveryQueue.every((j) => j.status === "cancelled"));
  db.events[0].status = "Cancelled";
  processReminders(db, now + 2);
  assert.equal(visible(db, parent).notifications.length, 0);
  const other = setup();
  processReminders(other.db, other.now);
  processReminders(other.db, other.now + 3600001);
  assert.ok(other.db.deliveryQueue.every((j) => j.status === "expired"));
});
test("retry simulations back off, stop after five failures and never claim sent", () => {
  const { db, parent, staff, now } = setup();
  processReminders(db, now);
  const j = db.deliveryQueue[0];
  assert.throws(
    () => reminderAction(db, parent, "delivery-test-failure", { id: j.id }),
    /Staff/,
  );
  for (let i = 0; i < 5; i++)
    reminderAction(db, staff, "delivery-test-failure", { id: j.id });
  assert.equal(j.status, "failed");
  assert.equal(j.attempts, 5);
  reminderAction(db, staff, "delivery-retry", { id: j.id });
  assert.equal(j.status, "waiting-provider");
  assert.ok(db.deliveryQueue.every((j) => j.status !== "sent"));
});
test("workout completion and payment recovery suppress stale notices", () => {
  const { db, parent, now } = setup();
  db.workouts = [
    {
      id: "w",
      playerId: "p1",
      due: new Date(now + 100000).toISOString(),
      completed: false,
    },
  ];
  db.memberships = [
    { id: "m", familyId: "f1", status: "past_due", periodEnd: 1 },
  ];
  processReminders(db, now);
  assert.ok(
    visible(db, parent).notifications.some((n) => n.category === "payments"),
  );
  db.workouts[0].completed = true;
  db.memberships[0].status = "active";
  processReminders(db, now + 1);
  assert.ok(
    visible(db, parent).notifications.every(
      (n) => !["payments", "workouts"].includes(n.category),
    ),
  );
});
test("enabling external channels does not enqueue historical messages", () => {
  const { db, parent, now } = setup();
  db.notificationPreferences = [];
  db.notifications = [
    {
      id: "old",
      userId: parent.id,
      category: "changes",
      createdAt: new Date(now - 10000).toISOString(),
    },
  ];
  reminderAction(db, parent, "notification-preferences", {
    ...defaults,
    email: true,
  });
  processReminders(db, Date.now());
  assert.equal(
    db.deliveryQueue.some((j) => j.notificationId === "old"),
    false,
  );
});
