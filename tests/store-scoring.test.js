import { report } from "../server/reports.js";
import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import {
  availableStock,
  expireCarts,
  creditBalance,
} from "../server/storefront.js";
import { clockSeconds } from "../server/scorekeeper.js";
import { processPaymentEvent } from "../server/billing.js";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    parent: db.users.find((u) => u.role === "parent"),
    admin: db.users.find((u) => u.role === "admin"),
    coach: db.users.find((u) => u.role === "coach"),
  };
};
const line = (db, extra = {}) => ({
  productId: db.products[0].id,
  variantId: "default",
  size: db.products[0].sizes[0],
  quantity: 1,
  playerId: "p1",
  useCredits: true,
  ...extra,
});
// Match production's clone-then-commit transaction boundary.
const change = (db, u, a, b) => {
  const next = structuredClone(db);
  mutate(next, u, a, b);
  Object.keys(db).forEach((k) => delete db[k]);
  Object.assign(db, next);
};
test("reservation is private, reduces availability, blocks legacy orders and releases on expiry", () => {
  const { db, parent, admin } = setup(),
    l = line(db);
  db.products[0].stock[l.size] = 1;
  change(db, parent, "cart-reserve", { lines: [l] });
  assert.equal(availableStock(db, l.productId, l.variantId, l.size), 0);
  assert.throws(() => change(db, admin, "order", l), /reserved/);
  const outsider = { ...parent, id: "outsider", familyId: "f2" };
  assert.equal(visible(db, outsider).carts.length, 0);
  assert.throws(
    () => change(db, outsider, "cart-checkout", { id: db.carts[0].id }),
    /access denied/,
  );
  db.carts[0].expiresAt = new Date(Date.now() - 1).toISOString();
  assert.equal(availableStock(db, l.productId, l.variantId, l.size), 1);
  expireCarts(db);
  assert.equal(db.carts[0].status, "Expired");
  assert.throws(
    () => change(db, parent, "cart-checkout", { id: db.carts[0].id }),
    /expired/,
  );
});
test("cart validates aggregate quantities and family atomically; colors have independent stock", () => {
  const { db, parent, admin } = setup(),
    l = line(db);
  db.products[0].stock[l.size] = 1;
  assert.throws(
    () => change(db, parent, "cart-reserve", { lines: [l, l] }),
    /inventory/,
  );
  assert.equal(db.carts.length, 0);
  change(db, admin, "variant-save", {
    productId: l.productId,
    color: "Gold",
    stock: 3,
  });
  const v = db.products[0].variants[1];
  assert.ok(
    report(db, admin, "inventory").rows.some(
      (row) => row[1] === "Gold" && row[3] === 3,
    ),
  );
  assert.throws(
    () =>
      change(db, parent, "variant-save", {
        productId: l.productId,
        color: "Red",
        stock: 2,
      }),
    /Staff/,
  );
  change(db, parent, "cart-reserve", {
    lines: [l, { ...l, variantId: v.id, quantity: 2 }],
  });
  assert.equal(availableStock(db, l.productId, v.id, l.size), 1);
  assert.equal(db.products[0].stock[l.size], 1);
  change(db, parent, "cart-release", { id: db.carts[0].id });
  assert.equal(availableStock(db, l.productId, l.variantId, l.size), 1);
  assert.throws(
    () =>
      change(db, admin, "cart-reserve", {
        lines: [l, { ...l, playerId: "p3" }],
      }),
    /family/,
  );
});
test("multi-item cart uses adjusted credits once and one invoice updates every order from signed-event processing", () => {
  const { db, parent, admin } = setup(),
    l = line(db),
    year = new Date().getFullYear();
  change(db, admin, "credit-adjust", {
    playerId: "p1",
    year,
    quantity: 1,
    reason: "Club grant",
  });
  assert.equal(creditBalance(db, "p1"), 3);
  change(db, parent, "cart-reserve", {
    lines: [
      { ...l, quantity: 2 },
      { ...l, quantity: 2 },
    ],
  });
  const c = db.carts[0];
  change(db, parent, "cart-checkout", { id: c.id });
  const count = db.orders.length,
    invoice = db.invoices[0];
  assert.equal(
    db.orders.reduce((n, o) => n + o.free, 0),
    3,
  );
  assert.equal(invoice.amountCents, db.products[0].price * 100);
  change(db, parent, "cart-checkout", { id: c.id });
  assert.equal(db.orders.length, count);
  assert.equal(db.invoices.length, 1);
  assert.throws(
    () =>
      change(db, admin, "credit-adjust", {
        playerId: "p1",
        year,
        quantity: -1,
        reason: "Too late",
      }),
    /already used/,
  );
  processPaymentEvent(db, {
    id: "evt_cart",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_cart",
        payment_status: "paid",
        payment_intent: "pi_cart",
        amount_total: invoice.amountCents,
        currency: "cad",
        metadata: { invoiceId: invoice.id, familyId: invoice.familyId },
      },
    },
  });
  assert.ok(db.orders.every((o) => o.paymentStatus === "Paid (Stripe test)"));
  assert.throws(
    () => change(db, admin, "cart-cancel", { id: c.id }),
    /Reconcile/,
  );
});
test("unpaid whole-cart cancellation restores all inventory and credits once", () => {
  const { db, parent, admin } = setup(),
    l = line(db),
    before = db.products[0].stock[l.size];
  change(db, parent, "cart-reserve", { lines: [l, l] });
  const id = db.carts[0].id;
  change(db, parent, "cart-checkout", { id });
  assert.equal(db.products[0].stock[l.size], before - 2);
  assert.throws(
    () => change(db, admin, "order-cancel", { id: db.orders[0].id }),
    /reconciled together/,
  );
  change(db, admin, "cart-cancel", { id });
  assert.equal(db.products[0].stock[l.size], before);
  assert.equal(creditBalance(db, "p1"), 2);
  assert.equal(db.invoices[0].status, "Voided");
  assert.throws(() => change(db, admin, "cart-cancel", { id }), /not found/);
});
test("ten-player routes validate coordinates and preserve team access", () => {
  const { db, coach, parent } = setup(),
    frames = [
      Array.from({ length: 10 }, (_, i) => ({ x: i * 9, y: 20 })),
      Array.from({ length: 10 }, (_, i) => ({ x: i * 9, y: 40 })),
    ];
  change(db, coach, "play-save", {
    name: "Defense",
    teamId: "t1",
    frames,
    routes: [{ frame: 0, player: 5, kind: "cut", x: 20, y: 40 }],
  });
  assert.equal(db.plays.at(-1).frames[0].length, 10);
  assert.equal(db.plays.at(-1).routes.length, 1);
  assert.throws(
    () =>
      change(db, parent, "play-save", { name: "Bad", teamId: "t1", frames }),
    /Coach/,
  );
  assert.throws(
    () =>
      change(db, coach, "play-save", {
        name: "Bad",
        teamId: "t1",
        frames,
        routes: [{ frame: 2, player: 10, kind: "cut", x: 20, y: 40 }],
      }),
    /whole number/,
  );
  assert.throws(
    () =>
      change(db, coach, "play-save", {
        name: "Bad",
        teamId: "t1",
        frames: [frames[0], frames[1].slice(0, 5)],
      }),
    /consistently/,
  );
});
test("score controls prevent stale writes, limit negative scores, persist clock and pause finals", () => {
  const { db, admin, parent } = setup();
  const send = (command, b = {}) =>
    change(db, admin, "game-control", {
      id: "g1",
      version: db.games[0].controlVersion || 0,
      command,
      ...b,
    });
  assert.throws(
    () =>
      change(db, parent, "game-control", {
        id: "g1",
        version: 0,
        command: "start",
      }),
    /Staff/,
  );
  send("set-clock", { seconds: 60, period: 2 });
  send("start");
  const g = db.games[0];
  assert.equal(clockSeconds(g, Date.parse(g.clock.runningSince) + 15000), 45);
  assert.throws(
    () =>
      change(db, admin, "game-control", {
        id: "g1",
        version: 0,
        command: "points",
        side: "home",
        delta: 3,
      }),
    /changed/,
  );
  send("points", { side: "home", delta: 3 });
  send("possession", { side: "home" });
  send("foul", { side: "away", delta: 1 });
  send("timeout", { side: "home", delta: 1 });
  assert.equal(db.games[0].homeScore, 3);
  assert.equal(db.games[0].teamFouls.away, 1);
  assert.throws(
    () => send("points", { side: "away", delta: -1 }),
    /whole number/,
  );
  change(db, admin, "score", {
    id: "g1",
    homeScore: 3,
    awayScore: 0,
    status: "Final",
  });
  assert.equal(db.games[0].clock.runningSince, null);
  assert.throws(() => send("start"), /Reopen/);
});
