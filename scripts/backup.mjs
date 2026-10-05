import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { fileURLToPath } from "node:url";

const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id);
function key(password, salt) {
  if (typeof password !== "string" || password.length < 16)
    throw Error("Set BACKUP_PASSWORD to at least 16 characters.");
  return scryptSync(password, salt, 32);
}
export async function backup(dataPath, destination, password) {
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  if (!Array.isArray(data.users) || !Array.isArray(data.files))
    throw Error("Invalid application snapshot.");
  const uploads = {};
  let total = 0;
  for (const f of data.files.filter((f) => !f.purgedAt)) {
    if (!validId(f.id)) throw Error("Invalid upload identifier.");
    const path = join(dirname(dataPath), "uploads", f.id),
      info = await stat(path);
    total += info.size;
    if (total > 256 * 1024 * 1024)
      throw Error("Use a volume backup for more than 256 MB of media.");
    uploads[f.id] = (await readFile(path)).toString("base64");
  }
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        data,
        uploads,
      }),
    ),
    cipher.final(),
  ]);
  await writeFile(
    destination,
    Buffer.concat([
      Buffer.from("TBEBK001"),
      salt,
      iv,
      cipher.getAuthTag(),
      body,
    ]),
    { flag: "wx", mode: 0o600 },
  );
}
export async function restore(source, destination, password) {
  const bytes = await readFile(source);
  if (bytes.subarray(0, 8).toString() !== "TBEBK001")
    throw Error("Invalid backup format.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(password, bytes.subarray(8, 24)),
    bytes.subarray(24, 36),
  );
  decipher.setAuthTag(bytes.subarray(36, 52));
  const archive = JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(52)),
      decipher.final(),
    ]).toString(),
  );
  if (
    archive.version !== 1 ||
    !Array.isArray(archive.data?.files) ||
    !Array.isArray(archive.data?.users)
  )
    throw Error("Invalid snapshot.");
  const expected = archive.data.files
    .filter((f) => !f.purgedAt)
    .map((f) => f.id);
  if (
    Object.keys(archive.uploads).some(
      (id) => !validId(id) || !expected.includes(id),
    ) ||
    expected.some(
      (id) => !validId(id) || typeof archive.uploads[id] !== "string",
    )
  )
    throw Error("Invalid backup file manifest.");
  await mkdir(destination); // Must be new: never overwrite a running installation.
  await mkdir(join(destination, "uploads"));
  for (const [id, content] of Object.entries(archive.uploads))
    await writeFile(
      join(destination, "uploads", id),
      Buffer.from(content, "base64"),
      { flag: "wx", mode: 0o600 },
    );
  archive.data.authSessions = [];
  for (const r of archive.data.refunds || [])
    if (
      ["sending", "approved", "pending", "requires_action"].includes(r.status)
    )
      r.status = "unknown";
  for (const r of archive.data.deliveryQueue || [])
    if (r.status === "sending") r.status = "unknown";
  await writeFile(
    join(destination, "restored.json"),
    JSON.stringify(archive.data, null, 2),
    { flag: "wx", mode: 0o600 },
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, source, destination, confirmation] = process.argv.slice(2);
  if (
    !["backup", "restore"].includes(mode) ||
    !source ||
    !destination ||
    confirmation !== "--server-stopped"
  )
    throw Error(
      "Usage: node scripts/backup.mjs backup|restore SOURCE DESTINATION --server-stopped",
    );
  if (mode === "backup")
    await backup(
      resolve(source),
      resolve(destination),
      process.env.BACKUP_PASSWORD,
    );
  else
    await restore(
      resolve(source),
      resolve(destination),
      process.env.BACKUP_PASSWORD,
    );
  console.log(
    mode + " complete. Keep the password separate from the encrypted archive.",
  );
}
