import test from "node:test";
import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import { defineField, answerField } from "../server/form-fields.js";
import { weeklyStarts } from "../server/scheduling.js";
import { mountOperations } from "../server/operations-api.js";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    admin: db.users.find((u) => u.role === "admin"),
    parent: db.users.find((u) => u.role === "parent"),
    coach: db.users.find((u) => u.role === "coach"),
  };
};
test("rich fields validate choices, dates and number syntax; required/optional semantics remain intact", () => {
  const f = defineField(
    { label: "Option", type: "select", options: ["A", "B"], required: true },
    0,
  );
  assert.equal(answerField(f, "A"), "A");
  assert.throws(() => answerField(f, "C"), /available option/);
  assert.throws(() => answerField(f, ""), /Please answer/);
  assert.throws(
    () => defineField({ label: "Bad", type: "select", options: ["A", "A"] }, 0),
    /unique/,
  );
  assert.equal(answerField({ type: "number", label: "Count" }, "2.5"), "2.5");
  assert.throws(
    () => answerField({ type: "number", label: "Count" }, "Infinity"),
    /number/,
  );
  assert.throws(
    () => answerField({ type: "date", label: "Date" }, "2026-02-30"),
    /valid date/,
  );
  assert.throws(
    () => answerField({ type: "email", label: "Email" }, "missing-at"),
    /email/,
  );
  assert.throws(
    () => answerField({ type: "text", label: "Text" }, {}),
    /answer type/,
  );
  assert.equal(answerField({ type: "textarea", label: "Notes" }, ""), "");
});
test("waiver approval is version specific and signed answers remain immutable across new versions", () => {
  const { db, admin, parent } = setup();
  const form = {
    programId: "a3",
    title: "Registration",
    waiverText: "Sample terms pending organization review.",
    fields: [
      {
        label: "Level",
        type: "select",
        options: ["New", "Returning"],
        required: true,
      },
    ],
  };
  mutate(db, admin, "form-save", form);
  const f = db.forms.at(-1);
  assert.throws(
    () =>
      mutate(db, parent, "waiver-approve", {
        id: f.id,
        reference: "Unauthorized",
      }),
    /Administrator/,
  );
  mutate(db, admin, "waiver-approve", {
    id: f.id,
    reference: "TEST approval reference; not actual legal approval",
  });
  mutate(db, parent, "enroll", {
    programId: "a3",
    playerId: "p1",
    accepted: true,
    signature: "Demo Parent",
    formId: f.id,
    answers: { q0: "New" },
  });
  mutate(db, admin, "form-save", { ...form, waiverText: "New sample terms" });
  assert.equal(db.waivers.at(-1).answers.q0, "New");
  assert.equal(db.waivers.at(-1).formId, f.id);
  assert.equal(db.forms.at(-1).approval, undefined);
  assert.equal(visible(db, { ...parent, familyId: "f2" }).waivers.length, 0);
});
test("staff expiry metadata is private, resets approval and prevents approval until renewal/supersession", () => {
  const { db, admin, parent, coach } = setup();
  db.staffProfiles.push({ userId: coach.id, status: "Approved" });
  db.files.push({
    id: "doc",
    purpose: "staff",
    ownerId: coach.id,
    name: "Document",
  });
  assert.throws(
    () => mutate(db, parent, "staff-document", { id: "doc", title: "Bad" }),
    /access denied/,
  );
  mutate(db, coach, "staff-document", {
    id: "doc",
    title: "Coaching certificate",
    expiresOn: "2020-01-01",
  });
  assert.equal(db.staffProfiles[0].status, "Submitted");
  assert.throws(
    () =>
      mutate(db, admin, "staff-review", {
        userId: coach.id,
        status: "Approved",
      }),
    /expired/,
  );
  mutate(db, coach, "staff-document", {
    id: "doc",
    title: "Prior certificate",
    expiresOn: "2020-01-01",
    retired: true,
  });
  mutate(db, admin, "staff-review", {
    userId: coach.id,
    status: "Approved",
    reviewNote: "Replacement reviewed separately",
  });
  assert.equal(db.staffProfiles[0].status, "Approved");
  assert.equal(visible(db, parent).files.length, 0);
});
test("biweekly dates preserve wall time across DST; following-series changes are atomic and leave earlier history", () => {
  const dates = weeklyStarts({
    start: "2026-10-25T18:00",
    timeZone: "America/Edmonton",
    count: 3,
    intervalWeeks: 2,
  });
  assert.equal(dates[0], "2026-10-26T00:00:00.000Z");
  assert.equal(dates[1], "2026-11-09T01:00:00.000Z");
  const { db, admin } = setup();
  db.events = [];
  mutate(db, admin, "schedule", {
    teamId: "t1",
    title: "Practice",
    location: "Test gym",
    start: "2026-10-25T18:00",
    timeZone: "America/Edmonton",
    count: 3,
    intervalWeeks: 2,
    minutes: 60,
  });
  const first = db.events[0].start,
    anchor = db.events[1].id;
  mutate(db, admin, "series-reschedule", {
    id: anchor,
    shiftDays: 1,
    localTime: "19:00",
    confirm: true,
  });
  assert.equal(db.events[0].start, first);
  assert.equal(db.events[1].start, "2026-11-10T02:00:00.000Z");
  const before = JSON.stringify(db.events);
  db.events.push({
    ...db.events[1],
    id: "collision",
    seriesId: "other",
    start: "2026-11-11T02:00:00.000Z",
  });
  assert.throws(
    () =>
      mutate(db, admin, "series-reschedule", {
        id: anchor,
        shiftDays: 1,
        localTime: "19:00",
        confirm: true,
      }),
    /conflicts/,
  );
  assert.equal(JSON.stringify(db.events.slice(0, 3)), before);
});
test("private cloud playback preserves range headers and denies outsiders or deleted videos before provider access", async () => {
  const { db, parent } = setup(),
    routes = {},
    old = { ...process.env };
  Object.assign(process.env, {
    ENABLE_CLOUD_UPLOADS: "true",
    S3_BUCKET: "private-test",
    AWS_REGION: "ca-central-1",
  });
  db.files.push({
    id: "clip",
    purpose: "video",
    teamId: "t1",
    type: "video/mp4",
    cloudCopy: {
      status: "copied",
      bucket: "private-test",
      region: "ca-central-1",
      key: "private/videos/clip",
    },
  });
  db.videos.push({ id: "v", fileId: "clip", teamId: "t1" });
  let calls = 0,
    destroyed = false;
  mountOperations(
    { get: (p, f) => (routes[p] = f), post() {} },
    {
      getDb: () => db,
      cloudClientFactory: () => ({
        destroy() {
          destroyed = true;
        },
        async send(c) {
          calls++;
          assert.equal(c.input.Range, "bytes=0-3");
          return {
            Body: Readable.from([Buffer.from("test")]),
            ContentRange: "bytes 0-3/10",
            ContentLength: 4,
          };
        },
      }),
    },
  );
  class Response extends Writable {
    headers = {};
    chunks = [];
    _write(c, e, cb) {
      this.chunks.push(c);
      cb();
    }
    set(k, v) {
      this.headers[k] = v;
      return this;
    }
    status(v) {
      this.code = v;
      return this;
    }
  }
  try {
    const handler = routes["/api/media/:id/playback"],
      res = new Response();
    let error;
    await handler(
      { user: parent, params: { id: "clip" }, headers: { range: "bytes=0-3" } },
      res,
      (e) => {
        error = e;
      },
    );
    assert.equal(error, undefined);
    assert.equal(res.code, 206);
    assert.equal(Buffer.concat(res.chunks).toString(), "test");
    assert.equal(res.headers["Cache-Control"], "private, no-store");
    assert.equal(destroyed, true);
    await handler(
      {
        user: { ...parent, familyId: "unrelated" },
        params: { id: "clip" },
        headers: {},
      },
      new Response(),
      (e) => {
        error = e;
      },
    );
    assert.equal(error.status, 404);
    assert.equal(calls, 1);
    db.videos[0].deletedAt = new Date().toISOString();
    await handler(
      { user: parent, params: { id: "clip" }, headers: {} },
      new Response(),
      (e) => {
        error = e;
      },
    );
    assert.equal(error.status, 404);
    assert.equal(calls, 1);
  } finally {
    for (const k of ["ENABLE_CLOUD_UPLOADS", "S3_BUCKET", "AWS_REGION"])
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
  }
});
