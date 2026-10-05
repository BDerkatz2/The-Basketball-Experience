import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, conflicts, visible } from "../server/extended.js";
import { suggestSchedule } from "../server/scheduling.js";
import { assistSchedule } from "../server/schedule-ai.js";
import {
  serviceStatus,
  registerDevice,
  sendDelivery,
  pushReceipt,
} from "../server/live-services.js";
import { importDriveVideo } from "../server/drive.js";
import { processReminders } from "../server/reminders.js";
const req = {
  teamIds: ["t1", "t3", "t4"],
  start: "2027-01-04T18:00",
  timeZone: "America/Edmonton",
  location: "Court A",
  minutes: 60,
  days: 28,
  slots: 3,
  gap: 15,
};
const fixture = () => {
  const db = upgrade(seed());
  return [db, db.users.find((u) => u.role === "admin")];
};
test("advanced scheduling respects weekdays, global and team blackouts, and minimum rest", () => {
  const [db, admin] = fixture();
  const plan = suggestSchedule(
    db,
    admin,
    {
      ...req,
      weekdays: [6, 7],
      blackoutDates: ["2027-01-09"],
      teamBlackouts: { t1: ["2027-01-10"] },
      restHours: 48,
    },
    conflicts,
  );
  assert.equal(plan.complete, true);
  for (const g of plan.games) {
    const date = new Date(Date.parse(g.start) - 7 * 3600000);
    assert.ok([0, 6].includes(date.getUTCDay()));
    assert.notEqual(date.toISOString().slice(0, 10), "2027-01-09");
    if ([g.teamId, g.opponentId].includes("t1"))
      assert.notEqual(date.toISOString().slice(0, 10), "2027-01-10");
    for (const other of plan.games.filter(
      (x) =>
        x !== g &&
        [x.teamId, x.opponentId].some((id) =>
          [g.teamId, g.opponentId].includes(id),
        ),
    ))
      assert.ok(
        Math.abs(Date.parse(other.start) - Date.parse(g.start)) >= 49 * 3600000,
      );
  }
});
test("planner uses alternate courts and rejects malformed availability", () => {
  const [db, admin] = fixture();
  db.events.push({
    id: "booking",
    start: "2027-01-05T01:00:00.000Z",
    minutes: 180,
    location: "Court A",
    playerIds: [],
  });
  const plan = suggestSchedule(
    db,
    admin,
    { ...req, courts: ["Court A", "Court B"] },
    conflicts,
  );
  assert.equal(plan.games[0].location, "Court B");
  for (const extra of [
    { weekdays: [] },
    { weekdays: [8] },
    { blackoutDates: ["2027-02-30"] },
    { teamBlackouts: { unknown: [] } },
    { courts: ["Court A", "court a"] },
    { restHours: -1 },
  ])
    assert.throws(() =>
      suggestSchedule(db, admin, { ...req, ...extra }, conflicts),
    );
});
test("AI calls the provider with date settings only and locally validates its draft", async () => {
  const [db, admin] = fixture();
  const before = JSON.stringify(db);
  let payload;
  const result = await assistSchedule(
    db,
    admin,
    { ...req, instructions: "Weekends only" },
    conflicts,
    { OPENAI_API_KEY: "fake", OPENAI_SCHEDULING_MODEL: "configured-model" },
    async (url, opts) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      payload = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    weekdays: [6, 7],
                    blackoutDates: [],
                    restHours: 12,
                    explanation: "Weekends only.",
                  }),
                },
              ],
            },
          ],
        }),
      };
    },
  );
  assert.equal(payload.store, false);
  assert.equal(payload.model, "configured-model");
  assert.ok(!payload.input.includes("teamIds"));
  assert.equal(JSON.stringify(db), before);
  assert.deepEqual(result.request.weekdays, [6, 7]);
  assert.ok(result.games.length);
});
test("AI failures cannot mutate the calendar or fall back to fabricated output", async () => {
  const [db, admin] = fixture();
  const before = JSON.stringify(db);
  await assert.rejects(
    assistSchedule(db, admin, { ...req, instructions: "Help" }, conflicts, {}),
    /not connected/,
  );
  await assert.rejects(
    assistSchedule(db, { role: "parent" }, req, conflicts, {}),
    /Staff/,
  );
  await assert.rejects(
    assistSchedule(
      db,
      admin,
      { ...req, instructions: "Help" },
      conflicts,
      { OPENAI_API_KEY: "fake", OPENAI_SCHEDULING_MODEL: "model" },
      async () => ({ ok: true, json: async () => ({ status: "incomplete" }) }),
    ),
    /could not finish/,
  );
  assert.equal(JSON.stringify(db), before);
});
const env = {
  APP_MODE: "accounts",
  ENABLE_EXTERNAL_DELIVERY: "true",
  RESEND_API_KEY: "fake",
  EMAIL_FROM: "Club <club@example.test>",
  EXPO_ACCESS_TOKEN: "fake",
};
test("external delivery is disabled by default and absent credentials remain explicit", async () => {
  assert.equal(serviceStatus({}).externalDeliveryEnabled, false);
  await assert.rejects(sendDelivery({}, {}, {}, null, {}), /disabled/);
  await assert.rejects(
    sendDelivery({ channel: "push" }, {}, {}, null, env),
    /registration/,
  );
});
test("email uses stable idempotency and only reports provider acceptance", async () => {
  const result = await sendDelivery(
    { id: "job1", channel: "email" },
    { email: "parent@example.test" },
    { title: "Session", text: "Reminder" },
    null,
    env,
    async (url, opts) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(opts.headers["Idempotency-Key"], "tbe-job1");
      assert.deepEqual(JSON.parse(opts.body).to, ["parent@example.test"]);
      return { ok: true, json: async () => ({ id: "email1" }) };
    },
  );
  assert.equal(result.status, "provider-accepted");
});
test("phone registration transfers shared devices and keeps tokens out of visible state", () => {
  const [db, admin] = fixture();
  const token = "ExpoPushToken[abcdefghijklmno]";
  registerDevice(db, admin, token);
  registerDevice(db, { id: "parent" }, token);
  assert.deepEqual(
    db.pushDevices.map((d) => d.userId),
    ["parent"],
  );
  assert.equal(visible(db, admin).pushDevices, undefined);
  assert.throws(() => registerDevice(db, admin, "https://bad.test"), /Invalid/);
});
test("push payload conceals family details and receipt errors revoke invalid devices", async () => {
  const result = await sendDelivery(
    { id: "j", channel: "push" },
    {},
    { id: "n", title: "Private name", text: "Private info" },
    { token: "ExpoPushToken[abcdefghijklmno]" },
    env,
    async (url, opts) => {
      assert.ok(!opts.body.includes("Private"));
      return {
        ok: true,
        json: async () => ({ data: { status: "ok", id: "receipt" } }),
      };
    },
  );
  assert.equal(result.providerId, "receipt");
  const receipt = await pushReceipt("receipt", env, async () => ({
    ok: true,
    json: async () => ({
      data: {
        receipt: { status: "error", details: { error: "DeviceNotRegistered" } },
      },
    }),
  }));
  assert.equal(receipt.invalidDevice, true);
});
test("uncertain and accepted deliveries are never automatically requeued", () => {
  const [db] = fixture();
  db.deliveryQueue = [
    "sending",
    "unknown",
    "provider-accepted",
    "push-service-confirmed",
  ].map((status) => ({ id: status, status, userId: "gone" }));
  processReminders(db);
  assert.deepEqual(
    db.deliveryQueue.map((j) => j.status),
    ["sending", "unknown", "provider-accepted", "push-service-confirmed"],
  );
});
const driveEnv = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "fake",
  GOOGLE_REFRESH_TOKEN: "fake",
  GOOGLE_DRIVE_FOLDER_ID: "folder",
};
test("Drive import checks folder scope before downloading and rejects unconfigured access", async () => {
  await assert.rejects(importDriveVideo("abcdefghijk", {}), /not configured/);
  let calls = 0;
  await assert.rejects(
    importDriveVideo("abcdefghijk", driveEnv, async () => ({
      ok: true,
      json: async () =>
        ++calls === 1
          ? { access_token: "fake" }
          : { parents: ["other"], capabilities: { canDownload: true } },
    })),
    /connected club folder/,
  );
  assert.equal(calls, 2);
});
test("Drive download uses fixed Google endpoints and validates video bytes", async () => {
  const bytes = Buffer.from("0000ftypisomvideo");
  let calls = 0;
  const file = await importDriveVideo(
    "abcdefghijk",
    driveEnv,
    async (url, opts) => {
      assert.equal(opts.redirect, "error");
      assert.ok(
        url.startsWith("https://oauth2.googleapis.com/") ||
          url.startsWith("https://www.googleapis.com/drive/"),
      );
      calls++;
      if (calls === 1)
        return { ok: true, json: async () => ({ access_token: "fake" }) };
      if (calls === 2)
        return {
          ok: true,
          json: async () => ({
            name: "Clip",
            parents: ["folder"],
            mimeType: "video/mp4",
            size: bytes.length,
            capabilities: { canDownload: true },
          }),
        };
      return {
        ok: true,
        body: (async function* () {
          yield bytes;
        })(),
      };
    },
  );
  assert.equal(file.type, "video/mp4");
  assert.deepEqual(file.bytes, bytes);
});
