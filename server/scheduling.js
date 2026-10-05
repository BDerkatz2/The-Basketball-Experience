import { DateTime, Info } from "luxon";
import { createHash } from "node:crypto";
import { fail, integer, text, isStaff } from "./domain.js";

function zone(value = "UTC") {
  if (!Info.isValidIANAZone(value))
    fail("Enter a valid IANA time zone, such as America/Edmonton.");
  return value;
}
function local(value, timeZone) {
  const d = DateTime.fromISO(value, { zone: timeZone });
  if (
    !d.isValid ||
    d.toFormat("yyyy-MM-dd'T'HH:mm") !== value ||
    d.getPossibleOffsets().length !== 1
  )
    fail(
      "This local time is invalid or ambiguous because of a clock change. Choose another time.",
    );
  return d;
}
export function weeklyStarts(b) {
  const timeZone = zone(b.timeZone),
    count = integer(b.count, 1, 20),
    interval = integer(b.intervalWeeks ?? 1, 1, 12);
  const start = /(?:Z|[+-]\d\d:\d\d)$/.test(b.start || "")
    ? DateTime.fromISO(b.start, { zone: timeZone })
    : local(b.start, timeZone);
  if (!start.isValid) fail("Choose a valid start time.");
  const excluded = b.excludeDates ?? [];
  if (
    !Array.isArray(excluded) ||
    excluded.length > 20 ||
    excluded.some(
      (d) => typeof d !== "string" || DateTime.fromISO(d).toISODate() !== d,
    )
  )
    fail("Use valid skipped dates (YYYY-MM-DD).");
  const result = Array.from({ length: count }, (_, i) =>
    local(
      start.plus({ weeks: i * interval }).toISODate() +
        "T" +
        start.toFormat("HH:mm"),
      timeZone,
    )
      .toUTC()
      .toISO(),
  ).filter(
    (s) =>
      !excluded.includes(DateTime.fromISO(s).setZone(timeZone).toISODate()),
  );
  if (!result.length)
    fail("At least one session must remain after skipped dates.");
  return result;
}

