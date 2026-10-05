import { fail, id, text, integer, requireStaff, player } from "./domain.js";

export function eligibility(db, u, b, now = Date.now()) {
  const p = player(db, u, b.playerId);
  const program = db.programs.find((x) => x.id === b.programId);
  if (!program) fail("Program not found.", 404);
  const r = program.registration || {};
  if (program.registrationClosed || r.closed)
    fail("Registration is closed for this program.", 409);
  if (r.opensAt && now < Date.parse(r.opensAt))
    fail("Registration has not opened yet.", 409);
  if (r.closesAt && now >= Date.parse(r.closesAt))
    fail("The registration deadline has passed.", 409);
  if (
    (r.minAge != null && (!Number.isInteger(p.age) || p.age < r.minAge)) ||
    (r.maxAge != null && (!Number.isInteger(p.age) || p.age > r.maxAge))
  )
    fail("Player age does not meet this program’s eligibility rules.", 409);
  if (
    r.membersOnly &&
    db.families.find((f) => f.id === p.familyId)?.membership !== "Active"
  )
    fail("An active family membership is required.", 409);
}

export function registrationAction(db, u, action, b) {
  requireStaff(u);
  const program = db.programs.find((p) => p.id === b.id);
  if (!program) fail("Program not found.", 404);
  if (action === "registration-rules") {
    const minAge =
      b.minAge == null || b.minAge === "" ? null : integer(b.minAge, 2, 100);
    const maxAge =
      b.maxAge == null || b.maxAge === "" ? null : integer(b.maxAge, 2, 100);
    if (minAge != null && maxAge != null && minAge > maxAge)
      fail("Minimum age must not exceed maximum age.");
    const instant = (value) => {
      if (!value) return null;
      if (
        typeof value !== "string" ||
        !/(Z|[+-]\d\d:\d\d)$/.test(value) ||
        !Number.isFinite(Date.parse(value))
      )
        fail("Registration dates must include a time zone.");
      return new Date(value).toISOString();
    };
    const opensAt = instant(b.opensAt),
      closesAt = instant(b.closesAt);
    if (opensAt && closesAt && opensAt >= closesAt)
      fail("Registration must close after it opens.");
    if (typeof b.closed !== "boolean" || typeof b.membersOnly !== "boolean")
      fail("Choose registration options.");
    program.registration = {
      minAge,
      maxAge,
      opensAt,
      closesAt,
      closed: b.closed,
      membersOnly: b.membersOnly,
    };
    return;
  }
  const season = text(b.season, 60);
  if (
    db.programs.some((p) => p.copiedFrom === program.id && p.season === season)
  )
    fail("This program has already been copied to that season.", 409);
  if (b.confirm !== true) fail("Confirm the season copy.");
  const next = {
    ...structuredClone(program),
    id: id(),
    name: text(b.name, 100),
    season,
    copiedFrom: program.id,
    registrationClosed: false,
    registration: {
      ...program.registration,
      opensAt: null,
      closesAt: null,
      closed: true,
    },
    createdAt: new Date().toISOString(),
  };
  const form = db.forms.find((f) => f.id === program.formId);
  if (form) {
    const copy = {
      ...structuredClone(form),
      id: id(),
      programId: next.id,
      version: 1,
      createdAt: next.createdAt,
      authorId: u.id,
    };
    next.formId = copy.id;
    db.forms.push(copy);
  }
  db.programs.push(next);
  // Historical enrollments, invoices, waivers, schedules and waitlists stay with the old program.
  program.registrationClosed = true;
}
