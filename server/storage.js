import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

export function rowKey(row) {
  if (row.id) return String(row.id);
  if (row.eventId && row.playerId) return `${row.eventId}:${row.playerId}`;
  if (row.userId) return String(row.userId);
  throw new Error("A persisted record requires a stable key.");
}
export async function createStore({
  path,
  initial,
  mongoUri = process.env.MONGODB_URI,
  mongoDatabase = process.env.MONGODB_DATABASE || "basketball_experience",
}) {
  if (!mongoUri) {
    await mkdir(dirname(path), { recursive: true });
    let exists = true;
    try {
      await readFile(path);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      exists = false;
    }
    if (!exists)
      await writeFile(path, JSON.stringify(initial, null, 2), { flag: "wx" });
    return {
      kind: "file",
      load: async () => JSON.parse(await readFile(path, "utf8")),
      save: async (data) => {
        await writeFile(path + ".tmp", JSON.stringify(data, null, 2));
        await rename(path + ".tmp", path);
      },
      close: async () => {},
    };
  }
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const database = client.db(mongoDatabase),
    meta = database.collection("_state");
  let revision = 0;
  const transact = (fn) =>
    client.withSession((session) =>
      session.withTransaction(() => fn(session), {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }),
    );
  async function save(data) {
    await transact(async (session) => {
      const keys = Object.keys(data).filter((k) => Array.isArray(data[k]));
      const scalars = Object.fromEntries(
        Object.entries(data).filter(([k, v]) => !Array.isArray(v)),
      );
      const previous = await meta.findOne({ _id: "version" }, { session });
      if ((previous?.revision || 0) !== revision)
        throw Object.assign(
          new Error("Data changed in another server. Refresh and retry."),
          { status: 409 },
        );
      for (const key of keys) {
        const collection = database.collection(key);
        const docs = data[key].map((row) => ({ _id: rowKey(row), ...row }));
        const ids = docs.map((d) => d._id);
        await collection.deleteMany({ _id: { $nin: ids } }, { session });
        if (docs.length)
          await collection.bulkWrite(
            docs.map((d) => ({
              replaceOne: {
                filter: { _id: d._id },
                replacement: d,
                upsert: true,
              },
            })),
            { session },
          );
      }
      await meta.replaceOne(
        { _id: "version" },
        { _id: "version", revision: revision + 1, keys, scalars },
        { session, upsert: true },
      );
    });
    revision++;
  }
  const existing = await meta.findOne({ _id: "version" });
  if (!existing) await save(initial);
  async function load() {
    let result, readRevision;
    await transact(async (session) => {
      const snapshot = await meta.findOne({ _id: "version" }, { session });
      result = { ...snapshot.scalars };
      for (const key of snapshot.keys)
        result[key] = (
          await database.collection(key).find({}, { session }).toArray()
        ).map(({ _id, ...row }) => row);
      readRevision = snapshot.revision;
    });
    revision = readRevision;
    return result;
  }
  return { kind: "mongodb", load, save, close: () => client.close() };
}
