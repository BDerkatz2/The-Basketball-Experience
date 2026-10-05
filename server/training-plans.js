import { fail, id, text, integer, isStaff, player, manages } from "./domain.js";
import { weeklyStarts } from "./scheduling.js";
export function trainingPlanAction(db, u, action, b) {
  if (!isStaff(u) && u.role !== "coach")
    fail("Coach or staff access required.", 403);
  if (action === "training-plan-cancel") {
    const rows = db.workouts.filter((w) => w.sessionId === b.sessionId);
    if (!rows.length) fail("Assignment not found.", 404);
    for (const w of rows)
      if (
        !isStaff(u) &&
        (w.assignedBy !== u.id || !manages(u, player(db, u, w.playerId)))
      )
        fail("Assignment access denied.", 403);
    const pending = rows.filter((w) => !w.completed && !w.cancelledAt);
    if (!pending.length) fail("No unfinished exercises remain.", 409);
    for (const w of pending) {
      w.cancelledAt = new Date().toISOString();
      w.cancelledBy = u.id;
    }
    return;
  }
  if (action === "training-plan-create" || action === "training-plan-edit") {
    const existing =
      action === "training-plan-edit"
        ? db.trainingPlans.find(
            (p) => p.id === b.planId && (isStaff(u) || p.ownerId === u.id),
          )
        : null;
    if (action === "training-plan-edit" && !existing)
      fail("Training plan not found.", 404);
    if (
      !Array.isArray(b.drillIds) ||
      b.drillIds.length < 1 ||
      b.drillIds.length > 12 ||
      new Set(b.drillIds).size !== b.drillIds.length
    )
      fail("Choose 1–12 different exercises.");
    const exercises = b.drillIds.map((drillId) => {
      const drill = db.drills.find((d) => d.id === drillId);
      if (!drill) fail("Exercise not found.");
      return structuredClone(drill);
    });
    const fields = {
      name: text(b.name, 100),
      notes: b.notes ? text(b.notes, 2000) : "",
      exercises,
    };
    if (existing) {
      Object.assign(existing, fields, {
        updatedAt: new Date().toISOString(),
        revision: (existing.revision || 1) + 1,
      });
      return;
    }
    db.trainingPlans.push({
      id: id(),
      name: text(b.name, 100),
      notes: b.notes ? text(b.notes, 2000) : "",
      ownerId: u.id,
      exercises,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const plan = db.trainingPlans.find(
    (p) => p.id === b.planId && (isStaff(u) || p.ownerId === u.id),
  );
  if (!plan) fail("Training plan not found.", 404);
  if (action === "training-plan-archive") {
    if (typeof b.archived !== "boolean") fail("Choose an archive state.");
    plan.archived = b.archived;
    return;
  }
  if (plan.archived) fail("Restore this plan before assigning it.", 409);
  if (
    !Array.isArray(b.playerIds) ||
    !b.playerIds.length ||
    b.playerIds.length > 30 ||
    new Set(b.playerIds).size !== b.playerIds.length
  )
    fail("Choose 1–30 different players.");
  const players = b.playerIds.map((playerId) => {
    const p = player(db, u, playerId);
    if (!manages(u, p)) fail("Roster access denied.", 403);
    return p;
  });
  const count = integer(b.count, 1, 12),
    dueDates = weeklyStarts({ start: b.start, timeZone: b.timeZone, count });
  const total = players.length * count * plan.exercises.length;
  if (total > 360)
    fail("This assignment exceeds 360 exercises. Use fewer players or weeks.");
  if (
    db.workouts.some(
      (w) =>
        w.planId === plan.id &&
        !w.cancelledAt &&
        b.playerIds.includes(w.playerId) &&
        dueDates.includes(w.due),
    )
  )
    fail(
      "This plan is already assigned to a selected player on one of those dates. Nothing was added.",
      409,
    );
  const batchId = id();
  for (const p of players)
    for (const due of dueDates) {
      const sessionId = id();
      plan.exercises.forEach((drill, index) =>
        db.workouts.push({
          id: id(),
          drillId: drill.id,
          drillSnapshot: structuredClone(drill),
          playerId: p.id,
          due,
          completed: false,
          planId: plan.id,
          planName: plan.name,
          planNotes: plan.notes,
          exerciseNumber: index + 1,
          exerciseCount: plan.exercises.length,
          sessionId,
          batchId,
          assignedBy: u.id,
        }),
      );
    }
}
