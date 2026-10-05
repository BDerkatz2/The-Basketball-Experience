import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("API: authentication, concurrent inventory updates, persistence, and failed mutation rollback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-api-"));
  const dataFile = join(dir, "demo.json");
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: { ...process.env, PORT: "4178", DATA_FILE: dataFile },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Server startup timed out")),
        15000,
      );
      child.once("error", reject);
      child.once("exit", (code) => reject(new Error("Server exited " + code)));
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const req = async (path, body, token) => {
      const r = await fetch("http://127.0.0.1:4178/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await req("state")).status, 401);
    const {
      data: { token },
    } = await req("demo-session", { userId: "parent" });
    assert.equal(
      (
        await req(
          "actions/score",
          { id: "g1", homeScore: 1, awayScore: 2, status: "Final" },
          token,
        )
      ).status,
      403,
    );
    const body = {
      playerId: "p1",
      productId: "shirt",
      size: "M",
      quantity: 8,
      useCredits: true,
    };
    const responses = await Promise.all([
      req("actions/order", body, token),
      req("actions/order", body, token),
    ]);
    assert.deepEqual(responses.map((x) => x.status).sort(), [200, 409]);
    const { data: state } = await req("state", null, token);
    assert.equal(state.orders.length, 1);
    assert.equal(state.products[0].stock.M, 4);
    assert.equal(state.orders[0].free, 2);
    const disk = JSON.parse(await readFile(dataFile, "utf8"));
    assert.equal(disk.orders.length, 1);
    assert.equal(disk.products[0].stock.M, 4);
    const admin = (await req("demo-session", { userId: "admin" })).data.token;
    assert.equal(
      (
        await req(
          "actions/score",
          { id: "g1", homeScore: 15, awayScore: 12, status: "Invalid" },
          admin,
        )
      ).status,
      400,
    );
    assert.equal((await req("state", null, admin)).data.games[0].homeScore, 0);
    const coach = (await req("demo-session", { userId: "coach" })).data.token;
    const staff = (await req("demo-session", { userId: "staff" })).data.token;
    const upload = await fetch(
      "http://127.0.0.1:4178/api/files?purpose=staff&name=sample.pdf",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + coach,
          "Content-Type": "application/octet-stream",
        },
        body: Buffer.from("%PDF-1.7\nSample test data"),
      },
    );
    assert.equal(upload.status, 200);
    const file = await upload.json();
    assert.equal(
      (
        await fetch("http://127.0.0.1:4178/api/files/" + file.id, {
          headers: { Authorization: "Bearer " + staff },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch("http://127.0.0.1:4178/api/files/" + file.id, {
          headers: { Authorization: "Bearer " + admin },
        })
      ).status,
      200,
    );
    const invalid = await fetch(
      "http://127.0.0.1:4178/api/files?purpose=staff&name=bad.pdf",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + coach,
          "Content-Type": "application/octet-stream",
        },
        body: "<script>bad</script>",
      },
    );
    assert.equal(invalid.status, 400);
    await req(
      "actions/conversation-create",
      { kind: "group", name: "Attachment test", memberIds: ["coach"] },
      token,
    );
    const chat = (await req("state", null, token)).data.conversations.find(
      (c) => c.name === "Attachment test",
    );
    const uploadChat = async (auth, channel, body) =>
      fetch(
        "http://127.0.0.1:4178/api/files?" +
          new URLSearchParams({
            purpose: "message",
            channel,
            name: "practice.pdf",
          }),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + auth,
            "Content-Type": "application/octet-stream",
          },
          body,
        },
      );
    const getFile = async (auth, id) =>
      fetch("http://127.0.0.1:4178/api/files/" + id, {
        headers: { Authorization: "Bearer " + auth },
      });
    assert.equal(
      (await uploadChat(admin, chat.id, "%PDF-1.4 test")).status,
      403,
    );
    assert.equal((await uploadChat(token, chat.id, "not a pdf")).status, 400);
    const large = Buffer.alloc(10 * 1024 * 1024 + 1);
    large.write("%PDF-");
    assert.equal((await uploadChat(token, chat.id, large)).status, 400);
    const attachmentResponse = await uploadChat(
      token,
      chat.id,
      "%PDF-1.4 test attachment",
    );
    assert.equal(attachmentResponse.status, 200);
    const attachment = await attachmentResponse.json();
    assert.equal((await getFile(coach, attachment.id)).status, 404);
    assert.equal(
      (
        await req(
          "actions/message",
          {
            channel: "t1",
            text: "Wrong scope",
            attachmentIds: [attachment.id],
          },
          token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "actions/message",
          { channel: chat.id, text: "", attachmentIds: [attachment.id] },
          coach,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "actions/message",
          { channel: chat.id, text: "", attachmentIds: [attachment.id] },
          token,
        )
      ).status,
      200,
    );
    const download = await getFile(coach, attachment.id);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert.equal(await download.text(), "%PDF-1.4 test attachment");
    assert.equal((await getFile(admin, attachment.id)).status, 404);
    await req("actions/conversation-leave", { channel: chat.id }, coach);
    assert.equal((await getFile(coach, attachment.id)).status, 404);
    const controller = new AbortController();
    const preferences = {
      inApp: true,
      email: false,
      push: false,
      sessions: true,
      workouts: false,
      changes: true,
      payments: true,
    };
    assert.equal(
      (await req("actions/notification-preferences", preferences, token))
        .status,
      200,
    );
    const preferenceState = (await req("state", null, token)).data;
    assert.equal(preferenceState.notificationPreferences.workouts, false);
    assert.equal(preferenceState.notificationPreferences.userId, "parent");
    assert.equal(preferenceState.deliveryQueue.length, 0);
    const stream = await fetch("http://127.0.0.1:4178/api/stream", {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /ready/,
    );
    await req(
      "actions/rsvp",
      { eventId: "s1", playerId: "p1", status: "Going" },
      token,
    );
    assert.match(
      new TextDecoder().decode((await reader.read()).value),
      /changed/,
    );
    controller.abort();
    assert.equal(
      (
        await fetch("http://127.0.0.1:4178/api/export/orders", {
          headers: { Authorization: "Bearer " + token },
        })
      ).status,
      403,
    );
    const calendar = await fetch("http://127.0.0.1:4178/api/export/calendar", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.match(await calendar.text(), /BEGIN:VCALENDAR/);
    assert.equal((await req("reports/payments", null, token)).status, 403);
    assert.equal((await req("reports/inventory", null, admin)).status, 200);
    assert.equal(
      (
        await req(
          "actions/family-profile",
          {
            name: "Test family",
            email: "contact@example.test",
            phone: "306-555-0100",
          },
          token,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          "actions/family-player",
          { id: "p3", name: "Blocked", age: 12 },
          token,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "actions/program",
          {
            name: "Waitlist test",
            type: "Skill Development",
            ages: "2–16",
            price: 0,
            capacity: 1,
            description: "Synthetic test",
            location: "Test court",
            sessions: 1,
          },
          admin,
        )
      ).status,
      200,
    );
    const programId = (await req("state", null, admin)).data.programs.at(-1).id;
    const enroll = (playerId) => ({
      programId,
      playerId,
      accepted: true,
      signature: "Synthetic test acknowledgement",
    });
    assert.equal(
      (await req("actions/enroll", enroll("p3"), admin)).status,
      200,
    );
    for (const playerId of ["p1", "p2"])
      assert.equal(
        (await req("actions/waitlist-join", { programId, playerId }, token))
          .status,
        200,
      );
    let waitState = (await req("state", null, admin)).data;
    const occupied = waitState.enrollments.find(
      (e) => e.programId === programId,
    );
    assert.equal(
      (await req("actions/enrollment-cancel", { id: occupied.id }, admin))
        .status,
      200,
    );
    const first = waitState.waitlist.find(
      (r) => r.playerId === "p1" && r.programId === programId,
    );
    const offers = await Promise.all([
      req("actions/waitlist-offer", { id: first.id }, admin),
      req("actions/waitlist-offer", { id: first.id }, admin),
    ]);
    assert.deepEqual(offers.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (await req("actions/enroll", enroll("p2"), token)).status,
      409,
    );
    assert.equal(
      (await req("actions/enroll", enroll("p1"), token)).status,
      200,
    );
    waitState = (await req("state", null, admin)).data;
    assert.equal(
      waitState.enrollments.filter(
        (e) => e.programId === programId && e.status === "Active",
      ).length,
      1,
    );
    assert.equal(
      waitState.waitlist.find((r) => r.id === first.id).status,
      "Enrolled",
    );
    await req("logout", {}, token);
    assert.equal((await req("state", null, token)).status, 401);
  } finally {
    child.kill();
    await new Promise((r) => child.once("close", r));
    await rm(dir, { recursive: true, force: true });
  }
});
