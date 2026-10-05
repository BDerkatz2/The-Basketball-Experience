import React, { useState } from "react";
export function TrainingPlans({ data, act }) {
  const [drills, setDrills] = useState([]),
    [busy, setBusy] = useState(false),
    [plan, setPlan] = useState("");
  const coach = ["coach", "staff", "admin"].includes(data.user.role);
  const selectedPlan =
    data.trainingPlans.find((p) => p.id === plan && !p.archived)?.id ||
    data.trainingPlans.find((p) => !p.archived)?.id;
  const groups = Object.values(
    data.workouts
      .filter((w) => w.sessionId)
      .reduce((out, w) => {
        (out[w.sessionId] ??= []).push(w);
        return out;
      }, {}),
  );
  async function submit(e, action) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      if (
        await act(
          action,
          action === "training-plan-create"
            ? { name: f.get("name"), notes: f.get("notes"), drillIds: drills }
            : {
                planId: selectedPlan,
                playerIds: f.getAll("playerIds"),
                start: f.get("start"),
                timeZone: f.get("timeZone"),
                count: Number(f.get("count")),
              },
        )
      ) {
        form.reset();
        setDrills([]);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Training plans</h3>
      </div>
      <div style={{ padding: 24 }}>
        {groups.map((rows) => {
          const first = rows[0],
            done = rows.filter((w) => w.completed).length;
          return (
            <div className="feature-row" key={first.sessionId}>
              <div>
                <b>
                  {first.planName} ·{" "}
                  {data.players.find((p) => p.id === first.playerId)?.name}
                </b>
                <p>
                  Due {new Date(first.due).toLocaleString()} · {done}/
                  {rows.length} exercises complete
                </p>
                <p>{first.planNotes}</p>
                <ol>
                  {rows
                    .sort((a, b) => a.exerciseNumber - b.exerciseNumber)
                    .map((w) => (
                      <li key={w.id}>
                        {w.drillSnapshot.name}
                        {w.cancelledAt
                          ? " · Cancelled"
                          : w.completed
                            ? " · Complete"
                            : ""}
                      </li>
                    ))}
                </ol>
              </div>
              <progress
                aria-label={first.planName + " completion"}
                value={done}
                max={rows.length}
              />
            </div>
          );
        })}
        {!groups.length && <p>No multi-exercise plans assigned yet.</p>}
        {coach && (
          <>
            <form
              className="feature-form"
              onSubmit={(e) => submit(e, "training-plan-create")}
            >
              <h4>Build a reusable plan</h4>
              <label>
                Plan name
                <input name="name" required maxLength={100} />
              </label>
              <label>
                Coaching notes
                <textarea name="notes" maxLength={2000} />
              </label>
              <fieldset>
                <legend>Choose exercises in order · up to 12</legend>
                {data.drills.map((d) => (
                  <label className="checkbox" key={d.id}>
                    <input
                      type="checkbox"
                      checked={drills.includes(d.id)}
                      disabled={
                        busy || (!drills.includes(d.id) && drills.length >= 12)
                      }
                      onChange={() =>
                        setDrills((a) =>
                          a.includes(d.id)
                            ? a.filter((id) => id !== d.id)
                            : [...a, d.id],
                        )
                      }
                    />
                    {drills.includes(d.id)
                      ? drills.indexOf(d.id) + 1 + ". "
                      : ""}
                    {d.name}
                  </label>
                ))}
              </fieldset>
              <p>
                Plans preserve exercise instructions, sets, reps and rest as
                they are now. Edit a reusable plan below for future assignments;
                existing assignments keep their snapshots.
              </p>
              <button className="btn" disabled={busy || !drills.length}>
                Save training plan
              </button>
            </form>
            {!!data.trainingPlans.some((p) => !p.archived) && (
              <form
                className="feature-form space-top"
                onSubmit={(e) => submit(e, "training-plan-assign")}
              >
                <h4>Assign a plan</h4>
                <label>
                  Training plan
                  <select
                    value={selectedPlan}
                    onChange={(e) => setPlan(e.target.value)}
                  >
                    {data.trainingPlans
                      .filter((p) => !p.archived)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.exercises.length} exercises
                        </option>
                      ))}
                  </select>
                </label>
                <fieldset>
                  <legend>Players</legend>
                  {data.players.map((p) => (
                    <label className="checkbox" key={p.id}>
                      <input type="checkbox" name="playerIds" value={p.id} />
                      {p.name}
                    </label>
                  ))}
                </fieldset>
                <label>
                  First due date/time
                  <input name="start" type="datetime-local" required />
                </label>
                <label>
                  Time zone
                  <input
                    name="timeZone"
                    defaultValue={
                      Intl.DateTimeFormat().resolvedOptions().timeZone
                    }
                    required
                  />
                </label>
                <label>
                  Weekly assignments
                  <input
                    name="count"
                    type="number"
                    min="1"
                    max="12"
                    defaultValue="1"
                    required
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Assign to selected players
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </section>
  );
}
