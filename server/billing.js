import { applyRefund } from "./operations.js";
import { id, fail, isStaff } from "./domain.js";
export function addInvoice(db, action) {
  db.invoices ??= [];
  let source, familyId, description, amount;
  if (action === "order") {
    source = db.orders[0];
    familyId = source.familyId;
    description = "Merchandise order " + source.id.slice(0, 8);
    amount = source.total;
  } else if (action === "enroll") {
    source = db.enrollments.at(-1);
    familyId = db.players.find((p) => p.id === source.playerId).familyId;
    description = db.programs.find((p) => p.id === source.programId).name;
    amount = source.amount;
  } else return;
  source.paymentStatus = amount === 0 ? "Covered by credits" : "Unpaid";
  db.invoices.push({
    id: id(),
    familyId,
    sourceId: source.id,
    sourceType: action,
    description,
    amountCents: Math.round(amount * 100),
    currency: "cad",
    status: amount === 0 ? "Covered by credits" : "Unpaid",
    createdAt: new Date().toISOString(),
  });
}
export function canInvoice(u, i) {
  return isStaff(u) || (u.role === "parent" && u.familyId === i.familyId);
}
export function processPaymentEvent(db, event) {
  db.paymentEvents ??= [];
  if (db.paymentEvents.some((e) => e.id === event.id)) return;
  const session = event.data?.object;
  if (
    ["refund.created", "refund.updated", "refund.failed"].includes(event.type)
  )
    applyRefund(db, session);
  if (
    [
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
      "payment_intent.payment_failed",
    ].includes(event.type)
  ) {
    const i = db.invoices.find((i) => i.id === session?.metadata?.invoiceId);
    if (
      i &&
      i.status === "Unpaid" &&
      i.familyId === session.metadata.familyId &&
      (event.type.startsWith("checkout.")
        ? i.checkoutSessionId === session.id
        : Number(session.metadata.attempt) === i.checkoutAttempt)
    ) {
      i.recoveryStatus = event.type.endsWith("expired")
        ? "Checkout expired"
        : "Payment failed";
      i.failedAt = new Date().toISOString();
      i.failureCount = (i.failureCount || 0) + 1;
    }
  }
  if (
    [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
    ].includes(event.type) &&
    session?.payment_status === "paid"
  ) {
    const invoice = db.invoices.find(
      (i) => i.id === session.metadata?.invoiceId,
    );
    if (!invoice) fail("Payment invoice not found.", 409);
    if (invoice.status === "Voided")
      fail(
        "Payment received for a voided invoice; manual reconciliation required.",
        409,
      );
    if (
      invoice.amountCents !== session.amount_total ||
      invoice.currency !== session.currency ||
      invoice.familyId !== session.metadata?.familyId
    )
      fail("Payment does not match the invoice.", 409);
    if (invoice.checkoutSessionId && invoice.checkoutSessionId !== session.id)
      fail("Checkout session does not match.", 409);
    invoice.recoveryStatus = "Resolved";
    invoice.status = "Paid (Stripe test)";
    invoice.paidAt = new Date().toISOString();
    invoice.paymentIntent = session.payment_intent;
    invoice.checkoutSessionId = session.id;
    const source = (
      invoice.sourceType === "order" ? db.orders : db.enrollments
    ).find((x) => x.id === invoice.sourceId);
    if (source) source.paymentStatus = "Paid (Stripe test)";
    if (invoice.sourceType === "cart")
      for (const o of db.orders.filter((o) => o.cartId === invoice.sourceId))
        o.paymentStatus = "Paid (Stripe test)";
  }
  db.paymentEvents.push({
    id: event.id,
    type: event.type,
    processedAt: new Date().toISOString(),
  });
}
