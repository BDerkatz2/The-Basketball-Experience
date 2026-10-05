import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Stripe from "stripe";

test("HTTP journey: registration, signed test payment, coach assignment, parent results and safe upload retry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-journey-"));
  const secret = "whsec_journey_synthetic_only";
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: {
      ...process.env,
      PORT: "4183",
      APP_MODE: "demo",
      DATA_FILE: join(dir, "data.json"),
      UPLOAD_DIR: join(dir, "uploads"),
      MONGODB_URI: "",
      STRIPE_SECRET_KEY: "sk_test_synthetic_not_a_real_key",
      STRIPE_WEBHOOK_SECRET: secret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Startup timeout")), 15000);
      child.once("error", reject);
      child.once("exit", () => reject(Error("Server exited")));
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    async function req(path, body, token) {
      const r = await fetch("http://127.0.0.1:4183/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json(), headers: r.headers };
    }
    const parent = (await req("demo-session", { userId: "parent" })).data.token;
    const coach = (await req("demo-session", { userId: "coach" })).data.token;
    const admin = (await req("demo-session", { userId: "admin" })).data.token;
    assert.equal(
      (
        await req(
          "actions/enroll",
          {
            playerId: "p1",
            programId: "a3",
            accepted: false,
            signature: "Journey parent",
          },
          parent,
        )
      ).status,
      400,
    );
    const registration = {
      playerId: "p1",
      programId: "a3",
      accepted: true,
      signature: "Journey parent",
    };
    assert.equal(
      (await req("actions/enroll", registration, parent)).status,
      200,
    );
    assert.equal(
      (await req("actions/enroll", registration, parent)).status,
      409,
    );
    let state = (await req("state", null, parent)).data;
    const enrollment = state.enrollments.find(
      (e) => e.playerId === "p1" && e.programId === "a3",
    );
    const evidence = await req("export/waivers", null, parent);
    assert.equal(evidence.status, 200);
    assert.ok(
      evidence.data.records.every((w) => ["p1", "p2"].includes(w.playerId)),
    );
    assert.ok(
      evidence.data.records.some(
        (w) => w.playerId === "p1" && w.signature === "Journey parent",
      ),
    );
    assert.equal((await req("export/waivers", null, coach)).status, 403);
    const invoice = state.invoices.find((i) => i.sourceId === enrollment.id);
    assert.equal(invoice.status, "Unpaid");
    const event = {
      id: "evt_journey",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_journey",
          object: "checkout.session",
          mode: "payment",
          payment_status: "paid",
          amount_total: invoice.amountCents,
          currency: invoice.currency,
          metadata: { invoiceId: invoice.id, familyId: invoice.familyId },
        },
      },
    };
    const stripe = new Stripe("sk_test_synthetic_not_a_real_key");
    const payload = JSON.stringify(event);
    const pay = () =>
      fetch("http://127.0.0.1:4183/api/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": stripe.webhooks.generateTestHeaderString({
            payload,
            secret,
          }),
        },
        body: payload,
      });
    assert.equal((await pay()).status, 200);
    assert.equal((await pay()).status, 200);
    state = (await req("state", null, parent)).data;
    assert.equal(
      state.invoices.find((i) => i.id === invoice.id).status,
      "Paid (Stripe test)",
    );
    assert.equal(
      state.enrollments.find((e) => e.id === enrollment.id).paymentStatus,
      "Paid (Stripe test)",
    );
    assert.equal(
      (
        await req(
          "actions/training-plan-create",
          { name: "Journey training", drillIds: ["d1", "d3"] },
          parent,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "actions/training-plan-create",
          { name: "Journey training", drillIds: ["d1", "d3"] },
          coach,
        )
      ).status,
      200,
    );
    const plan = (await req("state", null, coach)).data.trainingPlans.find(
      (p) => p.name === "Journey training",
    );
    const assignment = {
      planId: plan.id,
      playerIds: ["p1"],
      start: "2027-03-01T18:00",
      timeZone: "America/Edmonton",
      count: 1,
    };
    assert.equal(
      (await req("actions/training-plan-assign", assignment, coach)).status,
      200,
    );
    assert.equal(
      (await req("actions/training-plan-assign", assignment, coach)).status,
      409,
    );
    state = (await req("state", null, parent)).data;
    const workouts = state.workouts.filter((w) => w.planId === plan.id);
    assert.equal(workouts.length, 2);
    for (const w of workouts)
      assert.equal(
        (
          await req(
            "actions/workout",
            { id: w.id, attempts: 10, made: 8, notes: "Journey complete" },
            parent,
          )
        ).status,
        200,
      );
    state = (await req("state", null, parent)).data;
    assert.equal(
      state.results.filter((r) => workouts.some((w) => w.id === r.workoutId))
        .length,
      2,
    );
    assert.equal((await req("reports/payments", null, parent)).status, 403);
    const report = await req("reports/payments", null, admin);
    assert.equal(report.status, 200);
    assert.ok(!report.data.rows.some((r) => r.includes(invoice.id)));
    assert.equal(
      (await req("state", null, parent)).headers.get("cache-control"),
      "no-store",
    );
    const bytes = Buffer.from([
      0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
    ]);
    async function upload(
      token,
      key = "journey-upload-1",
      body = bytes,
      team = "t1",
    ) {
      return fetch(
        "http://127.0.0.1:4183/api/files?purpose=video&name=journey.mp4&teamId=" +
          team,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/octet-stream",
            "X-Upload-Key": key,
          },
          body,
        },
      );
    }
    assert.equal((await upload(parent)).status, 403);
    const responses = await Promise.all([upload(coach), upload(coach)]);
    assert.ok(responses.every((r) => r.status === 200));
    const files = await Promise.all(responses.map((r) => r.json()));
    assert.equal(files[0].id, files[1].id);
    assert.equal(
      (
        await upload(
          coach,
          "journey-upload-1",
          Buffer.concat([bytes, Buffer.from("different")]),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await upload(
          coach,
          "journey-invalid-1",
          Buffer.from("<script>unsafe</script>"),
        )
      ).status,
      400,
    );
    const clip = { fileId: files[0].id, teamId: "t1", name: "Journey clip" };
    assert.equal((await req("actions/video-save", clip, coach)).status, 200);
    assert.equal((await req("actions/video-save", clip, coach)).status, 200);
    assert.equal(
      (await req("state", null, coach)).data.videos.filter(
        (v) => v.fileId === files[0].id,
      ).length,
      1,
    );
    const outside = (await req("demo-session", { userId: "player" })).data
      .token;
    // Parent/players cannot publish, even when they can view their team's clip.
    assert.equal((await req("actions/video-save", clip, outside)).status, 403);
  } finally {
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    if (child.exitCode === null) await exited;
    await rm(dir, { recursive: true, force: true });
  }
});
