import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import {
  cleanupCandidates,
  applyRefund,
  progress,
} from "../server/operations.js";
import { processPaymentEvent } from "../server/billing.js";
import { mountOperations } from "../server/operations-api.js";
import { backup, restore } from "../scripts/backup.mjs";
function setup() {
  const db = upgrade(seed());
  return {
    db,
    admin: db.users.find((u) => u.role === "admin"),
    parent: db.users.find((u) => u.role === "parent"),
    coach: db.users.find((u) => u.role === "coach"),
  };
}
function invoice(db) {
  db.invoices.push({
    id: "inv",
    familyId: "f1",
    status: "Paid (Stripe test)",
    paymentIntent: "pi_test",
    amountCents: 5000,
    currency: "cad",
    sourceType: "enroll",
  });
}
test("refund requests reserve balance, restrict roles, and reconcile matched partial refunds idempotently", () => {
  const { db, admin, parent } = setup();
  invoice(db);
  const b = {
    invoiceId: "inv",
    amountCents: 3000,
    reason: "Partial cancellation",
  };
  assert.throws(() => mutate(db, parent, "refund-request", b), /Staff/);
  mutate(db, admin, "refund-request", b);
  assert.throws(() => mutate(db, admin, "refund-request", b), /balance/);
  const r = db.refunds[0];
  mutate(db, admin, "refund-review", { id: r.id, status: "approved" });
  const event = {
    id: "re_test",
    status: "succeeded",
    amount: 3000,
    currency: "cad",
    payment_intent: "pi_test",
    metadata: { requestId: r.id },
  };
  assert.throws(() => applyRefund(db, { ...event, amount: 1 }), /match/);
  applyRefund(db, event);
  applyRefund(db, event);
  assert.equal(db.invoices[0].refundedCents, 3000);
  assert.equal(r.status, "succeeded");
  mutate(db, admin, "refund-request", { ...b, amountCents: 2000 });
  assert.throws(
    () => mutate(db, admin, "refund-request", { ...b, amountCents: 1 }),
    /balance/,
  );
  assert.equal(visible(db, parent).refunds.length, 2);
  assert.equal(
    visible(db, { role: "parent", id: "other", familyId: "f2" }).refunds.length,
    0,
  );
});
test("failed checkout events are deduplicated, ignore stale sessions and cannot downgrade paid invoices", () => {
  const { db } = setup();
  invoice(db);
  const i = db.invoices[0];
  i.status = "Unpaid";
  i.checkoutSessionId = "cs_current";
  const e = {
    id: "evt_failure",
    type: "checkout.session.async_payment_failed",
    data: {
      object: {
        id: "cs_current",
        metadata: { invoiceId: "inv", familyId: "f1" },
      },
    },
  };
  processPaymentEvent(db, e);
  processPaymentEvent(db, e);
  assert.equal(i.failureCount, 1);
  assert.equal(i.recoveryStatus, "Payment failed");
  processPaymentEvent(db, {
    ...e,
    id: "evt_old",
    data: { object: { ...e.data.object, id: "cs_old" } },
  });
  assert.equal(i.failureCount, 1);
  i.status = "Paid (Stripe test)";
  processPaymentEvent(db, { ...e, id: "evt_late" });
  assert.equal(i.status, "Paid (Stripe test)");
  assert.equal(i.failureCount, 1);
});
test("video deletion revokes reads, grace protects restores, purge eligibility excludes live references and staff files", () => {
  const { db, admin, parent } = setup();
  const old = new Date(Date.now() - 9 * 86400000).toISOString();
  db.files.push({ id: "clip", purpose: "video", teamId: "t1", createdAt: old });
  db.videos.push({
    id: "v",
    fileId: "clip",
    name: "Training",
    teamId: "t1",
    tags: [],
  });
  assert.throws(() => mutate(db, parent, "video-delete", { id: "v" }), /Coach/);
  mutate(db, admin, "video-delete", { id: "v" });
  assert.equal(visible(db, parent).videos.length, 0);
  assert.ok(!visible(db, parent).files.some((f) => f.id === "clip"));
  assert.equal(cleanupCandidates(db).length, 0);
  mutate(db, admin, "video-restore", { id: "v" });
  assert.equal(visible(db, parent).videos.length, 1);
  mutate(db, admin, "video-delete", { id: "v" });
  db.videos[0].deletedAt = old;
  assert.equal(cleanupCandidates(db).length, 1);
  db.files[0].purgedAt = old;
  assert.throws(
    () => mutate(db, admin, "video-restore", { id: "v" }),
    /purged/,
  );
});
test("moderation discloses only reported evidence; owner removal revokes group access and owner departure transfers control", () => {
  const { db, admin, parent, coach } = setup();
  mutate(db, parent, "conversation-create", {
    kind: "group",
    name: "Test group",
    memberIds: [coach.id],
  });
  const c = db.conversations[0];
  mutate(db, parent, "message", { channel: c.id, text: "Reported sample" });
  const m = db.messages.at(-1);
  assert.throws(
    () =>
      mutate(db, admin, "message-report", {
        messageId: m.id,
        reason: "Not a participant",
      }),
    /access/,
  );
  mutate(db, coach, "message-report", {
    messageId: m.id,
    reason: "Needs review",
  });
  assert.ok(!visible(db, admin).messages.some((x) => x.id === m.id));
  assert.equal(
    visible(db, admin).messageReports[0].evidence,
    "Reported sample",
  );
  assert.throws(
    () =>
      mutate(db, parent, "message-review", {
        id: db.messageReports[0].id,
        status: "removed",
        note: "Review",
      }),
    /Staff/,
  );
  mutate(db, admin, "message-review", {
    id: db.messageReports[0].id,
    status: "removed",
    note: "Removed after review",
  });
  assert.equal(m.text, "");
  assert.equal(m.moderated, true);
  mutate(db, parent, "group-remove", { channel: c.id, userId: coach.id });
  assert.ok(!visible(db, coach).conversations.some((x) => x.id === c.id));
  mutate(db, parent, "conversation-create", {
    kind: "group",
    name: "Transfer",
    memberIds: [coach.id],
  });
  const second = db.conversations.at(-1);
  mutate(db, parent, "conversation-leave", { channel: second.id });
  assert.equal(second.ownerId, coach.id);
});
test("progress uses weighted shooting totals, excludes cancellations and scopes coaching feedback", () => {
  const { db, parent, coach } = setup();
  db.workouts = [];
  db.results = [];
  db.workouts.push(
    { id: "w", playerId: "p1", completed: true },
    {
      id: "cancelled",
      playerId: "p1",
      completed: false,
      cancelledAt: new Date().toISOString(),
    },
  );
  for (const [made, attempts] of [
    [1, 2],
    [8, 10],
  ])
    db.results.push({
      playerId: "p1",
      made,
      attempts,
      createdAt: "2026-09-28T12:00:00Z",
    });
  const p = progress(db, parent).find((p) => p.playerId === "p1");
  assert.equal(p.assigned, 1);
  assert.equal(p.completed, 1);
  assert.equal(p.weeks[0].made, 9);
  assert.equal(p.weeks[0].attempts, 12);
  mutate(db, coach, "training-feedback", {
    playerId: "p1",
    text: "Keep your follow-through",
  });
  assert.equal(visible(db, parent).coachingFeedback.length, 1);
  assert.throws(
    () =>
      mutate(db, parent, "training-feedback", {
        playerId: "p1",
        text: "Impersonate coach",
      }),
    /Coach/,
  );
});
test("encrypted backup round trip preserves files, revokes sessions and refuses wrong passwords or overwrite", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-backup-"));
  try {
    const { db } = setup();
    db.files = [{ id: "test-file" }];
    db.authSessions = [{ id: "session" }];
    db.refunds = [{ id: "r", status: "sending" }];
    await mkdir(join(dir, "uploads"));
    await writeFile(join(dir, "uploads", "test-file"), "private media");
    await writeFile(join(dir, "data.json"), JSON.stringify(db));
    const dest = join(dir, "backup.tbe"),
      password = "test-password-at-least-16";
    await backup(join(dir, "data.json"), dest, password);
    assert.ok(!(await readFile(dest)).includes(Buffer.from("private media")));
    await assert.rejects(
      restore(dest, join(dir, "wrong"), "wrong-password-long-enough"),
    );
    await restore(dest, join(dir, "restored"), password);
    const restored = JSON.parse(
      await readFile(join(dir, "restored", "restored.json"), "utf8"),
    );
    assert.equal(restored.authSessions.length, 0);
    assert.equal(restored.refunds[0].status, "unknown");
    assert.equal(
      await readFile(join(dir, "restored", "uploads", "test-file"), "utf8"),
      "private media",
    );
    await assert.rejects(
      restore(dest, join(dir, "restored"), password),
      /exist/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("refund API persists uncertainty before retry and only reconciles matching provider objects", async () => {
  const { db, admin } = setup();
  invoice(db);
  mutate(db, admin, "refund-request", {
    invoiceId: "inv",
    amountCents: 1000,
    reason: "Test",
  });
  const r = db.refunds[0];
  mutate(db, admin, "refund-review", { id: r.id, status: "approved" });
  let current = db,
    calls = 0;
  const routes = {};
  mountOperations(
    { get: (p, f) => (routes[p] = f), post: (p, f) => (routes[p] = f) },
    {
      getDb: () => current,
      commit: async (d) => {
        current = structuredClone(d);
      },
      serialize: async (fn) => fn(),
      stripe: {
        refunds: {
          create: async () => {
            calls++;
            throw Error("Lost response");
          },
          retrieve: async () => ({
            id: "re_test",
            metadata: { requestId: r.id },
            payment_intent: "pi_test",
            amount: 1000,
            currency: "cad",
            status: "succeeded",
          }),
        },
      },
      uploadDir: tmpdir(),
      store: { kind: "file" },
    },
  );
  const req = {
    user: admin,
    params: { id: r.id },
    body: { providerId: "re_test" },
  };
  await assert.rejects(routes["/api/refunds/:id/submit"](req), /uncertain/);
  assert.equal(current.refunds[0].status, "unknown");
  await assert.rejects(routes["/api/refunds/:id/submit"](req), /approved/);
  assert.equal(calls, 1);
  await routes["/api/refunds/:id/reconcile"](req);
  assert.equal(current.refunds[0].status, "succeeded");
});

test("private cloud copy checks access blocks, persists destination and cleanup removes only expired video files", async () => {
  const { db, admin, parent } = setup();
  const dir = await mkdtemp(join(tmpdir(), "tbe-cloud-"));
  const previous = Object.fromEntries(
    ["ENABLE_CLOUD_UPLOADS", "S3_BUCKET", "AWS_REGION"].map((k) => [
      k,
      process.env[k],
    ]),
  );
  Object.assign(process.env, {
    ENABLE_CLOUD_UPLOADS: "true",
    S3_BUCKET: "test-private-bucket",
    AWS_REGION: "ca-central-1",
  });
  try {
    const old = new Date(Date.now() - 9 * 86400000).toISOString();
    db.files.push({
      id: "file-test",
      name: "Clip",
      purpose: "video",
      teamId: "t1",
      createdAt: old,
      size: 4,
      type: "video/mp4",
    });
    db.videos.push({
      id: "v",
      fileId: "file-test",
      name: "Clip",
      teamId: "t1",
      tags: [],
    });
    await writeFile(join(dir, "file-test"), "clip");
    let current = db,
      blocked = false;
    const commands = [],
      routes = {};
    mountOperations(
      { get: (p, f) => (routes[p] = f), post: (p, f) => (routes[p] = f) },
      {
        getDb: () => current,
        commit: async (d) => {
          current = structuredClone(d);
        },
        serialize: async (fn) => fn(),
        stripe: null,
        uploadDir: dir,
        store: { kind: "file" },
        cloudClientFactory: () => ({
          destroy() {},
          async send(command) {
            commands.push(command.constructor.name);
            if (command.constructor.name === "GetPublicAccessBlockCommand")
              return {
                PublicAccessBlockConfiguration: {
                  BlockPublicAcls: !blocked,
                  IgnorePublicAcls: true,
                  BlockPublicPolicy: true,
                  RestrictPublicBuckets: true,
                },
              };
            if (command.input.Body) {
              let content = "";
              for await (const chunk of command.input.Body) content += chunk;
              assert.equal(content, "clip");
              assert.equal(command.input.ServerSideEncryption, "AES256");
            }
            return {};
          },
        }),
      },
    );
    await assert.rejects(
      routes["/api/media/:id/cloud"]({
        user: parent,
        params: { id: "file-test" },
      }),
      /Administrator/,
    );
    blocked = true;
    await assert.rejects(
      routes["/api/media/:id/cloud"]({
        user: admin,
        params: { id: "file-test" },
      }),
      /public-access/,
    );
    assert.ok(!commands.includes("PutObjectCommand"));
    blocked = false;
    await routes["/api/media/:id/cloud"]({
      user: admin,
      params: { id: "file-test" },
    });
    assert.equal(current.files[0].cloudCopy.status, "copied");
    await routes["/api/media/cleanup"]({
      user: admin,
      body: { confirm: true },
    });
    assert.equal(await readFile(join(dir, "file-test"), "utf8"), "clip");
    current.videos[0].deletedAt = old;
    const result = await routes["/api/media/cleanup"]({
      user: admin,
      body: { confirm: true },
    });
    assert.equal(result.removed, 1);
    assert.ok(commands.includes("DeleteObjectCommand"));
    assert.ok(current.files[0].bytesRemovedAt);
    await assert.rejects(readFile(join(dir, "file-test")), /ENOENT/);
  } finally {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rm(dir, { recursive: true, force: true });
  }
});
