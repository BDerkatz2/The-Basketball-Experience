import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSessions,
  dayKey,
  fromDay,
  daysFor,
  moveCalendar,
  eventsOnDay,
} from "../src/calendar-utils.mjs";
test('mobile calendar filters by player, search and cancellation without changing source records',()=>{
  const events=[{id:'later',title:'Shooting',location:'Court A',playerIds:['p1'],status:'Scheduled',start:'2027-01-02T18:00:00Z'},{id:'cancelled',title:'Practice',location:'Court A',playerIds:['p1'],status:'Cancelled',start:'2027-01-01T18:00:00Z'},{id:'other',title:'Practice',location:'Court B',playerIds:['p2'],status:'Scheduled',start:'2027-01-01T18:00:00Z'}];
  assert.deepEqual(filterSessions(events,{player:'p1',query:' court a '}).map(e=>e.id),['later']);
  assert.deepEqual(filterSessions(events,{player:'p1',showCancelled:true}).map(e=>e.id),['cancelled','later']);
  assert.equal(filterSessions(events,{query:'missing'}).length,0);
  assert.equal(events[0].id,'later');
});
test("month navigation cannot skip February from a January 31 selection", () => {
  const jan = fromDay("2028-01-31");
  assert.equal(dayKey(moveCalendar(jan, "month", 1)), "2028-02-01");
  assert.equal(
    dayKey(moveCalendar(fromDay("2028-01-01"), "month", -1)),
    "2027-12-01",
  );
  assert.equal(fromDay("2027-02-29"), null);
  assert.equal(dayKey(fromDay("2028-02-29")), "2028-02-29");
});
test("calendar ranges use Monday-first complete weeks across month/year and DST boundaries", () => {
  for (const date of ["2027-01-01", "2027-03-14", "2027-11-07", "2028-02-29"]) {
    const d = fromDay(date),
      month = daysFor(d, "month"),
      week = daysFor(d, "week");
    assert.equal(month.length, 42);
    assert.equal(week.length, 7);
    assert.equal(month[0].getDay(), 1);
    assert.equal(week[0].getDay(), 1);
    assert.equal(new Set(month.map(dayKey)).size, 42);
    assert.ok(week.some((x) => dayKey(x) === date));
  }
  assert.equal(
    dayKey(moveCalendar(fromDay("2027-03-10"), "week", 1)),
    "2027-03-17",
  );
});
test("day events include overnight overlap but exclude exact midnight endings from next day", () => {
  const day = fromDay("2027-05-12"),
    start = new Date(2027, 4, 11, 23, 30).toISOString();
  const events = [
    { id: "overnight", start, minutes: 90 },
    { id: "midnight-end", start, minutes: 30 },
    { id: "late", start: new Date(2027, 4, 12, 20).toISOString(), minutes: 60 },
  ];
  assert.deepEqual(
    eventsOnDay(events, day).map((e) => e.id),
    ["overnight", "late"],
  );
});
