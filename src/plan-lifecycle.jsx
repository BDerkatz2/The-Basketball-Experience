import React, { useState } from "react";
export function PlanLifecycle({ data, act }) {
  const [editing, setEditing] = useState(null),
    [drills, setDrills] = useState([]),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null);
  const coach = ["staff", "admin", "coach"].includes(data.user.role);
  if (!coach) return null;
  async function run(action, b) {
    setBusy(true);
    try {
      if (await act(action, b)) {
        setEditing(null);
        setConfirm(null);
      }
    } finally {
      setBusy(false);
    }
  }
  const sessions = Object.values(
    data.workouts
      .filter((w) => w.sessionId)
      .reduce((a, w) => {
        (a[w.sessionId] ??= []).push(w);
        return a;
      }, {}),
  );
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Manage plans and assignments</h3>
      </div>
      <div style={{ padding: 24 }}>
        <p>
          Editing updates the reusable plan for future assignments. Existing
          assignments keep their original instructions. Archiving prevents new
          assignments.
        </p>
        {data.trainingPlans.map((p) => (
          <div className="feature-row" key={p.id}>
            <b>
              {p.name}
              {p.archived ? " · Archived" : ""}
            </b>
            <div className="feature-actions">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(p);
                  setDrills(p.exercises.map((d) => d.id));
                }}
              >
                Edit plan
              </button>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  run("training-plan-archive", {
                    planId: p.id,
                    archived: !p.archived,
                  })
                }
              >
                {p.archived ? "Restore" : "Archive"}
              </button>
            </div>
          </div>
        ))}
        {editing && (
          <form
            className="feature-form"
            key={editing.id}
            onSubmit={(e) => {
              e.preventDefault();
              run("training-plan-edit", {
                ...Object.fromEntries(new FormData(e.currentTarget)),
                planId: editing.id,
                drillIds: drills,
              });
            }}
          >
            <h4>Edit {editing.name}</h4>
            <label>
              Plan name
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={editing.name}
              />
            </label>
            <label>
              Notes
              <textarea
                name="notes"
                maxLength={2000}
                defaultValue={editing.notes}
              />
            </label>
            <fieldset>
              <legend>Exercise order · uncheck and reselect to reorder</legend>
              {data.drills.map((d) => (
                <label key={d.id}>
                  <input
                    type="checkbox"
                    checked={drills.includes(d.id)}
                    onChange={() =>
                      setDrills((a) =>
                        a.includes(d.id)
                          ? a.filter((id) => id !== d.id)
                          : [...a, d.id],
                      )
                    }
                  />
                  {drills.includes(d.id) ? `${drills.indexOf(d.id) + 1}. ` : ""}
                  {d.name}
                </label>
              ))}
            </fieldset>
            <button
              className="btn"
              disabled={busy || !drills.length || drills.length > 12}
            >
              Save revised plan
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => setEditing(null)}
            >
              Close editor
            </button>
          </form>
        )}
        <h4 className="space-top">Assignment sessions</h4>
        {sessions.map((rows) => {
          const w = rows[0],
            pending = rows.filter((w) => !w.completed && !w.cancelledAt).length;
          return (
            <div className="feature-row" key={w.sessionId}>
              <div>
                <b>
                  {w.planName} ·{" "}
                  {data.players.find((p) => p.id === w.playerId)?.name}
                </b>
                <p>
                  {new Date(w.due).toLocaleString()} · {pending} unfinished ·{" "}
                  {rows.filter((w) => w.cancelledAt).length} cancelled
                </p>
                {confirm === w.sessionId && (
                  <p>
                    Cancel unfinished exercises? Completed results will remain.
                  </p>
                )}
              </div>
              {pending > 0 &&
                (confirm === w.sessionId ? (
                  <div>
                    <button
                      className="btn"
                      disabled={busy}
                      onClick={() =>
                        run("training-plan-cancel", { sessionId: w.sessionId })
                      }
                    >
                      Confirm cancellation
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() => setConfirm(null)}
                    >
                      Keep assignment
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn secondary"
                    onClick={() => setConfirm(w.sessionId)}
                  >
                    Cancel unfinished exercises
                  </button>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
