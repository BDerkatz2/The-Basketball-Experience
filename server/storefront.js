import { fail, id, integer, text, player, requireStaff } from "./domain.js";

export function storeUpgrade(db) {
  db.carts ??= [];
  db.creditGrants ??= [];
  for (const p of db.products) {
    p.variants ??= [{ id: "default", color: p.color, stock: { ...p.stock } }];
    // Keep the original size inventory as the default variant for older clients.
    p.variants[0].stock = p.stock;
  }
}
export function allowance(db, playerId, year = new Date().getFullYear()) {
  return Math.max(
    0,
    2 +
      (db.creditGrants || [])
        .filter((g) => g.playerId === playerId && g.year === year)
        .reduce((n, g) => n + g.quantity, 0),
  );
}
export function creditBalance(db, playerId, year = new Date().getFullYear()) {
  return Math.max(
    0,
    allowance(db, playerId, year) -
      db.credits
        .filter((c) => c.playerId === playerId && c.year === year)
        .reduce((n, c) => n + c.quantity, 0),
  );
}
export function expireCarts(db, now = Date.now()) {
  for (const c of db.carts)
    if (c.status === "Reserved" && Date.parse(c.expiresAt) <= now)
      c.status = "Expired";
}
export function availableStock(
  db,
  productId,
  variantId,
  size,
  now = Date.now(),
) {
  const p = db.products.find((p) => p.id === productId),
    v = p?.variants.find((v) => v.id === variantId);
  return (
    (v?.stock[size] ?? 0) -
    db.carts
      .filter((c) => c.status === "Reserved" && Date.parse(c.expiresAt) > now)
      .flatMap((c) => c.lines)
      .filter(
        (l) =>
          l.productId === productId &&
          l.variantId === variantId &&
          l.size === size,
      )
      .reduce((n, l) => n + l.quantity, 0)
  );
}
function buyer(u) {
  if (!["parent", "staff", "admin"].includes(u.role))
    fail("Parent or staff access required.", 403);
}
function ownCart(db, u, cartId) {
  const c = db.carts.find((c) => c.id === cartId);
  if (!c || c.ownerId !== u.id) fail("Cart access denied.", 403);
  return c;
}
export function storeAction(db, u, action, b) {
  storeUpgrade(db);
  expireCarts(db);
  if (action === "cart-cancel") {
    requireStaff(u);
    const c = db.carts.find((c) => c.id === b.id),
      invoice = db.invoices.find((i) => i.id === c?.invoiceId);
    if (!c || c.status !== "Ordered" || !invoice)
      fail("Ordered cart not found.", 409);
    if (invoice.status.startsWith("Paid") || invoice.checkoutSessionId)
      fail("Reconcile payment or checkout before cancelling this cart.", 409);
    const orders = db.orders.filter((o) => o.cartId === c.id);
    if (orders.some((o) => o.status === "Delivered"))
      fail("Delivered carts cannot be cancelled.", 409);
    for (const o of orders) {
      const v = db.products
        .find((p) => p.id === o.productId)
        ?.variants.find((v) => v.id === o.variantId);
      if (!v || v.stock[o.size] === undefined)
        fail("Restore the original variant before cancellation.", 409);
    }
    for (const o of orders) {
      db.products
        .find((p) => p.id === o.productId)
        .variants.find((v) => v.id === o.variantId).stock[o.size] += o.quantity;
      if (o.free)
        db.credits.push({
          id: id(),
          playerId: o.playerId,
          year: new Date(o.createdAt).getFullYear(),
          quantity: -o.free,
          orderId: o.id,
          reason: "Cart cancellation",
        });
      o.status = "Cancelled";
      o.paymentStatus = "Voided";
    }
    c.status = "Cancelled";
    invoice.status = "Voided";
    return;
  }
  if (action === "variant-save") {
    requireStaff(u);
    const p = db.products.find((p) => p.id === b.productId);
    if (!p) fail("Product not found.", 404);
    const color = text(b.color, 40);
    if (p.variants.some((v) => v.color.toLowerCase() === color.toLowerCase()))
      fail("That color already exists.", 409);
    const stock = integer(b.stock, 0, 10000);
    p.variants.push({
      id: id(),
      color,
      stock: Object.fromEntries(p.sizes.map((s) => [s, stock])),
    });
    return;
  }
  if (action === "credit-adjust") {
    requireStaff(u);
    const p = player(db, u, b.playerId),
      year = integer(b.year, 2020, 2100),
      quantity = integer(b.quantity, -100, 100);
    if (!quantity) fail("Adjustment must not be zero.");
    if (
      allowance(db, p.id, year) + quantity <
        db.credits
          .filter((c) => c.playerId === p.id && c.year === year)
          .reduce((n, c) => n + c.quantity, 0) ||
      allowance(db, p.id, year) + quantity < 0
    )
      fail("Cannot remove credits already used.", 409);
    db.creditGrants.push({
      id: id(),
      playerId: p.id,
      year,
      quantity,
      reason: text(b.reason, 300),
      actorId: u.id,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  buyer(u);
  if (action === "cart-release") {
    const c = ownCart(db, u, b.id);
    if (c.status === "Reserved") c.status = "Released";
    return;
  }
  if (action === "cart-reserve") {
    if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > 20)
      fail("Choose 1–20 cart lines.");
    if (db.carts.some((c) => c.ownerId === u.id && c.status === "Reserved"))
      fail("Release or checkout your existing reservation first.", 409);
    const totals = new Map();
    let familyId;
    const lines = b.lines.map((l) => {
      const p = player(db, u, l.playerId),
        product = db.products.find((p) => p.id === l.productId),
        v = product?.variants.find((v) => v.id === l.variantId);
      if (product?.archivedAt)
        fail("This product is archived. Remove it from your cart.", 409);
      if (!v || !product.sizes.includes(l.size))
        fail("Choose a valid color and size.");
      if (familyId && familyId !== p.familyId)
        fail("Each cart must belong to one family.");
      familyId = p.familyId;
      const quantity = integer(l.quantity, 1, 10),
        key = JSON.stringify([product.id, v.id, l.size]);
      totals.set(key, (totals.get(key) || 0) + quantity);
      if (totals.get(key) > availableStock(db, product.id, v.id, l.size))
        fail("Not enough available inventory. Nothing was reserved.", 409);
      return {
        productId: product.id,
        variantId: v.id,
        color: v.color,
        name: product.name,
        size: l.size,
        playerId: p.id,
        quantity,
        price: product.price,
        creditEligible: product.creditEligible,
        useCredits: l.useCredits === true,
      };
    });
    db.carts.push({
      id: id(),
      ownerId: u.id,
      familyId,
      lines,
      status: "Reserved",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    });
    return;
  }
  if (action === "cart-checkout") {
    const c = ownCart(db, u, b.id);
    if (c.status === "Ordered") return; // Lost-response retries return the original order.
    if (c.status !== "Reserved")
      fail("Reservation expired or was released. Reserve the cart again.", 409);
    const invoiceId = id(),
      year = new Date().getFullYear(),
      orders = [];
    for (const l of c.lines) {
      const p = player(db, u, l.playerId),
        product = db.products.find((p) => p.id === l.productId),
        v = product?.variants.find((v) => v.id === l.variantId);
      if (product?.archivedAt)
        fail("This product is archived. Rebuild your cart.", 409);
      if (!v || (v.stock[l.size] ?? 0) < l.quantity)
        fail("Reserved inventory needs staff reconciliation.", 409);
      const free =
        l.useCredits && l.creditEligible
          ? Math.min(l.quantity, creditBalance(db, p.id, year))
          : 0;
      const o = {
        id: id(),
        cartId: c.id,
        invoiceId,
        playerId: p.id,
        familyId: c.familyId,
        productId: product.id,
        variantId: v.id,
        color: l.color,
        size: l.size,
        quantity: l.quantity,
        free,
        total: (l.quantity - free) * l.price,
        status: "Ready to prepare",
        coach: db.teams.find((t) => t.id === p.teamId)?.coach,
        createdAt: new Date().toISOString(),
      };
      v.stock[l.size] -= l.quantity;
      if (free)
        db.credits.push({
          id: id(),
          playerId: p.id,
          year,
          quantity: free,
          orderId: o.id,
        });
      orders.push(o);
    }
    const amountCents = Math.round(
        orders.reduce((n, o) => n + o.total, 0) * 100,
      ),
      status = amountCents ? "Unpaid" : "Covered by credits";
    orders.forEach((o) => (o.paymentStatus = status));
    db.orders.unshift(...orders);
    db.invoices.push({
      id: invoiceId,
      sourceType: "cart",
      sourceId: c.id,
      familyId: c.familyId,
      description: `Store cart · ${orders.length} items`,
      amountCents,
      currency: "cad",
      status,
      createdAt: new Date().toISOString(),
    });
    c.status = "Ordered";
    c.invoiceId = invoiceId;
    return;
  }
  fail("Unknown store action.", 404);
}
