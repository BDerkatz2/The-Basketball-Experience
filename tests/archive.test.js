import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    admin: db.users.find((u) => u.role === "admin"),
    parent: db.users.find((u) => u.role === "parent"),
    coach: db.users.find((u) => u.role === "coach"),
  };
};
const line = (db) => ({
  productId: db.products[0].id,
  variantId: "default",
  size: db.products[0].sizes[0],
  quantity: 1,
  playerId: "p1",
  useCredits: false,
});
test("product archive releases reservations, rejects stale shopping and restores without changing inventory", () => {
  const { db, admin, parent, coach } = setup(),
    l = line(db),
    p = db.products[0];
  const stock = structuredClone(p.stock);
  for (const u of [parent, coach])
    assert.throws(
      () => mutate(db, u, "product-archive", { id: p.id }),
      /Staff/,
    );
  mutate(db, parent, "cart-reserve", { lines: [l] });
  const cart = db.carts.at(-1);
  mutate(db, admin, "product-archive", { id: p.id });
  const when = p.archivedAt;
  assert.ok(when);
  assert.equal(cart.status, "Released");
  assert.match(cart.releaseReason, /archived/);
  assert.deepEqual(p.stock, stock);
  assert.throws(
    () => mutate(db, parent, "cart-checkout", { id: cart.id }),
    /released/,
  );
  assert.throws(
    () => mutate(db, parent, "cart-reserve", { lines: [l] }),
    /archived/,
  );
  assert.throws(() => mutate(db, parent, "order", l), /archived/);
  mutate(db, admin, "product-archive", { id: p.id });
  assert.equal(p.archivedAt, when);
  mutate(db, admin, "product-restore", { id: p.id });
  assert.equal(p.archivedAt, null);
  assert.equal(cart.status, "Released");
  mutate(db, parent, "cart-reserve", { lines: [l] });
  assert.equal(db.carts.at(-1).status, "Reserved");
  assert.ok(
    db.audit.some((a) => a.action === "product-restore" && a.targetId === p.id),
  );
});
test("archiving retains ordered carts, invoices and historical product references", () => {
  const { db, admin, parent } = setup(),
    l = line(db);
  mutate(db, parent, "cart-reserve", { lines: [l] });
  const cart = db.carts.at(-1);
  mutate(db, parent, "cart-checkout", { id: cart.id });
  const before = structuredClone({
    orders: db.orders,
    invoices: db.invoices,
    credits: db.credits,
    cart,
  });
  mutate(db, admin, "product-archive", { id: l.productId });
  assert.deepEqual(
    { orders: db.orders, invoices: db.invoices, credits: db.credits, cart },
    before,
  );
  assert.ok(
    visible(db, parent).products.some(
      (p) => p.id === l.productId && p.archivedAt,
    ),
  );
  mutate(db, parent, "cart-checkout", { id: cart.id });
  assert.equal(db.orders.length, before.orders.length);
  mutate(db, admin, "cart-cancel", { id: cart.id });
  assert.equal(cart.status, "Cancelled");
  assert.equal(db.products[0].archivedAt !== null, true);
});
test("play archive is team-scoped, hidden from families and reversible without losing frames", () => {
  const { db, admin, parent, coach } = setup();
  const teamId = visible(db, coach).channels[0];
  mutate(db, coach, "play-save", {
    name: "Archive test",
    teamId,
    frames: [Array.from({ length: 5 }, () => ({ x: 50, y: 50 }))],
    notes: "Keep this",
  });
  const p = db.plays.at(-1),
    frames = structuredClone(p.frames);
  assert.throws(
    () => mutate(db, parent, "play-archive", { id: p.id }),
    /Coach/,
  );
  const other = { ...coach, id: "other", teamIds: [] };
  assert.throws(
    () => mutate(db, other, "play-archive", { id: p.id }),
    /Team access/,
  );
  mutate(db, coach, "play-archive", { id: p.id });
  assert.ok(!visible(db, parent).plays.some((x) => x.id === p.id));
  assert.ok(
    visible(db, coach).plays.some((x) => x.id === p.id && x.archivedAt),
  );
  assert.deepEqual(p.frames, frames);
  mutate(db, admin, "play-restore", { id: p.id });
  assert.equal(p.archivedAt, null);
  assert.deepEqual(p.frames, frames);
  assert.throws(
    () => mutate(db, admin, "play-archive", { id: "missing" }),
    /not found/,
  );
});
