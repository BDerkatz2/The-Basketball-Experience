import React, { useState } from "react";

export function RegistrationRules({ data, act }) {
  const [selected, setSelected] = useState(data.programs[0]?.id || "");
  const program = data.programs.find((p) => p.id === selected);
  return (
    <section className="panel">
      <h2>Registration rules & seasons</h2>
      <label>
        Manage program
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {data.programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.season ? ` · ${p.season}` : ""}
            </option>
          ))}
        </select>
      </label>
      {program && (
        <RulesForm
          key={program.id + JSON.stringify(program.registration)}
          program={program}
          act={act}
        />
      )}
    </section>
  );
}
function RulesForm({ program, act }) {
  const r = program.registration || {};
  const [busy, setBusy] = useState(false),
    [copy, setCopy] = useState(false);
  async function submit(e, action) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const b = Object.fromEntries(f);
    if (action === "registration-rules") {
      for (const key of ["minAge", "maxAge"])
        b[key] = b[key] === "" ? null : Number(b[key]);
      b.closed = f.has("closed");
      b.membersOnly = f.has("membersOnly");
    } else b.confirm = f.has("confirm");
    setBusy(true);
    try {
      if (await act(action, { ...b, id: program.id })) setCopy(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="workflow-grid">
      <form onSubmit={(e) => submit(e, "registration-rules")}>
        <h3>Eligibility</h3>
        <p>
          Rules apply to new registrations and waitlist joins, including offered
          spots. Existing registrations remain unchanged. Ages use the current
          player profile; staff should verify them.
        </p>
        {program.registrationClosed && (
          <p role="status">
            This previous-season program is closed after rollover.
          </p>
        )}
        <label>
          Minimum age (optional)
          <input
            name="minAge"
            type="number"
            min="2"
            max="100"
            defaultValue={r.minAge ?? ""}
          />
        </label>
        <label>
          Maximum age (optional)
          <input
            name="maxAge"
            type="number"
            min="2"
            max="100"
            defaultValue={r.maxAge ?? ""}
          />
        </label>
        <label>
          Opens at (optional ISO time with zone)
          <input
            name="opensAt"
            defaultValue={r.opensAt || ""}
            placeholder="2027-01-01T09:00:00-07:00"
          />
        </label>
        <label>
          Closes at (optional ISO time with zone)
          <input
            name="closesAt"
            defaultValue={r.closesAt || ""}
            placeholder="2027-02-01T18:00:00-07:00"
          />
        </label>
        <label>
          <input
            name="membersOnly"
            type="checkbox"
            defaultChecked={r.membersOnly}
          />{" "}
          Active family membership required
        </label>
        <label>
          <input name="closed" type="checkbox" defaultChecked={r.closed} />{" "}
          Close registration
        </label>
        <button className="btn" disabled={busy}>
          Save eligibility rules
        </button>
      </form>
      <div>
        <h3>Start the next season</h3>
        <p>
          Copy this program and its form into a closed draft for the next
          season. The original closes to new registrations. Enrollments,
          waitlists, payments, waivers and events stay in the original season.
        </p>
        {!copy ? (
          <button className="btn secondary" onClick={() => setCopy(true)}>
            Prepare season copy
          </button>
        ) : (
          <form onSubmit={(e) => submit(e, "season-rollover")}>
            <label>
              New season label
              <input
                name="season"
                maxLength="60"
                required
                placeholder="Spring 2027"
              />
            </label>
            <label>
              New program name
              <input
                name="name"
                maxLength="100"
                defaultValue={program.name}
                required
              />
            </label>
            <label>
              <input name="confirm" type="checkbox" required /> Close the
              original and create a new closed draft
            </label>
            <button className="btn" disabled={busy}>
              Create next-season program
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => setCopy(false)}
            >
              Keep current season
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ProgramEligibility({ program }) {
  const r = program.registration;
  if (!r && !program.registrationClosed) return null;
  return (
    <p className="muted">
      {program.season && `${program.season} · `}
      {program.registrationClosed || r?.closed ? "Registration closed. " : ""}
      {r?.minAge != null && `Minimum age ${r.minAge}. `}
      {r?.maxAge != null && `Maximum age ${r.maxAge}. `}
      {r?.membersOnly && "Active family membership required. "}
      {r?.opensAt && `Opens ${new Date(r.opensAt).toLocaleString()}. `}
      {r?.closesAt && `Closes ${new Date(r.closesAt).toLocaleString()}.`}
    </p>
  );
}
