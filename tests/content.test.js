import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
import { eligibility } from "../server/registration.js";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    admin: db.users.find((u) => u.role === "admin"),
    parent: db.users.find((u) => u.role === "parent"),
    staff: db.users.find((u) => u.role === "staff"),
  };
};
test("content publishing is admin-only, versioned, scoped to real targets and resettable", () => {
  const { db, admin, parent, staff } = setup(),
    b = {
      id: "hero",
      version: 0,
      title: "New title",
      description: "New intro",
    };
  for (const u of [parent, staff])
    assert.throws(() => mutate(db, u, "content-publish", b), /Administrator/);
  assert.throws(
    () => mutate(db, admin, "content-publish", { ...b, id: "product:missing" }),
    /existing/,
  );
  mutate(db, admin, "content-publish", b);
  assert.equal(visible(db, parent).siteContent[0].title, b.title);
  assert.throws(() => mutate(db, admin, "content-publish", b), /changed/);
  assert.throws(
    () =>
      mutate(db, admin, "content-publish", {
        ...b,
        version: 1,
        title: "x".repeat(121),
      }),
    /valid text/,
  );
  db.files.push({ id: "secret", purpose: "staff", ownerId: admin.id });
  assert.throws(
    () =>
      mutate(db, admin, "content-publish", {
        ...b,
        version: 1,
        imageId: "secret",
        alt: "Private doc",
      }),
    /content photo/,
  );
  mutate(db, admin, "content-publish", { id: "hero", version: 1, reset: true });
  assert.equal(db.siteContent[0].title, "");
  assert.equal(db.siteContent[0].version, 2);
});
test("program archive preserves history and blocks new enrollment and waitlist offers", () => {
  const { db, admin, parent } = setup(),
    p = db.programs[0],
    before = structuredClone(db.enrollments);
  assert.throws(
    () => mutate(db, parent, "program-archive", { id: p.id }),
    /Staff/,
  );
  mutate(db, admin, "program-archive", { id: p.id });
  assert.deepEqual(db.enrollments, before);
  assert.throws(
    () => eligibility(db, parent, { programId: p.id, playerId: "p1" }),
    /closed/,
  );
  assert.throws(
    () =>
      mutate(db, parent, "waitlist-join", { programId: p.id, playerId: "p1" }),
    /closed/,
  );
  db.waitlist.push({
    id: "wait-test",
    programId: p.id,
    playerId: "p1",
    status: "Waiting",
    queueOrder: 1,
  });
  assert.throws(
    () => mutate(db, admin, "waitlist-offer", { id: "wait-test" }),
    /Restore/,
  );
  mutate(db, admin, "program-restore", { id: p.id });
  assert.equal(p.archivedAt, null);
  assert.deepEqual(db.enrollments, before);
});
test("HTTP content photos reject unauthorized/non-images, publish and revoke family access, persist metadata", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "tbe-content-"));
  const child = spawn(process.execPath, ["server/index.js", "--production"], {
    env: {
      ...process.env,
      PORT: "4195",
      HOST: "127.0.0.1",
      APP_STAGE: "",
      APP_MODE: "demo",
      DATA_FILE: join(dir, "db.json"),
      MONGODB_URI: "",
      STRIPE_SECRET_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null)
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      });
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("startup timeout")), 15000);
    child.once("error", reject);
    child.stdout.on("data", (b) => {
      if (String(b).includes("http://")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  const base = "http://127.0.0.1:4195/api/";
  const post = async (path, body, token) => {
    const r = await fetch(base + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const admin = (await post("demo-session", { userId: "admin" })).body.token,
    parent = (await post("demo-session", { userId: "parent" })).body.token;
  const upload = (bytes, token) =>
    fetch(base + "files?purpose=content&name=photo.png", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Authorization: "Bearer " + token,
      },
      body: bytes,
    });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mAAAAABJRU5ErkJggg==",
    "base64",
  );
  assert.equal((await upload(png, parent)).status, 403);
  assert.equal((await upload(Buffer.from("%PDF-1.7 fake"), admin)).status, 400);
  assert.equal(
    (await upload(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), admin))
      .status,
    400,
  );
  const uploaded = await upload(png, admin);
  assert.equal(uploaded.status, 200);
  const f = await uploaded.json();
  const get = (token) =>
    fetch(base + "files/" + f.id, {
      headers: token ? { Authorization: "Bearer " + token } : {},
    });
  assert.equal((await get()).status, 401);
  assert.equal((await get(parent)).status, 404);
  assert.equal(
    (
      await post(
        "actions/content-publish",
        { id: "hero", version: 0, imageId: f.id, alt: "Test photo" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal((await get(parent)).status, 200);
  const saved = JSON.parse(await readFile(join(dir, "db.json"), "utf8"));
  assert.equal(saved.siteContent[0].imageId, f.id);
  assert.equal(
    (
      await post(
        "actions/content-publish",
        { id: "hero", version: 1, reset: true },
        admin,
      )
    ).status,
    200,
  );
  assert.equal((await get(parent)).status, 404);
  assert.equal((await get(admin)).status, 200);
});
