import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Stripe from "stripe";
test("HTTP carts serialize competing reservations and checkout retries; signed payment covers every line", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-cart-")),
    secret = "whsec_synthetic_cart_only";
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: {
      ...process.env,
      PORT: "4189",
      APP_MODE: "demo",
      DATA_FILE: join(dir, "data.json"),
      MONGODB_URI: "",
      STRIPE_SECRET_KEY: "sk_test_synthetic_cart_only",
      STRIPE_WEBHOOK_SECRET: secret,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((yes, no) => {
      const t = setTimeout(() => no(Error("Startup timeout")), 15000);
      child.once("error", (e) => {
        clearTimeout(t);
        no(e);
      });
      child.once("exit", () => {
        clearTimeout(t);
        no(Error("Server exited"));
      });
      child.stdout.on("data", (b) => {
        if (String(b).includes("http://")) {
          clearTimeout(t);
          yes();
        }
      });
    });
    async function req(path, body, token) {
      const r = await fetch("http://127.0.0.1:4189/api/" + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, data: await r.json() };
    }
    const parent = (await req("demo-session", { userId: "parent" })).data.token,
      admin = (await req("demo-session", { userId: "admin" })).data.token;
    let state = (await req("state", null, parent)).data;
    const p = state.products[0];
    assert.equal(
      (
        await req(
          "actions/variant-save",
          { productId: p.id, color: "Limited test", stock: 1 },
          admin,
        )
      ).status,
      200,
    );
    state = (await req("state", null, parent)).data;
    const variant = state.products[0].variants.find(
      (v) => v.color === "Limited test",
    );
    const line = {
      productId: p.id,
      variantId: variant.id,
      size: p.sizes[0],
      playerId: "p1",
      quantity: 1,
      useCredits: false,
    };
    const reserved = await Promise.all([
      req("actions/cart-reserve", { lines: [line] }, parent),
      req("actions/cart-reserve", { lines: [line] }, admin),
    ]);
    assert.deepEqual(reserved.map((r) => r.status).sort(), [200, 409]);
    const winner = reserved[0].status === 200 ? parent : admin;
    state = (await req("state", null, winner)).data;
    const c = state.carts.find((c) => c.status === "Reserved");
    const results = await Promise.all([
      req("actions/cart-checkout", { id: c.id }, winner),
      req("actions/cart-checkout", { id: c.id }, winner),
    ]);
    assert.ok(results.every((r) => r.status === 200));
    state = (await req("state", null, winner)).data;
    assert.equal(state.orders.filter((o) => o.cartId === c.id).length, 1);
    assert.equal(
      state.products[0].variants.find((v) => v.id === variant.id).stock[
        line.size
      ],
      0,
    );
    const invoice = state.invoices.find((i) => i.sourceId === c.id);
    const payload = JSON.stringify({
      id: "evt_cart_http",
      type: "checkout.session.completed",
      livemode: false,
      data: {
        object: {
          id: "cs_synthetic_cart",
          payment_status: "paid",
          payment_intent: "pi_synthetic_cart",
          amount_total: invoice.amountCents,
          currency: "cad",
          metadata: { invoiceId: invoice.id, familyId: invoice.familyId },
        },
      },
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret,
    });
    const response = await fetch("http://127.0.0.1:4189/api/stripe/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Stripe-Signature": signature,
      },
      body: payload,
    });
    assert.equal(response.status, 200);
    state = (await req("state", null, winner)).data;
    assert.equal(
      state.orders.find((o) => o.cartId === c.id).paymentStatus,
      "Paid (Stripe test)",
    );
    assert.equal(
      (await req("actions/cart-cancel", { id: c.id }, admin)).status,
      409,
    );
  } finally {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    if (child.exitCode === null) await exited;
    assert.ok(
      resolve(dir).startsWith(resolve(tmpdir()) + "\\") ||
        resolve(dir).startsWith(resolve(tmpdir()) + "/"),
    );
    await rm(dir, { recursive: true, force: true });
  }
});
