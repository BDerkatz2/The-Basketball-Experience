import { pipeline } from "node:stream/promises";
import { resolve, sep } from "node:path";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  GetPublicAccessBlockCommand,
} from "@aws-sdk/client-s3";
import { fail, id, channels } from "./domain.js";
import { applyRefund, cleanupCandidates } from "./operations.js";

export function mountOperations(
  app,
  {
    getDb,
    commit,
    serialize,
    stripe,
    uploadDir,
    store,
    cloudClientFactory = (options) => new S3Client(options),
  },
) {
  const admin = (u) => {
    if (u.role !== "admin") fail("Administrator access required.", 403);
  };
  const safePath = (file) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(file.id))
      fail("Invalid stored file identifier.", 409);
    const p = resolve(uploadDir, file.id);
    if (!p.startsWith(resolve(uploadDir) + sep))
      fail("Invalid file path.", 409);
    return p;
  };
  const s3 = () => {
    if (
      process.env.ENABLE_CLOUD_UPLOADS !== "true" ||
      !process.env.S3_BUCKET ||
      !process.env.AWS_REGION
    )
      fail("Private S3 uploads are not configured.", 503);
    return cloudClientFactory({ region: process.env.AWS_REGION });
  };
  function audit(db, u, action, targetId) {
    db.audit.push({
      id: id(),
      actorId: u.id,
      actor: u.name,
      action,
      targetId,
      createdAt: new Date().toISOString(),
    });
  }
  app.get("/api/media/:id/playback", async (req, res, next) => {
    let client;
    try {
      const db = getDb(),
        f = db.files.find(
          (f) => f.id === req.params.id && f.purpose === "video" && !f.purgedAt,
        );
      if (
        !f ||
        !channels(db, req.user).includes(f.teamId) ||
        !db.videos.some((v) => v.fileId === f.id && !v.deletedAt)
      )
        fail("Video not found.", 404);
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Type", f.type);
      if (f.cloudCopy?.status !== "copied") return res.sendFile(safePath(f));
      if (
        f.cloudCopy.bucket !== process.env.S3_BUCKET ||
        f.cloudCopy.region !== process.env.AWS_REGION
      )
        fail("Cloud destination needs administrator reconciliation.", 409);
      const range = req.headers.range;
      if (range && !/^bytes=(\d+-\d*|-\d+)$/.test(range))
        fail("Unsupported video byte range.", 416);
      client = s3();
      const obj = await client.send(
        new GetObjectCommand({
          Bucket: f.cloudCopy.bucket,
          Key: f.cloudCopy.key,
          ...(range ? { Range: range } : {}),
        }),
      );
      res.status(obj.ContentRange ? 206 : 200);
      res.set("Content-Type", f.type);
      res.set("Accept-Ranges", "bytes");
      if (obj.ContentLength != null)
        res.set("Content-Length", String(obj.ContentLength));
      if (obj.ContentRange) res.set("Content-Range", obj.ContentRange);
      await pipeline(obj.Body, res);
    } catch (e) {
      if (res.headersSent) res.destroy();
      else next(e);
    } finally {
      client?.destroy();
    }
  });
  app.get("/api/operations/status", (req, res, next) => {
    try {
      admin(req.user);
      const db = getDb();
      res.json({
        uptimeSeconds: Math.floor(process.uptime()),
        storage: store.kind,
        cloudConfigured:
          process.env.ENABLE_CLOUD_UPLOADS === "true" &&
          !!process.env.S3_BUCKET &&
          !!process.env.AWS_REGION,
        cleanup: cleanupCandidates(db).map((f) => ({
          id: f.id,
          name: f.name,
          size: f.size,
        })),
        pendingPurge: db.files.filter((f) => f.purgedAt && !f.bytesRemovedAt)
          .length,
        uncertainRefunds: db.refunds.filter((r) =>
          ["sending", "unknown"].includes(r.status),
        ).length,
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/refunds/:id/submit", (req, res, next) =>
    serialize(
      async () => {
        admin(req.user);
        if (!stripe) fail("Stripe test payments are not configured.", 503);
        let db = structuredClone(getDb()),
          r = db.refunds.find((r) => r.id === req.params.id);
        if (!r || r.status !== "approved")
          fail("Only an approved, unsent refund can be submitted.", 409);
        r.status = "sending";
        r.submittedAt = new Date().toISOString();
        audit(db, req.user, "refund-submit", r.id);
        await commit(db);
        try {
          const result = await stripe.refunds.create(
            {
              payment_intent: r.paymentIntent,
              amount: r.amountCents,
              reason: "requested_by_customer",
              metadata: { requestId: r.id },
            },
            { idempotencyKey: "refund-" + r.id },
          );
          db = structuredClone(getDb());
          applyRefund(db, result);
          await commit(db);
          return { status: db.refunds.find((x) => x.id === r.id).status };
        } catch (e) {
          db = structuredClone(getDb());
          db.refunds.find((x) => x.id === r.id).status = "unknown";
          await commit(db);
          fail(
            "Refund outcome is uncertain. Check Stripe and reconcile; do not submit another refund.",
            409,
          );
        }
      },
      res,
      next,
    ),
  );
  app.post("/api/refunds/:id/reconcile", (req, res, next) =>
    serialize(
      async () => {
        admin(req.user);
        if (!stripe) fail("Stripe test payments are not configured.", 503);
        const db = structuredClone(getDb()),
          r = db.refunds.find((r) => r.id === req.params.id);
        if (!r) fail("Refund not found.", 404);
        const providerId = r.providerId || req.body?.providerId;
        if (
          typeof providerId !== "string" ||
          !/^re_[a-zA-Z0-9]+$/.test(providerId)
        )
          fail("Enter the refund ID from Stripe.");
        const result = await stripe.refunds.retrieve(providerId);
        if (result.metadata?.requestId !== r.id)
          fail("Stripe refund belongs to a different request.", 409);
        applyRefund(db, result);
        audit(db, req.user, "refund-reconcile", r.id);
        await commit(db);
      },
      res,
      next,
    ),
  );
  app.post("/api/media/:id/cloud", (req, res, next) =>
    serialize(
      async () => {
        admin(req.user);
        const db = structuredClone(getDb()),
          f = db.files.find(
            (f) =>
              f.id === req.params.id && !f.purgedAt && f.purpose === "video",
          );
        if (!f || !db.videos.some((v) => v.fileId === f.id && !v.deletedAt))
          fail("Active video file not found.", 404);
        const client = s3();
        const key = "private/videos/" + f.id;
        if (
          f.cloudCopy &&
          (f.cloudCopy.bucket !== process.env.S3_BUCKET ||
            f.cloudCopy.region !== process.env.AWS_REGION)
        )
          fail(
            "Existing cloud destination differs; migrate it before changing configuration.",
            409,
          );
        try {
          const check = await client.send(
            new GetPublicAccessBlockCommand({ Bucket: process.env.S3_BUCKET }),
          );
          if (
            ![
              "BlockPublicAcls",
              "IgnorePublicAcls",
              "BlockPublicPolicy",
              "RestrictPublicBuckets",
            ].every((k) => check.PublicAccessBlockConfiguration?.[k] === true)
          )
            fail(
              "Enable all four S3 bucket public-access blocks before uploading.",
              409,
            );
          f.cloudCopy = {
            bucket: process.env.S3_BUCKET,
            region: process.env.AWS_REGION,
            key,
            status: "pending",
          };
          await commit(db);
          await client.send(
            new PutObjectCommand({
              Bucket: process.env.S3_BUCKET,
              Key: key,
              Body: createReadStream(safePath(f)),
              ContentLength: f.size,
              ContentType: f.type,
              ServerSideEncryption: "AES256",
              Metadata: { fileid: f.id },
            }),
          );
        } finally {
          client.destroy();
        }
        f.cloudCopy = {
          bucket: process.env.S3_BUCKET,
          region: process.env.AWS_REGION,
          key,
          status: "copied",
          copiedAt: new Date().toISOString(),
        };
        audit(db, req.user, "video-cloud-copy", f.id);
        await commit(db);
        return { copied: true };
      },
      res,
      next,
    ),
  );
  app.post("/api/media/cleanup", (req, res, next) =>
    serialize(
      async () => {
        admin(req.user);
        if (req.body?.confirm !== true) fail("Confirm permanent cleanup.");
        let db = structuredClone(getDb());
        const candidates = cleanupCandidates(db);
        for (const f of candidates) f.purgedAt = new Date().toISOString();
        audit(db, req.user, "video-cleanup", null);
        await commit(db);
        let removed = 0,
          failed = 0;
        for (const f of db.files.filter(
          (f) => f.purpose === "video" && f.purgedAt && !f.bytesRemovedAt,
        )) {
          try {
            if (f.cloudCopy) {
              if (
                f.cloudCopy.bucket !== process.env.S3_BUCKET ||
                f.cloudCopy.region !== process.env.AWS_REGION
              )
                fail("Cloud storage configuration changed.", 409);
              const client = s3();
              try {
                await client.send(
                  new DeleteObjectCommand({
                    Bucket: f.cloudCopy.bucket,
                    Key: f.cloudCopy.key,
                  }),
                );
              } finally {
                client.destroy();
              }
            }
            await unlink(safePath(f)).catch((e) => {
              if (e.code !== "ENOENT") throw e;
            });
            f.bytesRemovedAt = new Date().toISOString();
            removed++;
          } catch {
            failed++;
          }
        }
        await commit(db);
        return { removed, failed };
      },
      res,
      next,
    ),
  );
}
