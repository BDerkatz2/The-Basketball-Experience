import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, visible } from "../server/extended.js";
import { issueLink, redeemLink } from "../server/account-links.js";
import { newSession, verifyPassword } from "../server/auth.js";
const setup = () => {
  const db = upgrade(seed());
  return { db, admin: db.users.find((u) => u.role === "admin") };
};
test("invitation role and family are server bound; secrets excluded and link single use", async () => {
  const { db, admin } = setup();
  const r = issueLink(db, admin, {
    kind: "invite",
    email: "new@example.test",
    name: "New parent",
    role: "parent",
    familyId: "f1",
  });
  assert.equal(JSON.stringify(db).includes(r.token), false);
  assert.equal(visible(db, admin).accountLinks, undefined);
  await redeemLink(db, {
    token: r.token,
    password: "A long test password 123",
    role: "admin",
    familyId: "f2",
  });
  const u = db.users.find((u) => u.email === "new@example.test");
  assert.equal(u.role, "parent");
  assert.equal(u.familyId, "f1");
  await assert.rejects(
    redeemLink(db, { token: r.token, password: "Another password 123" }),
    /invalid or expired/,
  );
});
test("reset revokes all sessions and reissued links invalidate earlier links", async () => {
  const { db, admin } = setup();
  admin.email = "admin@example.test";
  newSession(db, admin);
  newSession(db, admin);
  const a = issueLink(db, admin, { kind: "reset", email: admin.email });
  const b = issueLink(db, admin, { kind: "reset", email: admin.email });
  await assert.rejects(
    redeemLink(db, { token: a.token, password: "A long test password 123" }),
    /invalid or expired/,
  );
  await redeemLink(db, { token: b.token, password: "A new test password 123" });
  assert.equal(db.authSessions.length, 0);
  assert.equal(
    await verifyPassword("A new test password 123", admin.passwordHash),
    true,
  );
});
test("invitations reject privilege escalation, wrong family and duplicate player accounts", () => {
  const { db, admin } = setup();
  const b = {
    kind: "invite",
    email: "new@example.test",
    name: "New",
    role: "parent",
    familyId: "f1",
  };
  assert.throws(() => issueLink(db, { role: "staff" }, b), /Administrator/);
  assert.throws(
    () => issueLink(db, admin, { ...b, role: "admin" }),
    /supported role/,
  );
  assert.throws(
    () => issueLink(db, admin, { ...b, familyId: "missing" }),
    /existing family/,
  );
  assert.throws(
    () => issueLink(db, admin, { ...b, role: "player", playerId: "p1" }),
    /already has/,
  );
});
test("expired and revoked links cannot change passwords", async () => {
  const { db, admin } = setup();
  admin.email = "admin@example.test";
  const a = issueLink(db, admin, { kind: "reset", email: admin.email });
  db.accountLinks[0].expires = 0;
  await assert.rejects(
    redeemLink(db, { token: a.token, password: "A long test password 123" }),
    /invalid or expired/,
  );
  const b = issueLink(db, admin, { kind: "reset", email: admin.email });
  db.accountLinks.at(-1).revoked = true;
  await assert.rejects(
    redeemLink(db, { token: b.token, password: "A long test password 123" }),
    /invalid or expired/,
  );
});
