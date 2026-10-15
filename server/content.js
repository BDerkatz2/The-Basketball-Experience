import { fail, text } from "./domain.js";
export const pages = [
  "home",
  "calendar",
  "programs",
  "family",
  "store",
  "training",
  "league",
  "messages",
  "admin",
  "onboarding",
];
export function contentAction(db, u, b) {
  if (u.role !== "admin") fail("Administrator access required.", 403);
  const valid =
    pages.includes(b.id) ||
    b.id === "hero" ||
    (typeof b.id === "string" &&
      b.id.startsWith("product:") &&
      db.products.some((p) => "product:" + p.id === b.id));
  if (!valid) fail("Choose an existing page or product.");
  const prior = db.siteContent.find((x) => x.id === b.id);
  if (b.version !== (prior?.version || 0))
    fail("Content changed. Reload the editor before publishing.", 409);
  const row = {
    id: b.id,
    version: (prior?.version || 0) + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: u.id,
  };
  if (b.reset !== true) {
    row.title = b.title ? text(b.title, 120) : "";
    row.description = b.description ? text(b.description, 1000) : "";
    row.alt = b.alt ? text(b.alt, 180) : "";
    row.imageId = b.imageId || null;
    if (
      row.imageId &&
      !db.files.some(
        (f) => f.id === row.imageId && f.purpose === "content" && !f.purgedAt,
      )
    )
      fail("Choose an uploaded content photo.");
    if (row.imageId && !row.alt) fail("Describe the image for accessibility.");
  }
  if (prior)
    Object.assign(
      prior,
      { title: "", description: "", alt: "", imageId: null },
      row,
    );
  else db.siteContent.push(row);
}