// Bounded, deterministic suggestions. Every candidate is checked against existing
// bookings and the proposed plan; this is not an external AI service.
export function suggestSchedule(db, u, b, conflicts) {
  if (!isStaff(u)) fail("Staff access required.", 403);
  if (
    !Array.isArray(b.teamIds) ||
    b.teamIds.length < 2 ||
    b.teamIds.length > 12 ||
    new Set(b.teamIds).size !== b.teamIds.length
  )
    fail("Choose 2–12 different teams.");
  const teams = b.teamIds.map((id) => db.teams.find((t) => t.id === id));
  if (teams.some((t) => !t) || new Set(teams.map((t) => t.division)).size !== 1)
    fail("Choose teams from one division.");
  const timeZone = zone(b.timeZone),
    location = text(b.location, 120);
  const minutes = integer(b.minutes, 15, 180),
    days = integer(b.days, 1, 42);
  const slots = integer(b.slots, 1, 8),
    gap = integer(b.gap, 0, 120);
  const start = local(b.start, timeZone);
  const weekdays = b.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
  if (
    !Array.isArray(weekdays) ||
    !weekdays.length ||
    weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)
  )
    fail("Choose allowed weekdays.");
  const dates = (values) => {
    if (
      !Array.isArray(values) ||
      values.length > 100 ||
      values.some(
        (d) => typeof d !== "string" || DateTime.fromISO(d).toISODate() !== d,
      )
    )
      fail("Use valid blackout dates (YYYY-MM-DD).");
    return values;
  };
  const blackoutDates = dates(b.blackoutDates ?? []);
  const teamBlackouts = b.teamBlackouts ?? {};
  if (
    !teamBlackouts ||
    typeof teamBlackouts !== "object" ||
    Array.isArray(teamBlackouts)
  )
    fail("Invalid team availability.");
  for (const [teamId, blocked] of Object.entries(teamBlackouts)) {
    if (!b.teamIds.includes(teamId))
      fail("Availability must belong to selected teams.");
    dates(blocked);
  }
  const maxGamesPerDay = integer(b.maxGamesPerDay ?? 1, 1, 4);
  const rounds = integer(b.rounds ?? 1, 1, 2);
  const restHours = integer(b.restHours ?? 0, 0, 168);
  const courts = b.courts ?? [location];
  if (!Array.isArray(courts) || !courts.length || courts.length > 8)
    fail("Choose 1–8 courts.");
  const locations = courts.map((c) => text(c, 120));
  if (new Set(locations.map((c) => c.toLowerCase())).size !== locations.length)
    fail("Court names must be unique.");
  if (
    start.hour * 60 + start.minute + slots * minutes + (slots - 1) * gap >
    1440
  )
    fail("Daily slots must finish before midnight.");
  const pairs = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) pairs.push([teams[i], teams[j]]);
  if (rounds === 2) pairs.push(...pairs.map(([a, b]) => [b, a]));
  const games = [],
    pending = [...pairs];
  for (let day = 0; day < days && pending.length; day++) {
    const date = start.plus({ days: day });
    if (
      !weekdays.includes(date.weekday) ||
      blackoutDates.includes(date.toISODate())
    )
      continue;
    const base = local(
      start.plus({ days: day }).toISODate() + "T" + start.toFormat("HH:mm"),
      timeZone,
    );
    for (let slot = 0; slot < slots && pending.length; slot++) {
      const at = base.plus({ minutes: slot * (minutes + gap) });
      for (const location of locations) {
        for (let i = 0; i < pending.length; i++) {
          const [home, away] = pending[i],
            ids = [home.id, away.id];
          if (
            ids.some((id) => (teamBlackouts[id] || []).includes(at.toISODate()))
          )
            continue;
          const all = [...db.events, ...games];
          if (
            ids.some(
              (id) =>
                all.filter(
                  (e) =>
                    e.status !== "Cancelled" &&
                    [e.teamId, e.opponentId].includes(id) &&
                    DateTime.fromISO(e.start).setZone(timeZone).toISODate() ===
                      at.toISODate(),
                ).length >= maxGamesPerDay,
            )
          )
            continue;
          if (
            all.some(
              (e) =>
                e.status !== "Cancelled" &&
                [e.teamId, e.opponentId].some((t) => ids.includes(t)) &&
                at.toMillis() <
                  Date.parse(e.start) +
                    e.minutes * 60000 +
                    restHours * 3600000 &&
                at.toMillis() + minutes * 60000 + restHours * 3600000 >
                  Date.parse(e.start),
            )
          )
            continue;
          const candidate = {
            title: `${home.name} vs ${away.name}`,
            teamId: home.id,
            opponentId: away.id,
            start: at.toUTC().toISO(),
            minutes,
            location,
            address: location,
            timeZone,
            kind: "Game",
            status: "Scheduled",
            playerIds: db.players
              .filter((p) => ids.includes(p.teamId))
              .map((p) => p.id),
          };
          if (conflicts({ ...db, events: all }, candidate).length) continue;
          games.push(candidate);
          pending.splice(i, 1);
          break;
        }
      }
    }
  }
  const complete = pending.length === 0;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(games))
    .digest("hex");
  return {
    games,
    complete,
    fingerprint,
    unscheduled: pending.map(([a, b]) => `${a.name} vs ${b.name}`),
    explanation: `${rounds} round robin round(s), maximum ${maxGamesPerDay} sessions per team per day. Weekdays, blackout dates, rest, courts, coaches and players are checked. This is a greedy preview; try a different window if incomplete.`,
  };
}

export function rescheduleSeries(db, u, b, conflicts) {
  if (!isStaff(u)) fail("Staff access required.", 403);
  if (b.confirm !== true) fail("Confirm changing this and following sessions.");
  const anchor = db.events.find((e) => e.id === b.id);
  if (!anchor?.seriesId) fail("Choose a recurring session.", 404);
  const shift = integer(b.shiftDays, -365, 365),
    time = text(b.localTime, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("Use local time HH:mm.");
  const targets = db.events.filter(
    (e) =>
      e.seriesId === anchor.seriesId &&
      e.start >= anchor.start &&
      e.status !== "Cancelled",
  );
  const proposals = targets.map((e) => ({
    ...e,
    start: local(
      DateTime.fromISO(e.start)
        .setZone(e.timeZone || "UTC")
        .plus({ days: shift })
        .toISODate() +
        "T" +
        time,
      zone(e.timeZone),
    )
      .toUTC()
      .toISO(),
  }));
  const changed = new Set(targets.map((e) => e.id)),
    existing = db.events.filter((e) => !changed.has(e.id));
  for (const e of proposals)
    if (
      conflicts(
        {
          ...db,
          events: [...existing, ...proposals.filter((p) => p.id !== e.id)],
        },
        e,
      ).length
    )
      fail("A following session conflicts; nothing changed.", 409);
  return proposals;
}
