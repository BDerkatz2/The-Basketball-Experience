import { id, fail, channels, isStaff } from "./domain.js";
export const defaults = {
  inApp: true,
  email: false,
  push: false,
  sessions: true,
  workouts: true,
  changes: true,
  payments: true,
};
export const preferences = (db, u) => ({
  ...defaults,
  ...db.notificationPreferences.find((p) => p.userId === u.id),
});
export function sessionAudience(db, u, e) {
  return (
    channels(db, u).some((t) => [e.teamId, e.opponentId].includes(t)) ||
    db.players.some(
      (p) =>
        e.playerIds.includes(p.id) &&
        (u.playerId === p.id ||
          (u.role === "parent" && u.familyId === p.familyId)),
    )
  );
}
export function reminderAction(db, u, action, b) {
  if (action === "notification-preferences") {
    const row = { id: u.id, userId: u.id };
    for (const k of Object.keys(defaults)) {
      if (typeof b[k] !== "boolean")
        fail("Choose all notification preferences.");
      row[k] = b[k];
    }
    const old = db.notificationPreferences.find((p) => p.userId === u.id);
    for (const c of ["email", "push"])
      row[c + "Since"] = row[c] && !old?.[c] ? Date.now() : old?.[c + "Since"];
    if (old) Object.assign(old, row);
    else db.notificationPreferences.push(row);
    return;
  }
  if (!isStaff(u)) fail("Staff access required.", 403);
  if (action === "reminders-run") {
    processReminders(db);
    return;
  }
  const job = db.deliveryQueue.find((j) => j.id === b.id);
  if (!job) fail("Delivery not found.", 404);
  if (action === "delivery-retry") {
    if (job.status !== "failed") fail("Only failed deliveries can be retried.");
    job.status = "waiting-provider";
    job.nextAttemptAt = null;
    job.lastError = null;
    return;
  }
  // Deliberate local failure simulation exercises backoff without contacting a provider.
  if (action === "delivery-test-failure") {
    if (!["waiting-provider", "retry"].includes(job.status))
      fail("Choose a pending delivery.");
    job.attempts++;
    job.lastError = "Simulated provider failure — no message sent";
    job.status = job.attempts >= 5 ? "failed" : "retry";
    job.nextAttemptAt =
      job.status === "retry"
        ? Date.now() + Math.min(3600000, 60000 * 2 ** (job.attempts - 1))
        : null;
    return;
  }
  fail("Unknown delivery action.");
}
export function processReminders(db, now = Date.now()) {
  const before = JSON.stringify([db.notifications, db.deliveryQueue]);
  const add = (u, key, category, title, message, source) => {
    if (!preferences(db, u)[category]) return;
    if (
      !db.notifications.some((n) => n.reminderKey === key && n.userId === u.id)
    )
      db.notifications.unshift({
        id: id(),
        userId: u.id,
        reminderKey: key,
        category,
        title,
        text: message,
        source,
        createdAt: new Date(now).toISOString(),
        read: false,
      });
  };
  for (const u of db.users) {
    for (const e of db.events) {
      const at = Date.parse(e.start);
      if (
        e.status !== "Cancelled" &&
        at > now &&
        at <= now + 86400000 &&
        sessionAudience(db, u, e)
      )
        add(
          u,
          "session:" + e.id + ":" + e.start,
          "sessions",
          e.title,
          "A session is coming up. Check your calendar for time and location.",
          { kind: "session", id: e.id, at: e.start },
        );
    }
    for (const w of db.workouts) {
      const p = db.players.find((p) => p.id === w.playerId),
        at = Date.parse(w.due);
      if (
        p &&
        !w.completed &&
        !w.cancelledAt &&
        at > now &&
        at <= now + 86400000 &&
        (u.playerId === p.id ||
          (u.role === "parent" && u.familyId === p.familyId))
      )
        add(
          u,
          "workout:" + w.id + ":" + w.due,
          "workouts",
          "Workout due soon",
          "An assigned workout is due within 24 hours. Open Training to review it.",
          { kind: "workout", id: w.id, at: w.due },
        );
    }
    for (const m of db.memberships) {
      if (
        u.role === "parent" &&
        u.familyId === m.familyId &&
        ["past_due", "unpaid"].includes(m.status)
      )
        add(
          u,
          "payment:" + m.id + ":" + m.periodEnd,
          "payments",
          "Membership payment needs attention",
          "Open your membership to review its payment status.",
          { kind: "payment", id: m.id },
        );
    }
  }
  function valid(n, u) {
    const p = preferences(db, u);
    if (!p[n.category || "changes"]) return false;
    if (!n.source) return true;
    const s = n.source;
    if (s.kind === "change") {
      const e = db.events.find((e) => e.id === s.id);
      return e && sessionAudience(db, u, e);
    }
    if (s.kind === "session") {
      const e = db.events.find((e) => e.id === s.id);
      return (
        e &&
        e.status !== "Cancelled" &&
        e.start === s.at &&
        sessionAudience(db, u, e)
      );
    }
    if (s.kind === "workout") {
      const w = db.workouts.find((w) => w.id === s.id),
        p = db.players.find((p) => p.id === w?.playerId);
      return (
        w &&
        !w.completed &&
        !w.cancelledAt &&
        w.due === s.at &&
        p &&
        (u.playerId === p.id ||
          (u.role === "parent" && u.familyId === p.familyId))
      );
    }
    if (s.kind === "payment") {
      const m = db.memberships.find((m) => m.id === s.id);
      return (
        m &&
        u.role === "parent" &&
        m.familyId === u.familyId &&
        ["past_due", "unpaid"].includes(m.status)
      );
    }
    return false;
  }
  for (const n of db.notifications) {
    const u = db.users.find((u) => u.id === n.userId);
    n.suppressed = !u || !valid(n, u);
    if (n.suppressed) continue;
    const p = preferences(db, u);
    for (const channel of ["email", "push"])
      if (
        p[channel] &&
        Date.parse(n.createdAt) >= (p[channel + "Since"] || 0) &&
        now <
          (n.source?.at
            ? Date.parse(n.source.at)
            : Date.parse(n.createdAt) + 86400000) &&
        !db.deliveryQueue.some(
          (j) => j.notificationId === n.id && j.channel === channel,
        )
      )
        db.deliveryQueue.push({
          id: id(),
          notificationId: n.id,
          userId: u.id,
          channel,
          status: "waiting-provider",
          attempts: 0,
          createdAt: new Date(now).toISOString(),
          nextAttemptAt: null,
        });
  }
  for (const j of db.deliveryQueue) {
    if (
      [
        "sending",
        "unknown",
        "provider-accepted",
        "push-service-confirmed",
      ].includes(j.status)
    )
      continue;
    const u = db.users.find((u) => u.id === j.userId),
      n = db.notifications.find((n) => n.id === j.notificationId);
    if (!u || !n || n.suppressed || !preferences(db, u)[j.channel]) {
      if (!["sent", "cancelled"].includes(j.status)) j.status = "cancelled";
      continue;
    }
    if (
      now >=
      (n.source?.at
        ? Date.parse(n.source.at)
        : Date.parse(n.createdAt) + 86400000)
    ) {
      if (!["sent", "cancelled"].includes(j.status)) j.status = "expired";
      continue;
    }
    if (j.status === "retry" && j.nextAttemptAt <= now) {
      j.status = "waiting-provider";
      j.nextAttemptAt = null;
    }
  }
  return before !== JSON.stringify([db.notifications, db.deliveryQueue]);
}
