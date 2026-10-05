export function dayKey(value) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function filterSessions(
  events,
  { player = "all", query = "", showCancelled = false } = {},
) {
  const term = query.trim().toLocaleLowerCase();
  return events
    .filter(
      (e) =>
        (showCancelled || e.status !== "Cancelled") &&
        (player === "all" || e.playerIds.includes(player)) &&
        (!term ||
          `${e.title} ${e.location}`.toLocaleLowerCase().includes(term)),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
export function fromDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number),
    date = new Date(y, m - 1, d, 12);
  return dayKey(date) === value ? date : null;
}
export function daysFor(anchor, view) {
  const first = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    view === "month" ? 1 : anchor.getDate(),
    12,
  );
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from(
    { length: view === "month" ? 42 : 7 },
    (_, i) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12),
  );
}
export function moveCalendar(anchor, view, direction) {
  if (view === "week")
    return new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + 7 * direction,
      12,
    );
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1, 12);
}
export function eventsOnDay(events, day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()),
    end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events
    .filter((e) => {
      const at = Date.parse(e.start),
        until = at + e.minutes * 60000;
      return at < +end && until > +start;
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}
