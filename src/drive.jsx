import React, { useState } from "react";
export function DriveImport({ data }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details style={{ padding: 16 }}>
      <summary>Import from the club Google Drive folder</summary>
      <p>
        Creates a team-accessible copy, up to 100 MB. Changes or deletions in
        Drive do not update the imported copy. The administrator must configure
        the club folder first.
      </p>
      <form
        className="feature-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          setBusy(true);
          setMessage("");
          try {
            const r = await fetch("/api/drive/import", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
                "Content-Type": "application/json",
              },
              body: JSON.stringify(Object.fromEntries(new FormData(form))),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error || "Drive import failed.");
            setMessage("Video imported. It is available to the selected team.");
            form.reset();
          } catch (e) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Drive file ID
          <input
            name="fileId"
            required
            pattern="[A-Za-z0-9_-]{10,200}"
            placeholder="ID between /d/ and /view in the Drive link"
          />
        </label>
        <label>
          Share with team
          <select name="teamId" required>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy} className="btn secondary">
          {busy ? "Importing…" : "Import video"}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
