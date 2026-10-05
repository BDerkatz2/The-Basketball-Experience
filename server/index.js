import express from "express";
import { mountOperations } from "./operations-api.js";
import { report } from "./reports.js";
import { importDriveVideo } from "./drive.js";
import {
  serviceStatus,
  registerDevice,
  sendDelivery,
  pushReceipt,
} from "./live-services.js";
import { processReminders } from "./reminders.js";
import {
  familyAccess,
  prepareMembership,
  checkoutParams,
  syncMembership,
  membershipEvent,
  terminal,
} from "./memberships.js";
import { issueLink, redeemLink } from "./account-links.js";
import { conversation } from "./communication.js";
import { readFile, writeFile, mkdir, rename, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { seed } from "./seed.js";
import { visible, mutate, upgrade, conflicts } from "./extended.js";
import { suggestSchedule } from "./scheduling.js";
import { assistSchedule } from "./schedule-ai.js";
import { isStaff, channels, fail, id, text } from "./domain.js";
import { createStore } from "./storage.js";
import {
  email,
  hashPassword,
  verifyPassword,
  register,
  newSession,
  digest,
  publicUser,
  limiter,
} from "./auth.js";
import { canInvoice, processPaymentEvent } from "./billing.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const accountMode = process.env.APP_MODE === "accounts";
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  if (!process.env.STRIPE_SECRET_KEY.startsWith("sk_test_"))
    throw new Error(
      "Only Stripe test-mode keys are supported until launch validation is complete.",
    );
  const { default: Stripe } = await import("stripe");
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}
const dataPath = resolve(
  process.env.DATA_FILE ||
    resolve(root, accountMode ? "data/accounts.json" : "data/demo.json"),
);
const initial = upgrade(seed());
if (accountMode)
  for (const key of Object.keys(initial))
    if (Array.isArray(initial[key])) initial[key] = [];
initial.authSessions = [];
if (!accountMode && process.env.MONGODB_URI)
  throw new Error("MongoDB requires APP_MODE=accounts. Demo data stays local.");
const store = await createStore({ path: dataPath, initial });
let db = await store.load();
db.authSessions ??= [];
if (accountMode && db.users.some((u) => !u.passwordHash))
  throw new Error(
    "Account mode cannot use sample-user data. Choose a separate data file/database.",
  );
