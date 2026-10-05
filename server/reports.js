import { storeUpgrade, availableStock } from "./storefront.js";
import { fail, isStaff } from "./domain.js";
export function report(db, u, kind) {
  if (!isStaff(u)) fail("Staff access required.", 403);
  storeUpgrade(db);
  const name = (list, id) =>
    list.find((x) => x.id === id)?.name || "Unassigned";
  if (kind === "enrollment")
    return {
      columns: ["Program", "Player", "Family", "Status", "Payment"],
      rows: db.enrollments.map((e) => [
        name(db.programs, e.programId),
        name(db.players, e.playerId),
        name(
          db.families,
          db.players.find((p) => p.id === e.playerId)?.familyId,
        ),
        e.status,
        e.paymentStatus || "Unpaid",
      ]),
    };
  if (kind === "attendance")
    return {
      columns: ["Session", "Date", "Player", "Session status", "Attendance"],
      rows: db.events.flatMap((e) =>
        [
          ...new Set([
            ...e.playerIds,
            ...db.attendance
              .filter((a) => a.eventId === e.id)
              .map((a) => a.playerId),
          ]),
        ].map((id) => {
          const record = db.attendance.find(
            (a) => a.eventId === e.id && a.playerId === id,
          );
          return [
            e.title,
            e.start,
            name(db.players, id),
            e.status,
            record ? (record.present ? "Present" : "Absent") : "Not recorded",
          ];
        }),
      ),
    };
  if (kind === "payments")
    return {
      columns: [
        "Invoice",
        "Family",
        "Description",
        "Currency",
        "Amount",
        "Created",
      ],
      rows: db.invoices
        .filter((i) => i.status === "Unpaid")
        .map((i) => [
          i.id,
          name(db.families, i.familyId),
          i.description,
          i.currency.toUpperCase(),
          (i.amountCents / 100).toFixed(2),
          i.createdAt,
        ]),
    };
  if (kind === "inventory")
    return {
      columns: [
        "Product",
        "Colour",
        "Size",
        "On hand",
        "Unit price CAD",
        "Stock value CAD",
        "Available",
      ],
      rows: db.products.flatMap((p) =>
        p.variants.flatMap((v) =>
          Object.entries(v.stock).map(([size, quantity]) => [
            p.name,
            v.color || "",
            size,
            quantity,
            Number(p.price).toFixed(2),
            (quantity * p.price).toFixed(2),
            availableStock(db, p.id, v.id, size),
          ]),
        ),
      ),
    };
  fail("Unknown report.", 404);
}
