import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, visible, mutate, conflicts } from "../server/extended.js";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    parent: db.users.find((u) => u.id === "parent"),
    admin: db.users.find((u) => u.id === "admin"),
    coach: db.users.find((u) => u.id === "coach"),
    staff: db.users.find((u) => u.id === "staff"),
  };
};
// Match the API's copy-on-write transaction boundary in domain tests.
const change = (db, u, a, b) => {
  const next = structuredClone(db);
  mutate(next, u, a, b);
  Object.assign(db, next);
};
test("three-team bracket gives a bye and advances winners to champion", () => {
  const { db, admin } = setup();
  change(db, admin, "bracket-create", {
    name: "U14 playoffs",
    teamIds: ["t1", "t3", "t4"],
  });
  const b = db.brackets[0],
    r = b.rounds[0].map((id) => db.games.find((g) => g.id === id));
  assert.equal(r[0].status, "Bye");
  const semi = r[1];
  change(db, admin, "score", {
    id: semi.id,
    homeScore: 60,
    awayScore: 50,
    status: "Final",
  });
  const final = db.games.find((g) => g.id === b.rounds[1][0]);
  assert.equal(final.homeId, "t1");
  assert.equal(final.awayId, "t3");
  change(db, admin, "score", {
    id: final.id,
    homeScore: 70,
    awayScore: 60,
    status: "Final",
  });
  assert.equal(db.brackets[0].championId, "t1");
});
test("bracket rejects duplicate teams, mixed divisions, ties and unresolved scoring", () => {
  const { db, admin } = setup();
  for (const ids of [
    ["t1", "t1"],
    ["t1", "t2"],
  ])
    assert.throws(() =>
      change(db, admin, "bracket-create", { name: "Bad", teamIds: ids }),
    );
  change(db, admin, "bracket-create", {
    name: "Cup",
    teamIds: ["t1", "t3", "t4"],
  });
  const b = db.brackets[0],
    semi = db.games.find((g) => g.id === b.rounds[0][1]),
    final = db.games.find((g) => g.id === b.rounds[1][0]);
  assert.throws(
    () =>
      change(db, admin, "score", {
        id: final.id,
        homeScore: 1,
        awayScore: 2,
        status: "Final",
      }),
    /advance/,
  );
  assert.throws(
    () =>
      change(db, admin, "score", {
        id: semi.id,
        homeScore: 20,
        awayScore: 20,
        status: "Final",
      }),
    /tied/,
  );
});
test("changing an upstream winner cannot silently overwrite a started final", () => {
  const { db, admin } = setup();
  change(db, admin, "bracket-create", {
    name: "Cup",
    teamIds: ["t1", "t3", "t4"],
  });
  const b = db.brackets[0],
    semi = b.rounds[0][1],
    final = b.rounds[1][0];
  change(db, admin, "score", {
    id: semi,
    homeScore: 4,
    awayScore: 2,
    status: "Final",
  });
  change(db, admin, "score", {
    id: final,
    homeScore: 2,
    awayScore: 1,
    status: "Live",
  });
  assert.throws(
    () =>
      change(db, admin, "score", {
        id: semi,
        homeScore: 2,
        awayScore: 4,
        status: "Final",
      }),
    /later round/,
  );
  assert.equal(db.games.find((g) => g.id === semi).homeScore, 4);
});
test("game stat rows enforce team membership and replace rather than duplicate", () => {
  const { db, admin, parent } = setup();
  const b = {
    gameId: "g1",
    playerId: "p1",
    points: 12,
    rebounds: 3,
    assists: 2,
    steals: 1,
    blocks: 0,
    fouls: 2,
  };
  assert.throws(() => change(db, parent, "game-stats", b), /Staff/);
  assert.throws(
    () => change(db, admin, "game-stats", { ...b, playerId: "p2" }),
    /participating/,
  );
  change(db, admin, "game-stats", b);
  change(db, admin, "game-stats", { ...b, points: 14 });
  assert.equal(db.gameStats.length, 1);
  assert.equal(db.gameStats[0].points, 14);
});
test("schedule checks shared coach, skips cancelled sessions, and sends scoped notices", () => {
  const { db, admin, parent } = setup();
  const old = db.events[0];
  const b = {
    title: "Shared coach conflict",
    teamId: "t2",
    start: old.start,
    minutes: 60,
    count: 1,
    location: "Different gym",
  };
  assert.throws(() => change(db, admin, "schedule", b), /coach/);
  change(db, admin, "session-cancel", { id: old.id });
  change(db, admin, "schedule", b);
  assert.equal(db.events.at(-1)?.status !== undefined, true);
  assert.ok(visible(db, parent).notifications.length > 0);
  assert.throws(
    () =>
      change(db, parent, "rsvp", {
        eventId: old.id,
        playerId: "p1",
        status: "Going",
      }),
    /cancelled/,
  );
});
test("session edit is atomic when coach conflict is detected", () => {
  const { db, admin } = setup();
  const first = db.events[0],
    second = db.events[1],
    copy = structuredClone(second);
  assert.throws(
    () =>
      change(db, admin, "session-edit", {
        ...second,
        start: first.start,
        location: "Other gym",
      }),
    /conflicts/,
  );
  assert.deepEqual(db.events[1], copy);
});
test("cancelled registration releases capacity and permits a fresh registration", () => {
  const { db, parent } = setup();
  change(db, parent, "enrollment-cancel", { id: "e1" });
  assert.equal(db.events[0].playerIds.includes("p1"), false);
  change(db, parent, "enroll", {
    playerId: "p1",
    programId: "a1",
    accepted: true,
    signature: "Jordan Morgan",
  });
  assert.equal(
    db.enrollments.filter((e) => e.programId === "a1" && e.status === "Active")
      .length,
    1,
  );
  assert.equal(db.events[0].playerIds.includes("p1"), true);
});
test("cancelled order restores stock and credits exactly once", () => {
  const { db, parent, admin } = setup();
  change(db, parent, "order", {
    playerId: "p1",
    productId: "shirt",
    size: "M",
    quantity: 2,
    useCredits: true,
  });
  const order = db.orders[0];
  change(db, admin, "order-cancel", { id: order.id });
  assert.equal(db.products[0].stock.M, 12);
  assert.equal(
    db.credits.reduce((n, c) => n + c.quantity, 0),
    0,
  );
  assert.throws(
    () => change(db, admin, "order-cancel", { id: order.id }),
    /unfulfilled/,
  );
  assert.throws(
    () => change(db, admin, "fulfill", { id: order.id }),
    /Cancelled/,
  );
});
test("playbook and video mutations are team-scoped and validate annotations", () => {
  const { db, coach, parent } = setup();
  const frames = [Array.from({ length: 5 }, () => ({ x: 50, y: 50 }))];
  assert.throws(
    () =>
      change(db, parent, "play-save", { name: "Play", teamId: "t1", frames }),
    /Coach/,
  );
  assert.throws(
    () =>
      change(db, coach, "play-save", { name: "Play", teamId: "t3", frames }),
    /denied/,
  );
  change(db, coach, "play-save", { name: "Play", teamId: "t1", frames });
  assert.equal(db.plays.length, 1);
  assert.throws(
    () =>
      change(db, coach, "video-save", {
        name: "Clip",
        teamId: "t1",
        url: "javascript:alert(1)",
      }),
    /HTTPS/,
  );
  change(db, coach, "video-save", {
    name: "Clip",
    teamId: "t1",
    url: "https://example.test/clip.mp4",
  });
  const v = db.videos[0];
  assert.throws(
    () =>
      change(db, coach, "video-tag", {
        id: v.id,
        seconds: 3,
        label: "Bad",
        lines: [[0, 0, 110, 10]],
      }),
    /outside/,
  );
  change(db, coach, "video-tag", {
    id: v.id,
    seconds: 3,
    label: "Cut here",
    lines: [[10, 10, 50, 50]],
  });
  assert.equal(db.videos[0].tags.length, 1);
});
test("staff profile and file metadata are private to owner and admin", () => {
  const { db, coach, staff, admin, parent } = setup();
  change(db, coach, "staff-profile", {
    phone: "555-0100",
    emergencyContact: "Sample contact",
    availability: "Tuesdays",
  });
  db.files.push({ id: "private", purpose: "staff", ownerId: coach.id });
  assert.equal(visible(db, parent).staffProfiles.length, 0);
  assert.equal(visible(db, staff).files.length, 0);
  assert.equal(visible(db, admin).files.length, 1);
  assert.equal(visible(db, coach).files.length, 1);
  assert.throws(
    () =>
      change(db, staff, "staff-review", {
        userId: coach.id,
        status: "Approved",
      }),
    /Administrator/,
  );
  change(db, admin, "staff-review", { userId: coach.id, status: "Approved" });
  assert.equal(db.staffProfiles[0].status, "Approved");
});
test("audit is only visible to staff and rejected mutations add no entry", () => {
  const { db, parent, admin } = setup();
  assert.throws(() =>
    change(db, parent, "team-save", { name: "x", coach: "y", division: "U14" }),
  );
  assert.equal(db.audit.length, 0);
  change(db, parent, "rsvp", {
    eventId: "s1",
    playerId: "p1",
    status: "Going",
  });
  assert.equal(visible(db, parent).audit.length, 0);
  assert.equal(visible(db, admin).audit.length, 1);
});