if (accountMode && !db.users.length && process.env.BOOTSTRAP_ADMIN_EMAIL) {
  const passwordHash = await hashPassword(process.env.BOOTSTRAP_ADMIN_PASSWORD);
  db.users.push({
    id: id(),
    name: process.env.BOOTSTRAP_ADMIN_NAME || "Administrator",
    email: email(process.env.BOOTSTRAP_ADMIN_EMAIL),
    role: "admin",
    passwordHash,
  });
  await store.save(db);
}
upgrade(db);
const uploadDir = resolve(dirname(dataPath), "uploads");
await mkdir(uploadDir, { recursive: true });
const app = express();
let storageHealthy = true;
app.get("/api/ready", (_req, res) =>
  res.status(storageHealthy ? 200 : 503).json({ ready: storageHealthy }),
);
app.disable("x-powered-by");
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  (req, res, next) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
      return res
        .status(503)
        .json({ error: "Stripe test webhooks are not configured." });
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        process.env.STRIPE_WEBHOOK_SECRET,
      );
      if (event.livemode !== false)
        return res
          .status(400)
          .json({ error: "Only Stripe test events are accepted." });
    } catch {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }
    serialize(
      async () => {
        const nextDb = structuredClone(db);
        if (!(await membershipEvent(nextDb, event, stripe)))
          processPaymentEvent(nextDb, event);
        await commit(nextDb);
      },
      res,
      next,
    );
  },
);
app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  );
  if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "no-store");
  next();
});
const sessions = new Map();
const streams = new Map();
app.get("/api/health", (_, res) =>
  res.json({
    ok: true,
    mode: accountMode ? "accounts" : "local-demo",
    storage: store.kind,
  }),
);
app.get("/api/config", (_, res) =>
  res.json({
    mode: accountMode ? "accounts" : "local-demo",
    payments: stripe ? "stripe-test" : "not-connected",
  }),
);
app.get("/api/demo-users", (_, res) =>
  accountMode
    ? res.status(404).json({ error: "Demo sign-in is disabled." })
    : res.json(db.users.map(({ id, name, role }) => ({ id, name, role }))),
);
app.post("/api/demo-session", (req, res) => {
  if (accountMode)
    return res.status(404).json({ error: "Demo sign-in is disabled." });
  const u = db.users.find((x) => x.id === req.body?.userId);
  if (!u) return res.status(400).json({ error: "Choose a demo account." });
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId: u.id, expires: Date.now() + 8 * 3600000 });
  res.json({ token, user: publicUser(u) });
});
app.use("/api/auth", limiter());
app.post("/api/auth/redeem-link", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode) fail("Account links are disabled in demo mode.", 403);
      const nextDb = structuredClone(db);
      const result = await redeemLink(nextDb, req.body || {});
      await commit(nextDb);
      return result;
    },
    res,
    next,
  ),
);
app.post("/api/auth/recovery-request", (req, res) =>
  res.json({
    ok: true,
    message:
      "Email recovery is not connected. Contact your organization administrator, who can verify your identity and issue a single-use reset link.",
  }),
);
app.post("/api/auth/register", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode)
        fail("Account registration is disabled in demo mode.", 403);
      const nextDb = structuredClone(db);
      const user = await register(nextDb, req.body);
      const result = newSession(nextDb, user);
      await commit(nextDb);
      return result;
    },
    res,
    next,
  ),
);
app.post("/api/auth/login", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode) fail("Use a demo account.", 403);
      const address = email(req.body?.email),
        user = db.users.find((u) => u.email === address);
      const valid = await verifyPassword(
        req.body?.password,
        user?.passwordHash ||
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!valid || !user) fail("Email or password is incorrect.", 401);
      const nextDb = structuredClone(db);
      const result = newSession(nextDb, user);
      await commit(nextDb);
      return result;
    },
    res,
    next,
  ),
);
const sessionFor = (token) =>
  token
    ? accountMode
      ? db.authSessions.find((s) => s.id === digest(token))
      : sessions.get(token)
    : null;
