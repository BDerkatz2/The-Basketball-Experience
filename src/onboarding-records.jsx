import React, { useState } from "react";
export function OnboardingRecords({ data, act }) {
  const [error, setError] = useState("");
  async function download() {
    setError("");
    try {
      const r = await fetch("/api/export/waivers", {
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
        },
      });
      if (!r.ok) throw Error("Waiver export unavailable.");
      const url = URL.createObjectURL(await r.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = "waiver-records.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }
  const staff = ["admin", "staff"].includes(data.user.role);
  return (
    <section className="card feature-pad operations-panel space-top">
      <h3>Records and document expiry</h3>
      {error && <p role="alert">{error}</p>}
      {(staff || data.user.role === "parent") && (
        <button className="btn" onClick={download}>
          Download signed waiver records
        </button>
      )}
      {data.files
        .filter((f) => f.purpose === "staff")
        .map((f) => (
          <form
            key={f.id + f.metadataUpdatedAt}
            onSubmit={(e) => {
              e.preventDefault();
              act("staff-document", {
                id: f.id,
                ...Object.fromEntries(new FormData(e.currentTarget)),
                retired: new FormData(e.currentTarget).has("retired"),
              });
            }}
          >
            <b>{f.name}</b>
            <p>
              {f.expiresOn
                ? (f.expiresOn < new Date().toISOString().slice(0, 10)
                    ? "Expired: "
                    : "Expires: ") + f.expiresOn
                : "No expiry recorded"}
            </p>
            <label>
              Document title
              <input
                name="title"
                defaultValue={f.documentTitle || f.name}
                required
                maxLength="100"
              />
            </label>
            <label>
              Expiry date (leave blank when not applicable)
              <input
                name="expiresOn"
                type="date"
                defaultValue={f.expiresOn || ""}
              />
            </label>
            <label>
              <input
                name="retired"
                type="checkbox"
                defaultChecked={f.retired}
              />
              Superseded document (retain in history)
            </label>
            <button className="btn">Save document details</button>
            <p>
              Changing details returns the owner's onboarding profile to review.
            </p>
          </form>
        ))}
      {data.user.role === "admin" &&
        data.forms.map((f) => (
          <form
            key={f.id}
            onSubmit={(e) => {
              e.preventDefault();
              act("waiver-approve", {
                id: f.id,
                reference: new FormData(e.currentTarget).get("reference"),
              });
            }}
          >
            <b>
              {f.title} · version {f.version}
            </b>
            <p>
              {f.approval
                ? "Organization approval recorded: " + f.approval.reference
                : "Organization approval not recorded"}
            </p>
            <label>
              Approval reference (approver/date or approved document reference)
              <input name="reference" required maxLength="500" />
            </label>
            <button className="btn">
              Record supplied organization approval
            </button>
            <p>
              This records your approval evidence; it does not review or approve
              the wording for you.
            </p>
          </form>
        ))}
      {staff && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act("series-reschedule", {
              id: f.get("id"),
              shiftDays: Number(f.get("shiftDays")),
              localTime: f.get("localTime"),
              confirm: f.has("confirm"),
            });
          }}
        >
          <h3>Change this and following practices</h3>
          <label>
            First affected session
            <select name="id">
              {data.events
                .filter((e) => e.seriesId && e.status !== "Cancelled")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} · {new Date(e.start).toLocaleString()}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Shift dates by days
            <input
              name="shiftDays"
              type="number"
              min="-365"
              max="365"
              defaultValue="0"
              required
            />
          </label>
          <label>
            New local time (session time zone)
            <input name="localTime" type="time" required />
          </label>
          <label>
            <input type="checkbox" name="confirm" required />
            Apply to this and all following active sessions in this series
          </label>
          <button className="btn">Reschedule series</button>
        </form>
      )}
    </section>
  );
}
