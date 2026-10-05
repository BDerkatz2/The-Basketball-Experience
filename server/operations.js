import {
  fail,
  id,
  text,
  integer,
  isStaff,
  player,
  manages,
  channels,
} from "./domain.js";
import { conversation } from "./communication.js";

export function operationsAction(db, u, action, b) {
  if (action === "refund-request") {
    if (!isStaff(u)) fail("Staff access required.", 403);
    const invoice = db.invoices.find((i) => i.id === b.invoiceId);
    if (
      !invoice ||
      !invoice.status.startsWith("Paid") ||
      !invoice.paymentIntent ||
      invoice.sourceType === "membership"
    )
      fail("Choose a paid one-time Stripe invoice.", 409);
    const amountCents = integer(b.amountCents, 1, invoice.amountCents);
    const reserved = db.refunds
      .filter(
        (r) =>
          r.invoiceId === invoice.id &&
          !["rejected", "failed", "canceled"].includes(r.status),
      )
      .reduce((n, r) => n + r.amountCents, 0);
    if (reserved + amountCents > invoice.amountCents)
      fail("Refund exceeds the unreserved paid balance.", 409);
    db.refunds.push({
      id: id(),
      invoiceId: invoice.id,
      amountCents,
      currency: invoice.currency,
      paymentIntent: invoice.paymentIntent,
      reason: text(b.reason, 500),
      status: "requested",
      requestedBy: u.id,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (action === "refund-review") {
    if (u.role !== "admin") fail("Administrator access required.", 403);
    const r = db.refunds.find((r) => r.id === b.id);
    if (!r || r.status !== "requested")
      fail("Choose an unreviewed refund.", 409);
    if (!["approved", "rejected"].includes(b.status))
      fail("Choose approve or reject.");
    r.status = b.status;
    r.reviewedBy = u.id;
    r.reviewedAt = new Date().toISOString();
    return;
  }
  if (action === "training-feedback") {
    const p = player(db, u, b.playerId);
    if (!manages(u, p)) fail("Coach or staff access required.", 403);
    db.coachingFeedback.push({
      id: id(),
      playerId: p.id,
      text: text(b.text, 2000),
      author: u.name,
      authorId: u.id,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (["video-edit", "video-delete", "video-restore"].includes(action)) {
    if (!isStaff(u) && u.role !== "coach") fail("Coach access required.", 403);
    const v = db.videos.find(
      (v) => v.id === b.id && channels(db, u).includes(v.teamId),
    );
    if (!v) fail("Video not found.", 404);
    if (action === "video-edit") {
      if (v.deletedAt) fail("Restore the clip first.", 409);
      v.name = text(b.name, 100);
    }
    if (action === "video-delete") {
      v.deletedAt = new Date().toISOString();
      v.deletedBy = u.id;
    }
    if (action === "video-restore") {
      if (v.fileId && !db.files.some((f) => f.id === v.fileId && !f.purgedAt))
        fail("Video file has been purged.", 409);
      delete v.deletedAt;
      delete v.deletedBy;
    }
    return;
  }
  if (action === "message-report") {
    const m = db.messages.find((m) => m.id === b.messageId);
    if (!m || m.deleted) fail("Message not found.", 404);
    conversation(db, u, m.channel);
    if (
      db.messageReports.some(
        (r) =>
          r.messageId === m.id && r.reporterId === u.id && r.status === "open",
      )
    )
      fail("You already reported this message.", 409);
    db.messageReports.push({
      id: id(),
      messageId: m.id,
      channel: m.channel,
      reporterId: u.id,
      reason: text(b.reason, 500),
      evidence: m.text,
      author: m.author,
      status: "open",
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (action === "message-review") {
    if (!isStaff(u)) fail("Staff access required.", 403);
    const r = db.messageReports.find((r) => r.id === b.id);
    if (!r || r.status !== "open") fail("Open report not found.", 404);
    if (!["dismissed", "removed"].includes(b.status))
      fail("Choose a moderation decision.");
    const note = text(b.note, 500);
    if (b.status === "removed") {
      const m = db.messages.find((m) => m.id === r.messageId);
      if (m) {
        m.text = "";
        m.attachmentIds = [];
        m.deleted = true;
        m.moderated = true;
      }
    }
    r.status = b.status;
    r.note = note;
    r.reviewedBy = u.id;
    r.reviewedAt = new Date().toISOString();
    return;
  }
  if (action === "group-rename" || action === "group-remove") {
    const c = conversation(db, u, b.channel);
    if (c.kind !== "group" || c.ownerId !== u.id)
      fail("Only the group owner can manage this group.", 403);
    if (action === "group-rename") c.name = text(b.name, 80);
    else {
      if (b.userId === u.id) fail("Use Leave group to remove yourself.");
      if (!c.memberIds.includes(b.userId)) fail("Member not found.", 404);
      c.memberIds = c.memberIds.filter((id) => id !== b.userId);
    }
    return;
  }
}

export function cleanupCandidates(db, now = Date.now()) {
  const grace = 7 * 86400000;
  return db.files.filter(
    (f) =>
      f.purpose === "video" &&
      !f.purgedAt &&
      now - Date.parse(f.createdAt) > grace &&
      !db.videos.some(
        (v) =>
          v.fileId === f.id &&
          (!v.deletedAt || now - Date.parse(v.deletedAt) < grace),
      ),
  );
}
export function progress(db, u) {
  return db.players
    .filter((p) => {
      try {
        player(db, u, p.id);
        return true;
      } catch {
        return false;
      }
    })
    .map((p) => {
      const workouts = db.workouts.filter(
          (w) => w.playerId === p.id && !w.cancelledAt,
        ),
        results = db.results.filter((r) => r.playerId === p.id);
      const weeks = new Map();
      for (const r of results) {
        const d = new Date(r.createdAt);
        d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
        const key = d.toISOString().slice(0, 10);
        const row = weeks.get(key) || {
          week: key,
          completed: 0,
          attempts: 0,
          made: 0,
        };
        row.completed++;
        row.attempts += r.attempts;
        row.made += r.made;
        weeks.set(key, row);
      }
      return {
        playerId: p.id,
        name: p.name,
        assigned: workouts.length,
        completed: workouts.filter((w) => w.completed).length,
        overdue: workouts.filter(
          (w) => !w.completed && Date.parse(w.due) < Date.now(),
        ).length,
        weeks: [...weeks.values()]
          .sort((a, b) => a.week.localeCompare(b.week))
          .slice(-12),
      };
    });
}

export function applyRefund(db, refund) {
  const r = db.refunds.find(
    (r) => r.providerId === refund.id || r.id === refund.metadata?.requestId,
  );
  if (!r) return;
  if (
    (typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id) !== r.paymentIntent ||
    refund.amount !== r.amountCents ||
    refund.currency !== r.currency ||
    refund.livemode === true
  )
    fail("Refund does not match the approved request.", 409);
  if (
    !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(
      refund.status,
    )
  )
    fail("Unknown refund status.", 409);
  if (
    ["succeeded", "failed", "canceled"].includes(r.status) &&
    r.status !== refund.status
  )
    return;
  r.providerId = refund.id;
  r.status = refund.status;
  r.updatedAt = new Date().toISOString();
  const invoice = db.invoices.find((i) => i.id === r.invoiceId);
  invoice.refundedCents = db.refunds
    .filter((x) => x.invoiceId === r.invoiceId && x.status === "succeeded")
    .reduce((n, x) => n + x.amountCents, 0);
}
