import { defineField, answerField, onboardingAction } from "./form-fields.js";
import {
  storeUpgrade,
  expireCarts,
  storeAction,
  availableStock,
  creditBalance,
} from "./storefront.js";
import { scorekeeper, clockSeconds } from "./scorekeeper.js";
import {
  fail,
  id,
  text,
  integer,
  isStaff,
  manages,
  player,
  channels,
  mutate as baseMutate,
  visible as baseVisible,
} from "./domain.js";
import { eligibility, registrationAction } from "./registration.js";
import { operationsAction, progress } from "./operations.js";
import { addInvoice } from "./billing.js";
import { trainingPlanAction } from "./training-plans.js";
import {
  familyProfile,
  expireOffers,
  waitlistState,
  vacancies,
  enrollmentGate,
  waitlistAction,
} from "./family-waitlists.js";
import { preferences, reminderAction, processReminders } from "./reminders.js";
import { savePlan } from "./memberships.js";
import {
  communicationState,
  communicationAction,
  canReadMessageFile,
} from "./communication.js";
import {
  weeklyStarts,
  suggestSchedule,
  rescheduleSeries,
} from "./scheduling.js";

export function upgrade(db) {
  for (const key of [
    "brackets",
    "gameStats",
    "plays",
    "videos",
    "audit",
    "files",
    "staffProfiles",
    "notifications",
    "forms",
    "invoices",
    "paymentEvents",
    "conversations",
    "messageReads",
    "accountLinks",
    "membershipPlans",
    "memberships",
    "notificationPreferences",
    "deliveryQueue",
    "trainingPlans",
    "pushDevices",
    "waitlist",
    "refunds",
    "coachingFeedback",
    "messageReports",
  ])
    db[key] ??= [];
  for (const t of db.teams)
    t.division ??= t.name.startsWith("U11") ? "U11" : "U14";
  for (const e of db.events) e.status ??= "Scheduled";
  storeUpgrade(db);
  return db;
}
const staff = (u) => {
  if (!isStaff(u)) fail("Staff access required.", 403);
};
const coach = (u) => {
  if (!isStaff(u) && u.role !== "coach")
    fail("Coach or staff access required.", 403);
};
const team = (db, u, teamId) => {
  if (!db.teams.some((t) => t.id === teamId)) fail("Team not found.", 404);
  if (!channels(db, u).includes(teamId)) fail("Team access denied.", 403);
  return teamId;
};
const pick = (v, values) =>
  values.includes(v) ? v : fail("Choose a valid option.");
const stamp = () => new Date().toISOString();
const iso = (v) => {
  const d = new Date(v);
  return Number.isFinite(+d) ? d.toISOString() : fail("Choose a valid date.");
};
const optional = (v, max = 500) => (v ? text(v, max) : "");
export function conflicts(db, event, exclude) {
  const teamIds = [event.teamId, event.opponentId].filter(Boolean),
    coachNames = teamIds
      .map((id) => db.teams.find((t) => t.id === id)?.coach)
      .filter(Boolean);
  return db.events.filter(
    (e) =>
      e.id !== exclude &&
      e.status !== "Cancelled" &&
      +new Date(event.start) < +new Date(e.start) + e.minutes * 60000 &&
      +new Date(e.start) < +new Date(event.start) + event.minutes * 60000 &&
      (e.location.trim().toLowerCase() ===
        event.location.trim().toLowerCase() ||
        [e.teamId, e.opponentId].some((t) => t && teamIds.includes(t)) ||
        e.playerIds.some((p) => event.playerIds.includes(p)) ||
        [e.teamId, e.opponentId].some(
          (t) =>
            t && coachNames.includes(db.teams.find((x) => x.id === t)?.coach),
        )),
  );
}
function announce(db, event, message) {
  for (const u of db.users) {
    if (
      isStaff(u) ||
      channels(db, u).includes(event.teamId) ||
      db.players.some(
        (p) =>
          event.playerIds.includes(p.id) &&
          (u.playerId === p.id || u.familyId === p.familyId),
      )
    )
      db.notifications.unshift({
        id: id(),
        userId: u.id,
        title: event.title,
        category: "changes",
        source: { kind: "change", id: event.id },
        text: message,
        createdAt: stamp(),
        read: false,
      });
  }
}
const settled = (g) => ["Final", "Bye"].includes(g.status);
const winner = (g) =>
  g.status === "Bye"
    ? g.homeId || g.awayId
    : g.homeScore > g.awayScore
      ? g.homeId
      : g.awayId;