app.use("/api", (req, res, next) => {
  const s = sessionFor(req.headers.authorization?.replace(/^Bearer /, ""));
  if (!s || s.expires < Date.now())
    return res.status(401).json({ error: "Sign in to continue." });
  req.user = db.users.find((u) => u.id === s.userId);
  if (!req.user) return res.status(401).json({ error: "Account unavailable." });
  next();
});
app.get("/api/state", (req, res) =>
  res.json({
    user: publicUser(req.user),
    mode: accountMode ? "accounts" : "local-demo",
    ...visible(db, req.user),
  }),
);
app.get("/api/reports/:kind", (req, res, next) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(report(db, req.user, req.params.kind));
  } catch (e) {
    next(e);
  }
});
app.get("/api/services", (req, res, next) => {
  try {
    if (!isStaff(req.user)) fail("Staff access required.", 403);
    res.json(serviceStatus());
  } catch (e) {
    next(e);
  }
});
app.post("/api/devices/register", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode) fail("Phone push requires account mode.", 409);
      const d = structuredClone(db);
      registerDevice(d, req.user, req.body.token);
      await commit(d);
    },
    res,
    next,
  ),
);
app.post("/api/devices/remove", (req, res, next) =>
  serialize(
    async () => {
      const d = structuredClone(db);
      d.pushDevices = d.pushDevices.filter((p) => p.userId !== req.user.id);
      await commit(d);
    },
    res,
    next,
  ),
);
app.post("/api/services/stripe-check", async (req, res, next) => {
  try {
    if (req.user.role !== "admin") fail("Administrator access required.", 403);
    if (!stripe) fail("Stripe test credentials are not configured.", 503);
    const balance = await stripe.balance.retrieve();
    if (balance.livemode !== false) fail("Expected Stripe test mode.", 409);
    res.json({
      message:
        "Stripe test API credentials verified. Webhook configuration: " +
        (process.env.STRIPE_WEBHOOK_SECRET ? "present" : "missing") +
        ". A signed checkout and renewal test is still required; this check does not charge a card.",
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/services/send-pending", (req, res, next) =>
  serialize(
    async () => {
      if (req.user.role !== "admin")
        fail("Administrator access required.", 403);
      if (!serviceStatus().externalDeliveryEnabled)
        fail("Enable external delivery in account mode first.", 503);
      let d = structuredClone(db);
      processReminders(d);
      await commit(d);
      let count = 0;
      for (const job of db.deliveryQueue
        .filter((j) => j.status === "waiting-provider")
        .slice(0, 10)) {
        const user = db.users.find((u) => u.id === job.userId),
          note = db.notifications.find((n) => n.id === job.notificationId),
          device = db.pushDevices.find((p) => p.userId === job.userId),
          status = serviceStatus();
        if (
          job.channel === "email"
            ? !status.email || !user?.email
            : !status.push || !device
        )
          continue;
        // Persist the claim before contacting a provider. A crash remains 'sending'
        // for manual investigation, never an automatic duplicate phone alert.
        d = structuredClone(db);
        let row = d.deliveryQueue.find((j) => j.id === job.id);
        row.status = "sending";
        row.attempts++;
        await commit(d);
        let outcome;
        try {
          outcome = await sendDelivery(job, user, note, device);
        } catch {
          outcome = {
            status: "unknown",
            lastError:
              "Acceptance was not confirmed. Inspect the provider dashboard; automatic retry is disabled to prevent duplicates.",
          };
        }
        d = structuredClone(db);
        row = d.deliveryQueue.find((j) => j.id === job.id);
        Object.assign(row, outcome, { attemptedAt: new Date().toISOString() });
        await commit(d);
        count++;
      }
      return {
        message: `${count} requests processed. Provider acceptance does not confirm inbox or phone delivery.`,
      };
    },
    res,
    next,
  ),
);
app.post("/api/services/push-receipts", (req, res, next) =>
  serialize(
    async () => {
      if (req.user.role !== "admin")
        fail("Administrator access required.", 403);
      if (!serviceStatus().push) fail("Expo is not configured.", 503);
      const d = structuredClone(db);
      for (const row of d.deliveryQueue
        .filter((j) => j.channel === "push" && j.status === "provider-accepted")
        .slice(0, 100)) {
        const result = await pushReceipt(row.providerId);
        if (!result) continue;
        if (result.invalidDevice)
          d.pushDevices = d.pushDevices.filter((p) => p.userId !== row.userId);
        Object.assign(row, result);
      }
      await commit(d);
      return {
        message:
          "Available Expo receipts checked. A successful receipt confirms handoff to Apple/Google, not that the user read the alert.",
      };
    },
    res,
    next,
  ),
);
app.get("/api/account-links", (req, res, next) => {
  try {
    if (!accountMode || req.user.role !== "admin")
      fail("Administrator account mode required.", 403);
    res.json({ links: db.accountLinks.map(({ tokenHash, ...row }) => row) });
  } catch (e) {
    next(e);
  }
});
app.post("/api/account-links", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode) fail("Account links are disabled in demo mode.", 403);
      const nextDb = structuredClone(db);
      const result = issueLink(nextDb, req.user, req.body || {});
      await commit(nextDb);
      return result;
    },
    res,
    next,
  ),
);
app.post("/api/account-links/:id/revoke", (req, res, next) =>
  serialize(
    async () => {
      if (!accountMode || req.user.role !== "admin")
        fail("Administrator account mode required.", 403);
      const nextDb = structuredClone(db),
        row = nextDb.accountLinks.find((l) => l.id === req.params.id);
      if (!row) fail("Link not found.", 404);
      row.revoked = true;
      await commit(nextDb);
    },
    res,
    next,
  ),
);
app.post("/api/billing/checkout", (req, res, next) =>
  serialize(
    async () => {
      if (!stripe) fail("Stripe test payments are not configured yet.", 503);
      const invoice = db.invoices.find((i) => i.id === req.body?.invoiceId);
      if (!invoice || !canInvoice(req.user, invoice))
        fail("Invoice not found.", 404);
      if (invoice.sourceType === "membership")
        fail("Manage recurring payments through the membership controls.", 409);
      if (invoice.status !== "Unpaid")
        fail("This invoice is not payable.", 409);
      if (invoice.checkoutSessionId) {
        const previous = await stripe.checkout.sessions.retrieve(
          invoice.checkoutSessionId,
        );
        if (previous.status === "open") return { url: previous.url };
        if (previous.payment_status === "paid")
          fail(
            "Payment is awaiting webhook reconciliation. A second checkout is blocked.",
            409,
          );
        if (
          previous.status === "complete" &&
          invoice.recoveryStatus !== "Payment failed"
        )
          fail(
            "Payment confirmation is still being reconciled. Please refresh shortly.",
            409,
          );
        if (previous.status === "complete") {
          const paymentIntent =
            typeof previous.payment_intent === "string"
              ? await stripe.paymentIntents.retrieve(previous.payment_intent)
              : previous.payment_intent;
          if (
            !paymentIntent ||
            !["canceled", "requires_payment_method"].includes(
              paymentIntent.status,
            )
          )
            fail(
              "The earlier payment may still be processing. Reconcile it before retrying.",
              409,
            );
        }
      }
      const base =
        process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 4173}`;
      const origin = new URL(base);
      if (!["http:", "https:"].includes(origin.protocol))
        fail("Invalid application URL.", 500);
      const attempt = (invoice.checkoutAttempt || 0) + 1;
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: invoice.currency,
                unit_amount: invoice.amountCents,
                product_data: { name: invoice.description },
              },
              quantity: 1,
            },
          ],
          metadata: { invoiceId: invoice.id, familyId: invoice.familyId },
          payment_intent_data: {
            metadata: {
              invoiceId: invoice.id,
              familyId: invoice.familyId,
              attempt: String(attempt),
            },
          },
          success_url: origin.origin + "/?payment=received",
          cancel_url: origin.origin + "/?payment=cancelled",
        },
        { idempotencyKey: `invoice-${invoice.id}-${attempt}` },
      );
      const nextDb = structuredClone(db),
        nextInvoice = nextDb.invoices.find((i) => i.id === invoice.id);
      nextInvoice.checkoutSessionId = session.id;
      nextInvoice.checkoutAttempt = attempt;
      nextInvoice.recoveryStatus = "Checkout opened";
      await commit(nextDb);
      return { url: session.url };
    },
    res,
    next,
  ),
);
app.post("/api/memberships/checkout", (req, res, next) =>
  serialize(
    async () => {
      if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET)
        fail(
          "Stripe test checkout and webhooks must be configured first.",
          503,
        );
      const nextDb = structuredClone(db),
        m = prepareMembership(nextDb, req.user, req.body || {});
      if (m.subscriptionId && !terminal(m))
        fail(
          "This membership already has a subscription. Refresh its status or manage renewal.",
          409,
        );
      await commit(nextDb); // Persist stable idempotency identity before contacting Stripe.
      if (m.checkoutSessionId) {
        const old = await stripe.checkout.sessions.retrieve(
          m.checkoutSessionId,
        );
        if (old.status === "open") return { url: old.url };
        if (old.status === "complete")
          fail("Checkout completed. Refresh membership status shortly.", 409);
        const updated = structuredClone(db),
          row = updated.memberships.find((x) => x.id === m.id);
        row.attempt++;
        row.checkoutSessionId = null;
        await commit(updated);
      }
      const row = db.memberships.find((x) => x.id === m.id);
      const origin = new URL(
        process.env.APP_URL || `http://127.0.0.1:${process.env.PORT || 4173}`,
      ).origin;
      const session = await stripe.checkout.sessions.create(
        checkoutParams(row, origin),
        { idempotencyKey: `membership-${row.id}-${row.attempt}` },
      );
      const saved = structuredClone(db);
      saved.memberships.find((x) => x.id === row.id).checkoutSessionId =
        session.id;
      await commit(saved);
      return { url: session.url };
    },
    res,
    next,
  ),
);
app.post("/api/memberships/:id/manage", (req, res, next) =>
  serialize(
    async () => {
      if (!stripe) fail("Stripe test mode is not connected.", 503);
      const m = db.memberships.find((x) => x.id === req.params.id);
      if (!m) fail("Membership not found.", 404);
      familyAccess(db, req.user, m.familyId);
      let subscriptionId = m.subscriptionId;
      if (!subscriptionId && m.checkoutSessionId) {
        const session = await stripe.checkout.sessions.retrieve(
          m.checkoutSessionId,
        );
        subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
      }
      if (!subscriptionId) fail("Checkout is not complete yet.", 409);
      const operation = req.body?.operation;
      if (!["refresh", "cancel", "resume"].includes(operation))
        fail("Choose refresh, cancel or resume.");
      let sub = await stripe.subscriptions.retrieve(subscriptionId);
      const nextDb = structuredClone(db);
      if (!syncMembership(nextDb, sub)) fail("Subscription not found.", 409);
      if (operation !== "refresh") {
        if (!["active", "trialing", "past_due"].includes(sub.status))
          fail("This subscription cannot change renewal settings.", 409);
        sub = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: operation === "cancel",
        });
        syncMembership(nextDb, sub);
      }
      await commit(nextDb);
    },
    res,
    next,
  ),
);
app.get("/api/stream", (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "");
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  res.write("data: ready\n\n");
  const set = streams.get(token) || new Set();
  set.add(res);
  streams.set(token, set);
  const timer = setInterval(() => {
    if (!sessionFor(token) || sessionFor(token).expires < Date.now()) res.end();
    else res.write(": heartbeat\n\n");
  }, 20000);
  req.on("close", () => {
    clearInterval(timer);
    set.delete(res);
    if (!set.size) streams.delete(token);
  });
});
app.post("/api/logout", (req, res, next) =>
  serialize(
    async () => {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (accountMode) {
        const nextDb = structuredClone(db);
        nextDb.authSessions = nextDb.authSessions.filter(
          (s) => s.id !== digest(token),
        );
        nextDb.pushDevices = nextDb.pushDevices.filter(
          (p) => p.userId !== req.user.id,
        );
        await commit(nextDb);
      } else sessions.delete(token);
      for (const client of streams.get(token) || []) client.end();
      streams.delete(token);
    },
    res,
    next,
  ),
);
let queue = Promise.resolve();
const reminderTimer = setInterval(() => {
  const run = queue.then(async () => {
    const nextDb = structuredClone(db);
    if (processReminders(nextDb)) await commit(nextDb);
  });
  queue = run.catch(() => {
    console.error(
      "Reminder processing failed; it will retry on the next interval.",
    );
  });
}, 60000);
reminderTimer.unref();
async function commit(nextDb) {
  try {
    await store.save(nextDb);
    storageHealthy = true;
  } catch (e) {
    storageHealthy = false;
    if (e.status === 409) db = upgrade(await store.load());
    throw e;
  }
  db = nextDb;
  for (const [token, clients] of streams) {
    if (sessionFor(token)?.expires > Date.now())
      for (const client of clients) client.write("data: changed\n\n");
  }
}
function serialize(fn, res, next) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  run.then((value) => res.json(value || { ok: true })).catch(next);
}
app.post("/api/drive/import", (req, res, next) =>
  serialize(
    async () => {
      if (!isStaff(req.user))
        fail("Staff access required to import from the club Drive.", 403);
      if (!db.teams.some((t) => t.id === req.body.teamId))
        fail("Choose an existing team.");
      const imported = await importDriveVideo(req.body.fileId);
      const file = {
        id: id(),
        name: imported.name,
        type: imported.type,
        size: imported.bytes.length,
        purpose: "video",
        ownerId: req.user.id,
        teamId: req.body.teamId,
        createdAt: new Date().toISOString(),
      };
      const path = resolve(uploadDir, file.id);
      await writeFile(path, imported.bytes, { flag: "wx" });
      try {
        const d = structuredClone(db);
        d.files.push(file);
        mutate(d, req.user, "video-save", {
          name: file.name,
          fileId: file.id,
          teamId: file.teamId,
        });
        await commit(d);
      } catch (e) {
        await unlink(path);
        throw e;
      }
      return { ok: true };
    },
    res,
    next,
  ),
);
app.post("/api/schedule/preview", (req, res, next) => {
  try {
    res.json(suggestSchedule(db, req.user, req.body, conflicts));
  } catch (e) {
    next(e);
  }
});
const aiRequests = new Map();
app.post("/api/schedule/assist", async (req, res, next) => {
  try {
    if (!isStaff(req.user)) fail("Staff access required.", 403);
    const now = Date.now();
    if ((aiRequests.get(req.user.id) || 0) > now - 10000)
      fail("Wait a few seconds before another AI request.", 429);
    aiRequests.set(req.user.id, now);
    res.json(await assistSchedule(db, req.user, req.body, conflicts));
  } catch (e) {
    next(e);
  }
});
mountOperations(app, {
  getDb: () => db,
  commit,
  serialize,
  stripe,
  uploadDir,
  store,
});
app.post("/api/actions/:action", (req, res, next) =>
  serialize(
    async () => {
      const nextDb = structuredClone(db);
      mutate(nextDb, req.user, req.params.action, req.body);
      await commit(nextDb);
    },
    res,
    next,
  ),
);
app.post(
  "/api/files",
  express.raw({ type: "application/octet-stream", limit: "100mb" }),
  (req, res, next) =>
    serialize(
      async () => {
        const purpose = req.query.purpose;
        if (!["video", "staff", "message"].includes(purpose))
          fail("Choose a file purpose.");
        if (
          purpose !== "message" &&
          !isStaff(req.user) &&
          req.user.role !== "coach"
        )
          fail("Coach or staff access required.", 403);
        if (purpose === "message")
          conversation(db, req.user, req.query.channel);
        if (
          purpose === "video" &&
          !channels(db, req.user).includes(req.query.teamId)
        )
          fail("Team access denied.", 403);
        if (!Buffer.isBuffer(req.body) || !req.body.length)
          fail("Upload a file.");
        const bytes = req.body;
        let type = "";
        if (bytes.subarray(0, 5).toString() === "%PDF-")
          type = "application/pdf";
        else if (
          bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        )
          type = "image/png";
        else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
          type = "image/jpeg";
        else if (bytes.subarray(4, 8).toString() === "ftyp") type = "video/mp4";
        else if (bytes.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
          type = "video/webm";
        if (
          purpose === "video"
            ? !type.startsWith("video/")
            : !["application/pdf", "image/png", "image/jpeg"].includes(type)
        )
          fail("Upload MP4/WebM video or PDF/PNG/JPEG documents.");
        if (purpose !== "video" && bytes.length > 10 * 1024 * 1024)
          fail("Documents must be 10 MB or smaller.");
        const uploadKey = req.get("X-Upload-Key");
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (uploadKey && !/^[a-zA-Z0-9_-]{8,100}$/.test(uploadKey))
          fail("Invalid upload key.");
        if (uploadKey) {
          const prior = db.files.find(
            (f) => f.ownerId === req.user.id && f.uploadKey === uploadKey,
          );
          if (prior) {
            if (
              prior.digest !== digest ||
              prior.purpose !== purpose ||
              prior.teamId !== (req.query.teamId || null) ||
              prior.channel !== (req.query.channel || null)
            )
              fail(
                "Upload key already used for another file or destination.",
                409,
              );
            return prior;
          }
        }
        const file = {
          uploadKey,
          digest,
          id: id(),
          name: text(req.query.name, 160),
          type,
          size: bytes.length,
          purpose,
          ownerId: req.user.id,
          channel: purpose === "message" ? req.query.channel : null,
          teamId: purpose === "video" ? req.query.teamId : null,
          createdAt: new Date().toISOString(),
        };
        const path = resolve(uploadDir, file.id);
        await writeFile(path, bytes, { flag: "wx" });
        try {
          const nextDb = structuredClone(db);
          nextDb.files.push(file);
          if (purpose === "staff") {
            const profile = nextDb.staffProfiles.find(
              (p) => p.userId === req.user.id,
            );
            if (profile) {
              profile.status = "Submitted";
              profile.reviewNote = "New document uploaded; review required.";
            }
          }

          nextDb.audit.push({
            id: id(),
            actorId: req.user.id,
            actor: req.user.name,
            action: "file-upload",
            targetId: file.id,
            createdAt: file.createdAt,
          });
          await commit(nextDb);
        } catch (e) {
          await unlink(path);
          throw e;
        }
        return file;
      },
      res,
      next,
    ),
);
app.get("/api/files/:id", (req, res, next) => {
  const file = visible(db, req.user).files.find((f) => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: "File not found." });
  res.set("Content-Type", file.type);
  res.set("Cache-Control", "private, no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", `attachment; filename="${file.id}"`);
  res.sendFile(resolve(uploadDir, file.id));
});
app.get("/api/export/:type", (req, res) => {
  const data = visible(db, req.user);
  if (req.params.type === "waivers") {
    if (!["admin", "staff", "parent"].includes(req.user.role))
      return res
        .status(403)
        .json({ error: "Parent or staff access required." });
    return res
      .type("application/json")
      .attachment("waiver-records.json")
      .send(
        JSON.stringify(
          { exportedAt: new Date().toISOString(), records: data.waivers },
          null,
          2,
        ),
      );
  }
  if (req.params.type === "calendar") {
    const escape = (s) =>
      String(s)
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/,/g, "\\,")
        .replace(/;/g, "\\;");
    const utc = (s) =>
      new Date(s)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TBE//Family calendar//EN",
    ];
    for (const e of data.events.filter((e) => e.status !== "Cancelled"))
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.id}@basketball-experience`,
        `DTSTAMP:${utc(new Date())}`,
        `DTSTART:${utc(e.start)}`,
        `DTEND:${utc(+new Date(e.start) + e.minutes * 60000)}`,
        `SUMMARY:${escape(e.title)}`,
        `LOCATION:${escape(e.location)}`,
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    res
      .type("text/calendar")
      .attachment("basketball-calendar.ics")
      .send(lines.join("\r\n"));
    return;
  }
  if (!isStaff(req.user))
    return res.status(403).json({ error: "Staff access required." });
  const csv = (v) =>
    '"' +
    String(v ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  let rows;
  if (req.params.type === "orders")
    rows = [
      [
        "Order",
        "Player",
        "Coach",
        "Product",
        "Color",
        "Size",
        "Quantity",
        "Total CAD",
        "Status",
      ],
      ...data.orders.map((o) => [
        o.id,
        data.players.find((p) => p.id === o.playerId)?.name,
        o.coach,
        data.products.find((p) => p.id === o.productId)?.name,
        o.color || data.products.find((p) => p.id === o.productId)?.color || "",
        o.size,
        o.quantity,
        o.total,
        o.status,
      ]),
    ];
  else if (req.params.type === "attendance")
    rows = [
      ["Session", "Player", "Present"],
      ...data.attendance.map((a) => [
        data.events.find((e) => e.id === a.eventId)?.title,
        data.players.find((p) => p.id === a.playerId)?.name,
        a.present ? "Yes" : "No",
      ]),
    ];
  else return res.status(404).json({ error: "Report not found." });
  res
    .type("text/csv")
    .attachment(req.params.type + ".csv")
    .send(rows.map((r) => r.map(csv).join(",")).join("\r\n"));
});
app.use("/api", (_, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
if (process.argv.includes("--production")) {
  app.use(express.static(resolve(root, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(resolve(root, "dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.status ? err.message : "Something went wrong. Please try again.",
  });
  if (!err.status) console.error(err);
});
const server = app.listen(
  Number(process.env.PORT || 4173),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      "The Basketball Experience: http://127.0.0.1:" +
        (process.env.PORT || 4173) +
        ` (${accountMode ? "accounts" : "local demo"}, ${store.kind} storage)`,
    ),
);
server.on("error", (err) => {
  console.error(err.message);
  process.exitCode = 1;
});
