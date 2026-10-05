import { randomBytes } from "node:crypto";
import { digest, email, hashPassword } from "./auth.js";
import { fail, id, text } from "./domain.js";

export function issueLink(db, actor, b) {
  if (actor.role !== "admin") fail("Administrator access required.", 403);
  const address = email(b.email),
    user = db.users.find((u) => u.email === address);
  if (!["invite", "reset"].includes(b.kind))
    fail("Choose invitation or reset.");
  if (b.kind === "reset" && !user) fail("Account not found.", 404);
  if (b.kind === "invite" && user) fail("Account already exists.", 409);
  const details = {};
  if (b.kind === "invite") {
    if (!["parent", "player", "coach", "staff"].includes(b.role))
      fail("Choose a supported role.");
    details.role = b.role;
    details.name = text(b.name, 100);
    if (["parent", "player"].includes(b.role)) {
      if (!db.families.some((f) => f.id === b.familyId))
        fail("Choose an existing family.");
      details.familyId = b.familyId;
    }
    if (b.role === "player") {
      if (
        !db.players.some(
          (p) => p.id === b.playerId && p.familyId === b.familyId,
        )
      )
        fail("Choose a player in that family.");
      if (db.users.some((u) => u.playerId === b.playerId))
        fail("This player already has an account.");
      details.playerId = b.playerId;
    }
    if (b.role === "coach") {
      if (
        !Array.isArray(b.teamIds) ||
        b.teamIds.some((t) => !db.teams.some((x) => x.id === t))
      )
        fail("Choose valid teams.");
      details.teamIds = [...new Set(b.teamIds)];
    }
  }
  db.accountLinks ??= [];
  for (const link of db.accountLinks)
    if (link.email === address && link.kind === b.kind && !link.usedAt)
      link.revoked = true;
  const token = randomBytes(32).toString("hex");
  const row = {
    id: id(),
    tokenHash: digest(token),
    kind: b.kind,
    email: address,
    userId: user?.id,
    ...details,
    createdAt: new Date().toISOString(),
    expires: Date.now() + (b.kind === "reset" ? 30 * 60000 : 48 * 3600000),
    actorId: actor.id,
  };
  db.accountLinks.push(row);
  return { id: row.id, token, kind: row.kind, expires: row.expires };
}
export async function redeemLink(db, b) {
  if (typeof b.token !== "string" || !/^[a-f0-9]{64}$/.test(b.token))
    fail("This link is invalid or expired.", 400);
  const link = (db.accountLinks || []).find(
    (l) => l.tokenHash === digest(b.token),
  );
  if (!link || link.revoked || link.usedAt || link.expires <= Date.now())
    fail("This link is invalid or expired.", 400);
  const passwordHash = await hashPassword(b.password);
  if (link.kind === "reset") {
    const user = db.users.find(
      (u) => u.id === link.userId && u.email === link.email,
    );
    if (!user) fail("Account unavailable.", 400);
    user.passwordHash = passwordHash;
    db.authSessions = (db.authSessions || []).filter(
      (s) => s.userId !== user.id,
    );
  } else {
    if (
      db.users.some(
        (u) =>
          u.email === link.email ||
          (link.playerId && u.playerId === link.playerId),
      )
    )
      fail("Account already exists.", 409);
    if (link.familyId && !db.families.some((f) => f.id === link.familyId))
      fail("Family no longer available.");
    if (
      link.playerId &&
      !db.players.some(
        (p) => p.id === link.playerId && p.familyId === link.familyId,
      )
    )
      fail("Player assignment changed. Request a new invitation.");
    if (link.teamIds?.some((t) => !db.teams.some((x) => x.id === t)))
      fail("Team assignment changed. Request a new invitation.");
    const { name, email, role, familyId, playerId, teamIds } = link;
    db.users.push({
      id: id(),
      name,
      email,
      role,
      ...(familyId ? { familyId } : {}),
      ...(playerId ? { playerId } : {}),
      ...(teamIds ? { teamIds } : {}),
      passwordHash,
    });
  }
  link.usedAt = new Date().toISOString();
  return { ok: true };
}