export function advance(db, bracketId) {
  const b = db.brackets.find((b) => b.id === bracketId);
  if (!b) return;
  for (let r = 1; r < b.rounds.length; r++)
    for (let i = 0; i < b.rounds[r].length; i++) {
      const g = db.games.find((g) => g.id === b.rounds[r][i]);
      const left = db.games.find((g) => g.id === b.rounds[r - 1][i * 2]),
        right = db.games.find((g) => g.id === b.rounds[r - 1][i * 2 + 1]);
      const a = settled(left) ? winner(left) : null,
        c = settled(right) ? winner(right) : null;
      if (
        (g.homeId !== a || g.awayId !== c) &&
        ["Live", "Final"].includes(g.status)
      )
        fail(
          "A later round has started. Correct that round first before changing its participants.",
          409,
        );
      g.homeId = a;
      g.awayId = c;
    }
  const final = db.games.find((g) => g.id === b.rounds.at(-1)[0]);
  b.championId = final.status === "Final" ? winner(final) : null;
}
export function visible(db, u) {
  upgrade(db);
  const d = baseVisible(db, u),
    ch = channels(db, u),
    ids = new Set(d.players.map((p) => p.id));
  return {
    ...d,
    ...communicationState(db, u),
    refunds: db.refunds
      .filter(
        (r) =>
          isStaff(u) ||
          db.invoices.some(
            (i) =>
              i.id === r.invoiceId &&
              u.role === "parent" &&
              i.familyId === u.familyId,
          ),
      )
      .map(({ paymentIntent, ...r }) => r),
    coachingFeedback: db.coachingFeedback.filter((f) => ids.has(f.playerId)),
    trainingProgress: progress(db, u),
    messageReports: isStaff(u)
      ? db.messageReports
      : db.messageReports
          .filter((r) => r.reporterId === u.id)
          .map(({ evidence, author, ...r }) => r),
    deletedVideos:
      isStaff(u) || u.role === "coach"
        ? db.videos.filter((v) => v.deletedAt && ch.includes(v.teamId))
        : [],
    waitlist: waitlistState(db, u),
    programAvailability: db.programs.map((p) => ({
      programId: p.id,
      available: vacancies(db, p.id),
      waiting: db.waitlist.filter(
        (r) => r.programId === p.id && r.status === "Waiting",
      ).length,
    })),
    carts: db.carts
      .filter((c) => c.ownerId === u.id || isStaff(u))
      .map((c) => ({
        ...c,
        status:
          c.status === "Reserved" && Date.parse(c.expiresAt) <= Date.now()
            ? "Expired"
            : c.status,
      })),
    creditGrants: db.creditGrants.filter((g) => ids.has(g.playerId)),
    creditBalances: d.players.map((p) => ({
      playerId: p.id,
      remaining: creditBalance(db, p.id),
    })),
    products: db.products.map((p) => ({
      ...p,
      variants: p.variants.map((v) => ({
        ...v,
        available: Object.fromEntries(
          p.sizes.map((size) => [size, availableStock(db, p.id, v.id, size)]),
        ),
      })),
    })),
    authSessions: undefined,
    pushDevices: undefined,
    accountLinks: undefined,
    trainingPlans: db.trainingPlans.filter(
      (p) => isStaff(u) || p.ownerId === u.id,
    ),
    memberships: db.memberships
      .filter(
        (m) => isStaff(u) || (u.role === "parent" && m.familyId === u.familyId),
      )
      .map(({ customerId, ...m }) => m),
    invitations: undefined,
    paymentEvents: undefined,
    invoices: db.invoices.filter(
      (i) => isStaff(u) || (u.role === "parent" && i.familyId === u.familyId),
    ),
    events: d.events.map((e) => ({
      ...e,
      playerIds: e.playerIds.filter((id) => ids.has(id)),
    })),
    audit: isStaff(u) ? db.audit.slice(-200).reverse() : [],
    notificationPreferences: preferences(db, u),
    deliveryQueue: isStaff(u) ? db.deliveryQueue : [],
    notifications: db.notifications.filter(
      (n) => n.userId === u.id && !n.suppressed && preferences(db, u).inApp,
    ),
    gameStats: db.gameStats.filter((s) => ids.has(s.playerId)),
    plays: db.plays.filter((p) => ch.includes(p.teamId)),
    videos: db.videos.filter((v) => !v.deletedAt && ch.includes(v.teamId)),
    staffProfiles: db.staffProfiles.filter(
      (p) => u.role === "admin" || p.userId === u.id,
    ),
    files: db.files
      .filter(
        (f) =>
          !f.purgedAt &&
          !(
            f.purpose === "video" &&
            db.videos.some((v) => v.fileId === f.id && v.deletedAt) &&
            !db.videos.some((v) => v.fileId === f.id && !v.deletedAt)
          ),
      )
      .filter((f) =>
        f.purpose === "message"
          ? canReadMessageFile(db, u, f)
          : f.purpose === "staff"
            ? u.role === "admin" || f.ownerId === u.id
            : ch.includes(f.teamId),
      ),
    staffDirectory:
      isStaff(u) || u.role === "coach"
        ? db.users
            .filter((x) => ["staff", "coach", "admin"].includes(x.role))
            .map(({ id, name, role }) => ({ id, name, role }))
        : [],
  };
}
export function mutate(db, u, action, b) {
  upgrade(db);
  expireOffers(db);
  expireCarts(db);
  if (!b || typeof b !== "object" || Array.isArray(b))
    fail("Expected an object.");
  if (["order-cancel", "enrollment-cancel"].includes(action)) {
    const invoice = db.invoices.find((i) => i.sourceId === b.id);
    if (
      invoice &&
      (invoice.status.startsWith("Paid") || invoice.checkoutSessionId)
    )
      fail(
        "This item has a payment or open checkout. Reconcile it in Stripe before cancellation.",
        409,
      );
  }
  change(db, u, action, b);
  if (action === "enroll")
    for (const row of db.waitlist.filter(
      (r) =>
        r.programId === b.programId &&
        r.playerId === b.playerId &&
        ["Waiting", "Offered"].includes(r.status),
    ))
      row.status = "Enrolled";
  processReminders(db);
  addInvoice(db, action);
  if (["order-cancel", "enrollment-cancel"].includes(action)) {
    const invoice = db.invoices.find((i) => i.sourceId === b.id);
    if (invoice) invoice.status = "Voided";
  }
  db.audit.push({
    id: id(),
    actorId: u.id,
    actor: u.name,
    action,
    targetId: b.id || b.playerId || b.teamId || null,
    createdAt: stamp(),
  });
}
function change(db, u, action, b) {
  if (action === "series-reschedule") {
    const rows = rescheduleSeries(db, u, b, conflicts);
    for (const row of rows) {
      Object.assign(
        db.events.find((e) => e.id === row.id),
        row,
      );
      announce(
        db,
        row,
        "This and following practice sessions were rescheduled.",
      );
    }
    db.events.sort((a, b) => a.start.localeCompare(b.start));
    return;
  }

  if (["staff-document", "waiver-approve"].includes(action))
    return onboardingAction(db, u, action, b);
  if (
    [
      "cart-reserve",
      "cart-release",
      "cart-checkout",
      "cart-cancel",
      "variant-save",
      "credit-adjust",
    ].includes(action)
  )
    return storeAction(db, u, action, b);
  if (action === "game-control") return scorekeeper(db, u, b);
  if (action === "order") {
    const p = db.products.find((p) => p.id === b.productId);
    if (p && availableStock(db, p.id, p.variants[0].id, b.size) < b.quantity)
      fail("Stock is reserved by another cart.", 409);
  }
  if (
    [
      "refund-request",
      "refund-review",
      "training-feedback",
      "video-edit",
      "video-delete",
      "video-restore",
      "message-report",
      "message-review",
      "group-rename",
      "group-remove",
    ].includes(action)
  )
    return operationsAction(db, u, action, b);
  if (["registration-rules", "season-rollover"].includes(action))
    return registrationAction(db, u, action, b);
  if (["enroll", "waitlist-join"].includes(action)) eligibility(db, u, b);
  if (["family-profile", "family-player"].includes(action)) {
    familyProfile(db, u, action, b);
    return;
  }
  if (["waitlist-join", "waitlist-leave", "waitlist-offer"].includes(action)) {
    waitlistAction(db, u, action, b);
    return;
  }
  if (
    action === "workout" &&
    db.workouts.some((w) => w.id === b.id && w.cancelledAt)
  )
    fail("This assignment was cancelled.", 409);
  if (
    [
      "training-plan-create",
      "training-plan-assign",
      "training-plan-edit",
      "training-plan-archive",
      "training-plan-cancel",
    ].includes(action)
  ) {
    trainingPlanAction(db, u, action, b);
    return;
  }
  if (
    [
      "notification-preferences",
      "reminders-run",
      "delivery-retry",
      "delivery-test-failure",
    ].includes(action)
  ) {
    reminderAction(db, u, action, b);
    return;
  }
  if (action === "membership-plan") {
    savePlan(db, u, b);
    return;
  }
  if (
    [
      "conversation-create",
      "conversation-leave",
      "message",
      "message-read",
      "message-delete",
    ].includes(action)
  ) {
    communicationAction(db, u, action, b);
    return;
  }
  if (action === "form-save") {
    staff(u);
    const program = db.programs.find((p) => p.id === b.programId);
    if (!program) fail("Choose a program.");
    if (!Array.isArray(b.fields) || b.fields.length > 20)
      fail("Use up to 20 questions.");
    const fields = b.fields.map(defineField);
    const form = {
      id: id(),
      programId: program.id,
      title: text(b.title, 120),
      waiverText: text(b.waiverText, 8000),
      fields,
      version: db.forms.filter((f) => f.programId === program.id).length + 1,
      createdAt: stamp(),
      authorId: u.id,
    };
    db.forms.push(form);
    program.formId = form.id;
    return;
  }
  if (action === "enroll") {
    enrollmentGate(db, b);
    const program = db.programs.find((p) => p.id === b.programId),
      form = db.forms.find((f) => f.id === program?.formId);
    if (form) {
      if (b.formId !== form.id)
        fail(
          "The registration form changed. Reopen registration and review the latest version.",
          409,
        );
      const answers = {};
      for (const field of form.fields) {
        const value = b.answers?.[field.id];
        answers[field.id] = answerField(field, value);
      }
      baseMutate(db, u, action, b);
      Object.assign(db.waivers.at(-1), {
        formId: form.id,
        version: form.version,
        text: form.waiverText,
        title: form.title,
        fields: structuredClone(form.fields),
        answers,
      });
      return;
    }
  }
  if (action === "notification-read") {
    const n = db.notifications.find((n) => n.id === b.id && n.userId === u.id);
    if (!n) fail("Notification not found.", 404);
    n.read = true;
    return;
  }
  if (action === "team-save") {
    staff(u);
    const existing = b.id ? db.teams.find((t) => t.id === b.id) : null;
    if (b.id && !existing) fail("Team not found.", 404);
    const row = {
      id: existing?.id || id(),
      name: text(b.name, 80),
      coach: text(b.coach, 80),
      division: text(b.division, 30),
    };
    if (existing) Object.assign(existing, row);
    else db.teams.push(row);
    return;
  }
  if (action === "family-save") {
    staff(u);
    const f = b.id ? db.families.find((f) => f.id === b.id) : null;
    if (b.id && !f) fail("Family not found.", 404);
    const email = text(b.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      fail("Enter a valid email address.");
    const row = {
      id: f?.id || id(),
      name: text(b.name, 100),
      email,
      membership: pick(b.membership, ["Active", "Expired", "Pending"]),
    };
    if (f) Object.assign(f, row);
    else db.families.push(row);
    return;
  }
  if (action === "player-save") {
    staff(u);
    if (
      !db.families.some((f) => f.id === b.familyId) ||
      !db.teams.some((t) => t.id === b.teamId)
    )
      fail("Choose an existing family and team.");
    const p = b.id ? db.players.find((p) => p.id === b.id) : null;
    if (b.id && !p) fail("Player not found.", 404);
    const row = {
      id: p?.id || id(),
      name: text(b.name, 100),
      familyId: b.familyId,
      teamId: b.teamId,
      age: integer(b.age, 4, 100),
      number: integer(b.number, 0, 99),
    };
    if (p) Object.assign(p, row);
    else db.players.push(row);
    return;
  }
  if (action === "program-edit") {
    staff(u);
    const p = db.programs.find((p) => p.id === b.id);
    if (!p) fail("Program not found.", 404);
    const capacity = integer(b.capacity, 1, 500);
    if (
      capacity <
      db.enrollments.filter(
        (e) => e.programId === p.id && e.status === "Active",
      ).length +
        db.waitlist.filter(
          (r) => r.programId === p.id && r.status === "Offered",
        ).length
    )
      fail("Capacity cannot be below active registrations.");
    Object.assign(p, {
      name: text(b.name, 100),
      description: text(b.description),
      location: text(b.location, 120),
      price: integer(b.price, 0, 10000),
      capacity,
      ages: text(b.ages, 30),
      sessions: integer(b.sessions, 1, 100),
    });
    return;
  }
  if (action === "enrollment-cancel") {
    const e = db.enrollments.find((e) => e.id === b.id);
    if (!e) fail("Registration not found.", 404);
    player(db, u, e.playerId);
    if (!isStaff(u) && u.role !== "parent")
      fail("Parent or staff access required.", 403);
    if (e.status === "Cancelled") fail("Already cancelled.", 409);
    e.status = "Cancelled";
    e.cancelledAt = stamp();
    e.refundStatus = "No automatic refund";
    for (const event of db.events.filter((s) => s.programId === e.programId))
      event.playerIds = event.playerIds.filter((id) => id !== e.playerId);
    return;
  }
  if (action === "product-save") {
    staff(u);
    const product = b.id ? db.products.find((p) => p.id === b.id) : null;
    if (b.id && !product) fail("Product not found.", 404);
    if (
      product &&
      db.carts.some(
        (c) =>
          c.status === "Reserved" &&
          c.lines.some((l) => l.productId === product.id),
      )
    )
      fail(
        "Release or wait for active reservations before editing this product.",
        409,
      );
    if (
      product?.variants.length > 1 &&
      b.sizes
        .split(",")
        .map((s) => s.trim())
        .join(",") !== product.sizes.join(",")
    )
      fail("Size changes require variant inventory reconciliation.", 409);
    const sizes = text(b.sizes, 100)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (new Set(sizes).size !== sizes.length || sizes.length > 15)
      fail("Enter unique comma-separated sizes.");
    const stock = integer(b.stock, 0, 10000);
    const row = {
      id: product?.id || id(),
      name: text(b.name, 100),
      category: text(b.category, 50),
      color: text(b.color, 40),
      price: integer(b.price, 0, 10000),
      creditEligible: b.creditEligible === true,
      sizes,
      stock: Object.fromEntries(
        sizes.map((s) => [s, product?.stock[s] ?? stock]),
      ),
    };
    if (product) {
      Object.assign(product, row);
      product.variants[0].stock = product.stock;
      product.variants[0].color = product.color;
    } else {
      db.products.push(row);
      storeUpgrade(db);
    }
    return;
  }
  if (action === "restock") {
    staff(u);
    const p = db.products.find((p) => p.id === b.id);
    if (!p || !p.sizes.includes(b.size))
      fail("Choose an existing product and size.");
    const variant = b.variantId
      ? p.variants.find((v) => v.id === b.variantId)
      : p.variants[0];
    if (!variant) fail("Color not found.");
    variant.stock[b.size] += integer(b.quantity, 1, 10000);
    return;
  }
  if (action === "order-cancel") {
    staff(u);
    const o = db.orders.find((o) => o.id === b.id);
    if (!o) fail("Order not found.", 404);
    if (o.cartId)
      fail(
        "Cart orders must be reconciled together; individual cancellation is unavailable.",
        409,
      );
    if (["Cancelled", "Delivered"].includes(o.status))
      fail("Only unfulfilled orders can be cancelled.", 409);
    const p = db.products.find((p) => p.id === o.productId);
    if (!p || p.stock[o.size] === undefined)
      fail("Restore the original variant before cancellation.", 409);
    p.stock[o.size] += o.quantity;
    if (o.free)
      db.credits.push({
        id: id(),
        playerId: o.playerId,
        year: new Date(o.createdAt).getFullYear(),
        quantity: -o.free,
        orderId: o.id,
        reason: "Order cancellation",
      });
    o.status = "Cancelled";
    o.refundStatus = "No automatic refund";
    return;
  }
  if (action === "fulfill") {
    const o = db.orders.find((o) => o.id === b.id);
    if (o?.status === "Cancelled")
      fail("Cancelled orders cannot be delivered.", 409);
  }
  if (action === "session-edit" || action === "session-cancel") {
    staff(u);
    const e = db.events.find((e) => e.id === b.id);
    if (!e) fail("Session not found.", 404);
    if (action === "session-cancel") {
      if (e.status === "Cancelled") fail("Already cancelled.", 409);
      e.status = "Cancelled";
      announce(db, e, "This session has been cancelled.");
      return;
    }
    const next = {
      ...e,
      title: text(b.title, 100),
      start: iso(b.start),
      minutes: integer(b.minutes, 15, 240),
      location: text(b.location, 120),
      address: text(b.address || b.location, 200),
    };
    if (conflicts(db, next, e.id).length)
      fail(
        "This change conflicts with a court, coach, team, or player booking.",
        409,
      );
    Object.assign(e, next);
    announce(db, e, `Updated session: ${e.start} at ${e.location}.`);
    return;
  }
  if (action === "schedule-plan") {
    const plan = suggestSchedule(db, u, b, conflicts);
    if (!plan.complete)
      fail(
        "The full round robin does not fit. Extend the window before saving.",
        409,
      );
    if (b.fingerprint !== plan.fingerprint)
      fail("Bookings changed. Preview the schedule again before saving.", 409);
    for (const proposal of plan.games) {
      const event = { ...proposal, id: id() };
      db.events.push(event);
      db.games.push({
        id: id(),
        eventId: event.id,
        homeId: event.teamId,
        awayId: event.opponentId,
        homeScore: 0,
        awayScore: 0,
        status: "Scheduled",
      });
      announce(db, event, "A new league game was added to your calendar.");
    }
    db.events.sort((a, b) => a.start.localeCompare(b.start));
    return;
  }
  if (action === "schedule") {
    staff(u);
    const t = db.teams.find((t) => t.id === b.teamId);
    if (!t) fail("Team not found.");
    const count = integer(b.count, 1, 20),
      starts = weeklyStarts(b),
      minutes = integer(b.minutes, 15, 240),
      title = text(b.title, 100),
      location = text(b.location, 120);
    const seriesId = id();
    const proposed = starts.map((start) => ({
      seriesId,
      id: id(),
      title,
      kind: "Practice",
      status: "Scheduled",
      start,
      timeZone: b.timeZone || "UTC",
      minutes,
      location,
      address: location,
      teamId: t.id,
      playerIds: db.players.filter((p) => p.teamId === t.id).map((p) => p.id),
    }));
    for (const e of proposed)
      if (
        conflicts(
          {
            ...db,
            events: [...db.events, ...proposed.filter((p) => p.id !== e.id)],
          },
          e,
        ).length
      )
        fail(
          "Scheduling conflict: a court, coach, team, or player is booked. Nothing was added.",
          409,
        );
    db.events.push(...proposed);
    db.events.sort((a, b) => a.start.localeCompare(b.start));
    for (const e of proposed)
      announce(db, e, "A new session was added to your calendar.");
    return;
  }
  if (action === "drill-save") {
    coach(u);
    const d = b.id ? db.drills.find((d) => d.id === b.id) : null;
    if (b.id && !d) fail("Drill not found.", 404);
    if (d?.ownerId && d.ownerId !== u.id && !isStaff(u))
      fail("Only the creator or staff may edit this drill.", 403);
    const row = {
      id: d?.id || id(),
      ownerId: d?.ownerId || u.id,
      name: text(b.name, 100),
      category: pick(b.category, [
        "Shooting",
        "Ball handling",
        "Strength",
        "Conditioning",
        "Team tactics",
      ]),
      minutes: integer(b.minutes, 1, 180),
      instructions: text(b.instructions, 4000),
      sets: integer(b.sets ?? 1, 1, 30),
      reps: integer(b.reps ?? 1, 1, 1000),
      rest: integer(b.rest ?? 30, 0, 600),
    };
    if (d) Object.assign(d, row);
    else db.drills.push(row);
    return;
  }
  if (action === "play-save") {
    coach(u);
    team(db, u, b.teamId);
    const p = b.id ? db.plays.find((p) => p.id === b.id) : null;
    if (b.id && !p) fail("Play not found.", 404);
    if (p) team(db, u, p.teamId);
    if (!Array.isArray(b.frames) || b.frames.length < 1 || b.frames.length > 20)
      fail("Provide 1–20 play frames.");
    const frames = b.frames.map((f) => {
      if (
        !Array.isArray(f) ||
        ![5, 10].includes(f.length) ||
        f.length !== b.frames[0].length
      )
        fail(
          "Each frame needs five offensive players, optionally with five defenders, consistently across frames.",
        );
      return f.map((pt) => ({
        x: integer(pt.x, 0, 100),
        y: integer(pt.y, 0, 100),
      }));
    });
    const row = {
      id: p?.id || id(),
      name: text(b.name, 100),
      notes: optional(b.notes, 2000),
      teamId: b.teamId,
      frames,
      routes: validateRoutes(
        b.routes ?? p?.routes ?? [],
        frames.length,
        frames[0].length,
      ),
      updatedAt: stamp(),
      ownerId: u.id,
    };
    if (p) Object.assign(p, row);
    else db.plays.push(row);
    return;
  }
  if (action === "video-save") {
    coach(u);
    team(db, u, b.teamId);
    let url = "";
    if (b.fileId) {
      const f = db.files.find(
        (f) =>
          f.id === b.fileId &&
          !f.purgedAt &&
          f.purpose === "video" &&
          f.teamId === b.teamId,
      );
      if (!f) fail("Video upload not found.");
    } else {
      try {
        const parsed = new URL(b.url);
        if (parsed.protocol !== "https:" || parsed.username || parsed.password)
          throw Error();
        url = parsed.href;
      } catch {
        fail("Use an HTTPS video URL or upload a video.");
      }
    }
    // Safe retry after a lost save response: an uploaded file has one team clip.
    if (
      b.fileId &&
      db.videos.some((v) => v.fileId === b.fileId && v.teamId === b.teamId)
    )
      return;
    db.videos.push({
      id: id(),
      name: text(b.name, 100),
      teamId: b.teamId,
      url,
      fileId: b.fileId || null,
      tags: [],
      createdAt: stamp(),
    });
    return;
  }
  if (action === "video-tag") {
    coach(u);
    const v = db.videos.find((v) => v.id === b.id);
    if (!v || v.deletedAt) fail("Video not found.", 404);
    team(db, u, v.teamId);
    const seconds = Number(b.seconds);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)
      fail("Enter a valid timestamp.");
    if (!Array.isArray(b.lines) || b.lines.length > 30)
      fail("Too many drawing annotations.");
    const lines = b.lines.map((line) => {
      if (!Array.isArray(line) || line.length !== 4) fail("Invalid arrow.");
      return line.map((n) => {
        if (!Number.isFinite(n) || n < 0 || n > 100)
          fail("Drawing is outside the frame.");
        return n;
      });
    });
    v.tags.push({
      id: id(),
      seconds,
      label: text(b.label, 160),
      lines,
      author: u.name,
    });
    v.tags.sort((a, b) => a.seconds - b.seconds);
    return;
  }
  if (action === "bracket-create") {
    staff(u);
    if (
      !Array.isArray(b.teamIds) ||
      b.teamIds.length < 2 ||
      b.teamIds.length > 16 ||
      new Set(b.teamIds).size !== b.teamIds.length
    )
      fail("Choose 2–16 distinct teams.");
    const teams = b.teamIds.map((id) => db.teams.find((t) => t.id === id));
    if (teams.some((t) => !t)) fail("Unknown team.");
    if (new Set(teams.map((t) => t.division)).size !== 1)
      fail("A bracket must use one division.");
    const bracket = {
      id: id(),
      name: text(b.name, 100),
      division: teams[0].division,
      rounds: [],
      championId: null,
    };
    const size = 2 ** Math.ceil(Math.log2(teams.length));
    // Standard seed ordering keeps first and second seeds on opposite halves.
    let seeds = [1, 2];
    while (seeds.length < size) {
      const total = seeds.length * 2 + 1;
      seeds = seeds.flatMap((n) => [n, total - n]);
    }
    for (let r = 0, count = size / 2; count >= 1; r++, count /= 2) {
      const round = [];
      for (let i = 0; i < count; i++) {
        const a = r === 0 ? b.teamIds[seeds[i * 2] - 1] || null : null,
          c = r === 0 ? b.teamIds[seeds[i * 2 + 1] - 1] || null : null;
        const g = {
          id: id(),
          bracketId: bracket.id,
          round: r,
          homeId: a,
          awayId: c,
          homeScore: 0,
          awayScore: 0,
          status: r === 0 && (!a || !c) ? "Bye" : "Scheduled",
        };
        db.games.push(g);
        round.push(g.id);
      }
      bracket.rounds.push(round);
    }
    db.brackets.push(bracket);
    advance(db, bracket.id);
    return;
  }
  if (action === "score") {
    const g = db.games.find((g) => g.id === b.id);
    if (b.version !== undefined && b.version !== (g?.controlVersion || 0))
      fail("Game changed. Refresh before saving the scoresheet.", 409);
    if (g?.bracketId) {
      staff(u);
      if (!g.homeId || !g.awayId)
        fail("Both participants must advance before scoring.", 409);
      if (b.status === "Final" && b.homeScore === b.awayScore)
        fail("A playoff game cannot finish tied.");
    }
    baseMutate(db, u, action, b);
    if (g.clock) {
      g.clock.remainingSeconds = clockSeconds(g);
      g.clock.runningSince = null;
    }
    g.controlVersion = (g.controlVersion || 0) + 1;
    if (g?.bracketId) advance(db, g.bracketId);
    return;
  }
  if (action === "game-stats") {
    staff(u);
    const g = db.games.find((g) => g.id === b.gameId),
      p = db.players.find((p) => p.id === b.playerId);
    if (!g || !p || ![g.homeId, g.awayId].includes(p.teamId))
      fail("Player must belong to a participating team.");
    const row = {
      id:
        db.gameStats.find((s) => s.gameId === g.id && s.playerId === p.id)
          ?.id || id(),
      gameId: g.id,
      playerId: p.id,
    };
    for (const key of [
      "points",
      "rebounds",
      "assists",
      "steals",
      "blocks",
      "fouls",
    ])
      row[key] = integer(b[key], 0, key === "fouls" ? 6 : 200);
    db.gameStats = db.gameStats.filter(
      (s) => !(s.gameId === g.id && s.playerId === p.id),
    );
    db.gameStats.push(row);
    return;
  }
  if (action === "staff-profile") {
    coach(u);
    const profile = {
      userId: u.id,
      phone: text(b.phone, 40),
      emergencyContact: text(b.emergencyContact, 200),
      availability: text(b.availability, 1000),
      status: "Submitted",
      updatedAt: stamp(),
    };
    const existing = db.staffProfiles.find((p) => p.userId === u.id);
    if (existing) Object.assign(existing, profile);
    else db.staffProfiles.push(profile);
    return;
  }
  if (action === "staff-review") {
    if (u.role !== "admin") fail("Administrator access required.", 403);
    const p = db.staffProfiles.find((p) => p.userId === b.userId);
    if (!p) fail("Profile not found.", 404);
    if (
      b.status === "Approved" &&
      db.files.some(
        (f) =>
          f.purpose === "staff" &&
          !f.retired &&
          f.ownerId === p.userId &&
          f.expiresOn &&
          f.expiresOn < new Date().toISOString().slice(0, 10),
      )
    )
      fail("Renew expired staff documents before approval.", 409);
    p.status = pick(b.status, ["Submitted", "Approved", "Needs changes"]);
    p.reviewNote = optional(b.reviewNote, 1000);
    p.reviewedAt = stamp();
    return;
  }
  if (action === "rsvp" || action === "checkin") {
    if (db.events.find((e) => e.id === b.eventId)?.status === "Cancelled")
      fail("This session has been cancelled.", 409);
  }
  baseMutate(db, u, action, b);
}

function validateRoutes(routes, frames, players) {
  if (!Array.isArray(routes) || routes.length > 200)
    fail("Too many movement routes.");
  return routes.map((r) => ({
    frame: integer(r.frame, 0, frames - 1),
    player: integer(r.player, 0, players - 1),
    kind: ["cut", "dribble", "pass"].includes(r.kind)
      ? r.kind
      : fail("Invalid route type."),
    x: integer(r.x, 0, 100),
    y: integer(r.y, 0, 100),
  }));
}
