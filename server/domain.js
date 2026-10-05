import { creditBalance } from "./storefront.js";
import { randomUUID } from "node:crypto";
export const fail = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
export const id = () => randomUUID();
export const text = (v, max = 500) =>
  typeof v === "string" && v.trim() && v.trim().length <= max
    ? v.trim()
    : fail("Please enter valid text.");
export const integer = (v, min = 0, max = 10000) =>
  Number.isInteger(v) && v >= min && v <= max
    ? v
    : fail(`Enter a whole number between ${min} and ${max}.`);
export const isStaff = (u) => ["admin", "staff"].includes(u.role);
export const manages = (u, p) =>
  isStaff(u) || (u.role === "coach" && u.teamIds.includes(p.teamId));
export const canPlayer = (u, p) =>
  p &&
  (manages(u, p) ||
    (u.role === "parent" && p.familyId === u.familyId) ||
    (u.role === "player" && p.id === u.playerId));
export function player(db, u, playerId) {
  const p = db.players.find((x) => x.id === playerId);
  if (!canPlayer(u, p)) fail("Player access denied.", 403);
  return p;
}
export function requireStaff(u) {
  if (!isStaff(u)) fail("Staff access required.", 403);
}
export function channels(db, u) {
  return isStaff(u)
    ? db.teams.map((t) => t.id)
    : u.role === "coach"
      ? u.teamIds
      : [
          ...new Set(
            db.players
              .filter((p) => canPlayer(u, p))
              .map((p) => p.teamId)
              .filter(Boolean),
          ),
        ];
}
export function visible(db, u) {
  const players = db.players.filter((p) => canPlayer(u, p)),
    ids = new Set(players.map((p) => p.id));
  const familyIds = new Set(players.map((p) => p.familyId));
  const ch = channels(db, u);
  return {
    ...db,
    users: undefined,
    families: db.families.filter(
      (f) => isStaff(u) || (u.role === "parent" && f.id === u.familyId),
    ),
    players,
    enrollments: db.enrollments.filter((e) => ids.has(e.playerId)),
    events: db.events.filter(
      (e) => isStaff(u) || e.playerIds.some((p) => ids.has(p)),
    ),
    rsvps: db.rsvps.filter((x) => ids.has(x.playerId)),
    attendance: db.attendance.filter((x) => ids.has(x.playerId)),
    orders: db.orders.filter(
      (x) => isStaff(u) || (u.role === "parent" && familyIds.has(x.familyId)),
    ),
    credits: db.credits.filter((x) => ids.has(x.playerId)),
    workouts: db.workouts.filter((w) => ids.has(w.playerId)),
    results: db.results.filter((x) => ids.has(x.playerId)),
    messages: db.messages.filter((m) => ch.includes(m.channel)),
    waivers: db.waivers.filter(
      (w) => isStaff(u) || (u.role === "parent" && ids.has(w.playerId)),
    ),
    channels: ch,
  };
}
export function mutate(db, u, action, b) {
  if (action === "enroll") {
    if (!["parent", "admin", "staff"].includes(u.role))
      fail("Parent or staff access required.", 403);
    const p = player(db, u, b.playerId),
      a = db.programs.find((x) => x.id === b.programId);
    if (!a) fail("Program not found.", 404);
    if (
      db.enrollments.some(
        (x) =>
          x.playerId === p.id && x.programId === a.id && x.status === "Active",
      )
    )
      fail("This player is already registered.", 409);
    if (
      db.enrollments.filter(
        (x) => x.programId === a.id && x.status === "Active",
      ).length >= a.capacity
    )
      fail("This program is full.", 409);
    if (b.accepted !== true)
      fail("Accept the demonstration waiver to continue.");
    const signature = text(b.signature, 100);
    db.waivers.push({
      id: id(),
      playerId: p.id,
      programId: a.id,
      signature,
      version: "demo-1",
      text: "Demonstration acknowledgement only. Organization-approved legal waiver required before launch.",
      signedAt: new Date().toISOString(),
    });
    db.enrollments.push({
      id: id(),
      playerId: p.id,
      programId: a.id,
      status: "Active",
      amount: a.price,
      paymentStatus: "Demo — no charge",
    });
    db.events
      .filter((e) => e.programId === a.id)
      .forEach((e) => {
        if (!e.playerIds.includes(p.id)) e.playerIds.push(p.id);
      });
    return;
  }
  if (action === "rsvp" || action === "checkin") {
    const p = player(db, u, b.playerId),
      e = db.events.find((x) => x.id === b.eventId);
    if (!e || !e.playerIds.includes(p.id))
      fail("Player is not in this session.");
    if (action === "checkin" && !manages(u, p))
      fail("Coach or staff access required.", 403);
    const value = action === "rsvp" ? b.status : b.present;
    if (
      action === "rsvp" &&
      !["Going", "Unavailable", "Unsure"].includes(value)
    )
      fail("Invalid RSVP.");
    if (action === "checkin" && typeof value !== "boolean")
      fail("Invalid attendance.");
    const list = action === "rsvp" ? db.rsvps : db.attendance;
    let row = list.find((x) => x.playerId === p.id && x.eventId === e.id);
    if (!row) {
      row = { playerId: p.id, eventId: e.id };
      list.push(row);
    }
    row[action === "rsvp" ? "status" : "present"] = value;
    return;
  }
  if (action === "order") {
    if (!["parent", "admin", "staff"].includes(u.role))
      fail("Parent or staff access required.", 403);
    const p = player(db, u, b.playerId),
      product = db.products.find((x) => x.id === b.productId);
    if (!product || !product.sizes.includes(b.size))
      fail("Choose a valid product and size.");
    const quantity = integer(b.quantity, 1, 10);
    if (product.stock[b.size] < quantity)
      fail("Not enough stock in this size.", 409);
    const year = new Date().getFullYear(),
      used = db.credits
        .filter((c) => c.playerId === p.id && c.year === year)
        .reduce((n, c) => n + c.quantity, 0);
    const free =
      b.useCredits && product.creditEligible
        ? Math.min(quantity, creditBalance(db, p.id, year))
        : 0;
    product.stock[b.size] -= quantity;
    if (free)
      db.credits.push({ id: id(), playerId: p.id, year, quantity: free });
    db.orders.unshift({
      id: id(),
      playerId: p.id,
      familyId: p.familyId,
      productId: product.id,
      size: b.size,
      quantity,
      free,
      total: (quantity - free) * product.price,
      status: "Ready to prepare",
      paymentStatus: "Demo — no charge",
      coach: db.teams.find((t) => t.id === p.teamId)?.coach,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (action === "fulfill") {
    requireStaff(u);
    const order = db.orders.find((x) => x.id === b.id);
    if (!order) fail("Order not found.", 404);
    order.status = "Delivered";
    return;
  }
  if (action === "workout") {
    const w = db.workouts.find((x) => x.id === b.id);
    if (!w) fail("Workout not found.", 404);
    player(db, u, w.playerId);
    const attempts = integer(b.attempts),
      made = integer(b.made);
    if (made > attempts) fail("Makes cannot exceed attempts.");
    if (w.completed) fail("This workout is already complete.", 409);
    w.completed = true;
    db.results.push({
      id: id(),
      workoutId: w.id,
      playerId: w.playerId,
      attempts,
      made,
      notes: typeof b.notes === "string" ? b.notes.slice(0, 500) : "",
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (action === "assign") {
    const p = player(db, u, b.playerId);
    if (!manages(u, p)) fail("Coach or staff access required.", 403);
    if (!db.drills.some((d) => d.id === b.drillId)) fail("Drill not found.");
    const due = new Date(b.due);
    if (!Number.isFinite(+due)) fail("Choose a due date.");
    db.workouts.push({
      id: id(),
      drillId: b.drillId,
      playerId: p.id,
      due: due.toISOString(),
      completed: false,
    });
    return;
  }
  if (action === "message") {
    if (!channels(db, u).includes(b.channel))
      fail("Channel access denied.", 403);
    db.messages.push({
      id: id(),
      channel: b.channel,
      author: u.name,
      text: text(b.text, 2000),
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (action === "score") {
    const g = db.games.find((x) => x.id === b.id);
    if (!g) fail("Game not found.", 404);
    requireStaff(u);
    g.homeScore = integer(b.homeScore, 0, 500);
    g.awayScore = integer(b.awayScore, 0, 500);
    if (!["Scheduled", "Live", "Final"].includes(b.status))
      fail("Invalid game status.");
    g.status = b.status;
    return;
  }
  if (action === "schedule") {
    requireStaff(u);
    const start = new Date(b.start),
      minutes = integer(b.minutes, 15, 240),
      count = integer(b.count, 1, 20);
    if (!Number.isFinite(+start)) fail("Choose a date and time.");
    const title = text(b.title, 100),
      location = text(b.location, 120);
    const team = db.teams.find((t) => t.id === b.teamId);
    if (!team) fail("Choose a team.");
    const proposed = Array.from({ length: count }, (_, i) => ({
      id: id(),
      title,
      kind: "Practice",
      start: new Date(+start + i * 7 * 86400000).toISOString(),
      minutes,
      location,
      address: location,
      teamId: team.id,
      playerIds: db.players
        .filter((p) => p.teamId === team.id)
        .map((p) => p.id),
    }));
    for (const e of proposed) {
      if (
        db.events.some(
          (x) =>
            (x.teamId === e.teamId ||
              x.opponentId === e.teamId ||
              x.location.toLowerCase() === location.toLowerCase()) &&
            +new Date(e.start) < +new Date(x.start) + x.minutes * 60000 &&
            +new Date(x.start) < +new Date(e.start) + minutes * 60000,
        )
      )
        fail(
          "Scheduling conflict: this team or court is already booked. Nothing was added.",
          409,
        );
    }
    db.events.push(...proposed);
    db.events.sort((a, b) => a.start.localeCompare(b.start));
    return;
  }
  if (action === "program") {
    requireStaff(u);
    db.programs.push({
      id: id(),
      name: text(b.name, 100),
      type: ["League", "Skill Development"].includes(b.type)
        ? b.type
        : fail("Choose a program type."),
      ages: text(b.ages, 30),
      price: integer(b.price, 0, 10000),
      capacity: integer(b.capacity, 1, 500),
      description: text(b.description),
      location: text(b.location, 120),
      sessions: integer(b.sessions, 1, 100),
    });
    return;
  }
  fail("Unknown action.", 404);
}
