import {
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { id, fail, text } from "./domain.js";
const scrypt = promisify(rawScrypt);
export const digest = (token) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = ({ passwordHash, ...user }) => user;
export function email(value) {
  const result = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    fail("Enter a valid email address.");
  return result;
}
export async function hashPassword(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    fail("Use a password between 12 and 128 characters.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(value, salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(value, stored) {
  if (typeof value !== "string" || value.length > 128) return false;
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const key = await scrypt(value, salt, 64, {
    N: 32768,
    maxmem: 64 * 1024 * 1024,
  });
  const expected = Buffer.from(hash, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}
export function newSession(db, user) {
  const token = randomBytes(32).toString("hex");
  db.authSessions = (db.authSessions || []).filter(
    (s) => s.expires > Date.now(),
  );
  db.authSessions.push({
    id: digest(token),
    userId: user.id,
    expires: Date.now() + 8 * 3600000,
  });
  return { token, user: publicUser(user) };
}
export async function register(db, b) {
  const address = email(b.email);
  if (db.users.some((u) => u.email === address))
    fail("An account with that email already exists.", 409);
  const passwordHash = await hashPassword(b.password),
    name = text(b.name, 100),
    familyId = id();
  const user = {
    id: id(),
    name,
    email: address,
    role: "parent",
    familyId,
    passwordHash,
  };
  db.users.push(user);
  db.families.push({
    id: familyId,
    name: name.split(" ").at(-1) + " family",
    email: address,
    membership: "Pending",
  });
  return user;
}
export function limiter({ max = 20, windowMs = 15 * 60000 } = {}) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, v] of entries) if (v.reset <= now) entries.delete(key);
    const key = req.ip;
    const row = entries.get(key) || { count: 0, reset: now + windowMs };
    row.count++;
    entries.set(key, row);
    if (row.count > max)
      return res
        .status(429)
        .json({ error: "Too many attempts. Try again later." });
    next();
  };
}
