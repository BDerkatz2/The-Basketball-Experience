import React, { useState, useEffect } from "react";
export function FamilyProfiles({ data, act }) {
  const family = data.families.find((f) => f.id === data.user.familyId),
    [busy, setBusy] = useState(false);
  if (!family) return null;
  async function save(e, action, extra = {}) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = { ...Object.fromEntries(new FormData(form)), ...extra };
    if (action === "family-player") body.age = Number(body.age);
    setBusy(true);
    try {
      if ((await act(action, body)) && !extra.id && action === "family-player")
        form.reset();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Manage your family</h3>
      </div>
      <div className="workflow-grid">
        <form
          className="feature-form"
          key={family.id}
          onSubmit={(e) => save(e, "family-profile")}
        >
          <h4>Contact details</h4>
          <p>Your contact email is separate from your sign-in email.</p>
          <label>
            Family name
            <input
              name="name"
              defaultValue={family.name}
              maxLength={100}
              required
            />
          </label>
          <label>
            Contact email
            <input
              name="email"
              type="email"
              defaultValue={family.email}
              maxLength={254}
              required
            />
          </label>
          <label>
            Phone
            <input
              name="phone"
              type="tel"
              defaultValue={family.phone || ""}
              maxLength={40}
            />
          </label>
          <label>
            Address
            <textarea
              name="address"
              defaultValue={family.address || ""}
              maxLength={300}
            />
          </label>
          <button className="btn" disabled={busy}>
            Save family details
          </button>
        </form>
        <div>
          {[...data.players, { id: "", name: "", age: "" }].map((p) => (
            <form
              className="feature-form"
              key={p.id || "new"}
              onSubmit={(e) =>
                save(e, "family-player", p.id ? { id: p.id } : {})
              }
            >
              <h4>{p.id ? "Edit player" : "Add a player"}</h4>
              <label>
                Player name
                <input
                  name="name"
                  defaultValue={p.name}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Age
                <input
                  name="age"
                  type="number"
                  defaultValue={p.age}
                  min={2}
                  max={100}
                  required
                />
              </label>
              <p>Team placement and jersey numbers are managed by staff.</p>
              <button className="btn secondary" disabled={busy}>
                {p.id ? "Save player" : "Add player"}
              </button>
            </form>
          ))}
        </div>
      </div>
    </section>
  );
}
export function Waitlists({ data, act, onRegister }) {
  const [busy, setBusy] = useState(false),
    staff = ["staff", "admin"].includes(data.user.role);
  if (!staff && data.user.role !== "parent") return null;
  async function run(action, b) {
    setBusy(true);
    try {
      await act(action, b);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Program waitlists</h3>
      </div>
      <div style={{ padding: 24 }}>
        <p>
          Queue positions are per program. Staff offer available spots in order,
          with 48 hours to complete registration. Expired offers can rejoin at
          the back of the queue.
        </p>
        <form
          className="feature-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              "waitlist-join",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
          }}
        >
          <label>
            Program
            <select name="programId">
              {data.programs.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} ·{" "}
                  {data.programAvailability?.find((a) => a.programId === p.id)
                    ?.available ?? 0}{" "}
                  unreserved spots
                </option>
              ))}
            </select>
          </label>
          <label>
            Player
            <select name="playerId">
              {data.players.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn secondary"
            disabled={busy || !data.players.length}
          >
            Join waitlist
          </button>
        </form>
        {data.waitlist?.map((r) => (
          <div className="feature-row" key={r.id}>
            <div>
              <b>
                {data.programs.find((p) => p.id === r.programId)?.name} ·{" "}
                {data.players.find((p) => p.id === r.playerId)?.name}
              </b>
              <p>
                {r.status}
                {r.position ? ` · Position ${r.position}` : ""}
                {r.status === "Offered"
                  ? ` · Register by ${new Date(r.expiresAt).toLocaleString()}`
                  : ""}
              </p>
            </div>
            <div className="feature-actions">
              {staff && r.status === "Waiting" && (
                <button
                  className="btn secondary"
                  disabled={
                    busy ||
                    r.position !== 1 ||
                    !data.programAvailability?.find(
                      (a) => a.programId === r.programId,
                    )?.available
                  }
                  onClick={() => run("waitlist-offer", { id: r.id })}
                >
                  Offer spot
                </button>
              )}
              {r.status === "Offered" && onRegister && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => onRegister(r)}
                >
                  Complete registration
                </button>
              )}
              {["Waiting", "Offered"].includes(r.status) && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => run("waitlist-leave", { id: r.id })}
                >
                  {r.status === "Offered" ? "Decline offer" : "Leave waitlist"}
                </button>
              )}
            </div>
          </div>
        ))}
        {!data.waitlist?.length && <p>No waitlist entries yet.</p>}
      </div>
    </section>
  );
}
export function AdminReports() {
  const [kind, setKind] = useState("enrollment"),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    fetch("/api/reports/" + kind, {
      headers: {
        Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
      },
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => controller.abort();
  }, [kind, revision]);
  const rows =
    result?.rows.filter((r) =>
      r.join(" ").toLowerCase().includes(query.toLowerCase()),
    ) || [];
  function download() {
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const csv = [result.columns, ...rows]
      .map((r) => r.map(cell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tbe-" + kind + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Admin reports</h3>
      </div>
      <div style={{ padding: 24 }}>
        <div className="form-row">
          <label>
            Report
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setQuery("");
              }}
            >
              {Object.entries({
                enrollment: "Enrollment summary",
                attendance: "Attendance register",
                payments: "Outstanding payments",
                inventory: "Inventory summary",
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter report
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Program, player, family or status"
            />
          </label>
        </div>
        <button
          className="btn secondary"
          onClick={() => setRevision((n) => n + 1)}
        >
          Refresh report
        </button>
        {error && <p role="alert">{error}</p>}
        {!result && !error && <p role="status">Loading report…</p>}
        {result && (
          <>
            <p>
              {rows.length} matching records.{" "}
              {kind === "payments"
                ? "Unpaid invoices only; currencies remain separate."
                : kind === "attendance"
                  ? "Blank attendance is shown as Not recorded, never assumed absent."
                  : kind === "inventory"
                    ? `Total units in view: ${rows.reduce((n, r) => n + Number(r[3]), 0)}`
                    : "Includes active and cancelled registrations."}
            </p>
            {kind === "payments" &&
              Object.entries(
                rows.reduce((s, r) => {
                  s[r[3]] = (s[r[3]] || 0) + Number(r[4]);
                  return s;
                }, {}),
              ).map(([currency, total]) => (
                <p key={currency}>
                  <b>
                    {currency} {total.toFixed(2)} outstanding
                  </b>
                </p>
              ))}
            <button className="btn secondary" onClick={download}>
              Download filtered CSV
            </button>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {result.columns.map((c) => (
                      <th key={c} scope="col">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
