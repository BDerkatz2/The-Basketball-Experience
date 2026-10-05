import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { seed } from "../server/seed.js";
import { upgrade } from "../server/extended.js";
test("HTTP Stripe webhook verifies signatures, test mode, invoice totals and duplicate delivery without contacting Stripe", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-stripe-")),
    path = join(dir, "data.json"),
    secret = "whsec_synthetic_test_only";
  const db = upgrade(seed());
  db.invoices.push({
    id: "invoice-test",
    familyId: "f1",
    amountCents: 2500,
    currency: "cad",
    status: "Unpaid",
    sourceType: "order",
    sourceId: "none",
  });
  await writeFile(path, JSON.stringify(db));
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: {
      ...process.env,
      APP_MODE: "demo",
      PORT: "4180",
      DATA_FILE: path,
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
      child.once("exit", () => reject(Error("Unexpected exit")));
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const stripe = new Stripe("sk_test_synthetic_not_a_real_key");
    const event = {
      id: "evt_test",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          object: "checkout.session",
          id: "cs_test",
          mode: "payment",
          payment_status: "paid",
          amount_total: 2500,
          currency: "cad",
          metadata: { invoiceId: "invoice-test", familyId: "f1" },
        },
      },
    };
    async function send(e, invalid = false) {
      const payload = JSON.stringify(e);
      return fetch("http://127.0.0.1:4180/api/stripe/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": invalid
            ? "invalid"
            : stripe.webhooks.generateTestHeaderString({ payload, secret }),
        },
        body: payload,
      });
    }
    assert.equal((await send(event, true)).status, 400);
    assert.equal((await send({ ...event, livemode: true })).status, 400);
    const mismatch = structuredClone(event);
    mismatch.data.object.amount_total = 1;
    assert.equal((await send(mismatch)).status, 409);
    assert.equal(
      JSON.parse(await readFile(path, "utf8")).invoices[0].status,
      "Unpaid",
    );
    assert.equal((await send(event)).status, 200);
    assert.equal((await send(event)).status, 200);
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.equal(saved.invoices[0].status, "Paid (Stripe test)");
    assert.equal(
      saved.paymentEvents.filter((e) => e.id === event.id).length,
      1,
    );
  } finally {
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      child.kill();
    });
    await rm(dir, { recursive: true, force: true });
  }
});
