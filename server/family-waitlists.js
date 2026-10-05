import { fail, id, text, integer, isStaff, player } from "./domain.js";
export function familyProfile(db, u, action, b) {
  if (u.role !== "parent") fail("Parent access required.", 403);
  const family = db.families.find((f) => f.id === u.familyId);
  if (!family) fail("Family not found.", 404);
  if (action === "family-profile") {
    const email = text(b.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("Enter a valid contact email.");
    const phone = b.phone ? text(b.phone, 40) : "";
    if (phone && !/^[+\d\s().-]{7,40}$/.test(phone))
      fail("Enter a valid phone number.");
    Object.assign(family, {
      name: text(b.name, 100),
      email,
      phone,
      address: b.address ? text(b.address, 300) : "",
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  const existing = b.id
    ? db.players.find((p) => p.id === b.id && p.familyId === family.id)
    : null;
  if (b.id && !existing) fail("Player access denied.", 403);
  const fields = { name: text(b.name, 100), age: integer(b.age, 2, 100) };
  if (existing) Object.assign(existing, fields);
  else
    db.players.push({
      id: id(),
      ...fields,
      familyId: family.id,
      teamId: null,
      number: 0,
    });
}
export function expireOffers(db, now = Date.now()) {
  for (const row of db.waitlist)
    if (row.status === "Offered" && Date.parse(row.expiresAt) <= now)
      row.status = "Expired";
}
const offered = (r, now) =>
  r.status === "Offered" && Date.parse(r.expiresAt) > now;
export function vacancies(db, programId, now = Date.now()) {
  const program = db.programs.find((p) => p.id === programId);
  return Math.max(
    0,
    (program?.capacity || 0) -
      db.enrollments.filter(
        (e) => e.programId === programId && e.status === "Active",
      ).length -
      db.waitlist.filter((r) => r.programId === programId && offered(r, now))
        .length,
  );
}
export function waitlistState(db, u, now = Date.now()) {
  return db.waitlist
    .filter(
      (r) =>
        isStaff(u) ||
        (u.role === "parent" &&
          db.players.some(
            (p) => p.id === r.playerId && p.familyId === u.familyId,
          )),
    )
    .map((r) => ({
      ...r,
      status: r.status === "Offered" && !offered(r, now) ? "Expired" : r.status,
      position:
        r.status === "Waiting"
          ? waiting(db, r.programId).findIndex((x) => x.id === r.id) + 1
          : null,
    }));
}
function waiting(db, programId) {
  return db.waitlist
    .filter((r) => r.programId === programId && r.status === "Waiting")
    .sort(
      (a, b) =>
        (a.queueOrder || 0) - (b.queueOrder || 0) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}
export function enrollmentGate(db, b, now = Date.now()) {
  const ownOffer = db.waitlist.find(
    (r) =>
      r.playerId === b.playerId &&
      r.programId === b.programId &&
      offered(r, now),
  );
  if (ownOffer) return;
  if (vacancies(db, b.programId, now) < 1)
    fail(
      "This program is full or its remaining spots are reserved. Join the waitlist.",
      409,
    );
  if (
    db.waitlist.some(
      (r) => r.programId === b.programId && r.status === "Waiting",
    )
  )
    fail("Available spots are being offered to the waitlist first.", 409);
}
export function waitlistAction(db, u, action, b) {
  if (!isStaff(u) && u.role !== "parent")
    fail("Parent or staff access required.", 403);
  if (action === "waitlist-join") {
    const p = player(db, u, b.playerId),
      program = db.programs.find((a) => a.id === b.programId);
    if (!program) fail("Program not found.", 404);
    if (
      db.enrollments.some(
        (e) =>
          e.playerId === p.id &&
          e.programId === program.id &&
          e.status === "Active",
      )
    )
      fail("This player is already registered.", 409);
    if (
      db.waitlist.some(
        (r) =>
          r.playerId === p.id &&
          r.programId === program.id &&
          ["Waiting", "Offered"].includes(r.status),
      )
    )
      fail("This player is already on the waitlist.", 409);
    if (
      vacancies(db, program.id) > 0 &&
      !db.waitlist.some(
        (r) => r.programId === program.id && r.status === "Waiting",
      )
    )
      fail("A spot is available. Register for this program instead.", 409);
    db.waitlist.push({
      id: id(),
      playerId: p.id,
      programId: program.id,
      status: "Waiting",
      queueOrder:
        db.waitlist.reduce((n, r) => Math.max(n, r.queueOrder || 0), 0) + 1,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const row = db.waitlist.find((r) => r.id === b.id);
  if (!row) fail("Waitlist entry not found.", 404);
  player(db, u, row.playerId);
  if (action === "waitlist-leave") {
    if (!["Waiting", "Offered"].includes(row.status))
      fail("This entry is no longer active.", 409);
    row.status = "Withdrawn";
    return;
  }
  if (!isStaff(u)) fail("Staff access required.", 403);
  if (row.status !== "Waiting") fail("Choose a waiting player.", 409);
  const first = waiting(db, row.programId)[0];
  if (first.id !== row.id)
    fail("Offer the first waiting player a spot first.", 409);
  if (vacancies(db, row.programId) < 1)
    fail("There is no unreserved spot available.", 409);
  Object.assign(row, {
    status: "Offered",
    offeredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 48 * 3600000).toISOString(),
  });
  const p = db.players.find((p) => p.id === row.playerId),
    program = db.programs.find((a) => a.id === row.programId);
  for (const recipient of db.users.filter(
    (user) => user.role === "parent" && user.familyId === p.familyId,
  ))
    db.notifications.unshift({
      id: id(),
      userId: recipient.id,
      title: "A program spot is available",
      text: `${program.name}: complete registration within 48 hours to accept your player's reserved spot.`,
      category: "changes",
      createdAt: new Date().toISOString(),
      read: false,
    });
}
