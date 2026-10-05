import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  ArrowDownToLine,
  Edit3,
  Check,
  Video,
  Upload,
  Bell,
  X,
} from "lucide-react";
import "./features.css";

import { DriveImport } from "./drive.jsx";
const token = () => sessionStorage.getItem("tbe-token") || "";
const staff = (d) => ["staff", "admin"].includes(d.user.role);
const coach = (d) => staff(d) || d.user.role === "coach";
const title = (rows, id) =>
  rows.find((x) => x.id === id)?.name || "Awaiting winner";
const date = (s) => new Date(s).toLocaleString();
const button = (text, fn, disabled = false) => (
  <button
    type="button"
    className="btn secondary"
    disabled={disabled}
    onClick={fn}
  >
    {text}
  </button>
);
export function LiveUpdates({ refresh }) {
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function connect() {
      try {
        const r = await fetch("/api/stream", {
          headers: { Authorization: "Bearer " + token() },
          signal: controller.signal,
        });
        if (!r.ok) throw Error("Stream disconnected");
        const reader = r.body.getReader();
        let buf = "";
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let split;
          while ((split = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, split);
            buf = buf.slice(split + 2);
            if (event.includes("data:")) refresh();
          }
        }
      } catch {}
      if (!controller.signal.aborted) timer = setTimeout(connect, 4000);
    }
    connect();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);
  return null;
}
async function download(path, name) {
  const r = await fetch("/api/" + path, {
    headers: { Authorization: "Bearer " + token() },
  });
  if (!r.ok) throw Error("Download unavailable.");
  const blob = await r.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ReportButton({ type, label, name }) {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="btn secondary"
        onClick={() =>
          download("export/" + type, name || type + ".csv").catch((e) =>
            setError(e.message),
          )
        }
      >
        <ArrowDownToLine size={15} />
        {label}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
function Dialog({ title, children, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const key = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = [
          ...ref.current.querySelectorAll("button,input,select,textarea,a"),
        ].filter((n) => !n.disabled);
        const first = nodes[0],
          last = nodes.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close icon-button"
          onClick={close}
          aria-label="Close"
        >
          <X />
        </button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export function FieldsForm({
  fields,
  initial = {},
  onSubmit,
  label = "Save",
  children,
}) {
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="feature-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(e.currentTarget));
        for (const f of fields) {
          if (f.type === "number") b[f.name] = Number(b[f.name]);
          if (f.type === "checkbox") b[f.name] = b[f.name] === "on";
        }
        setBusy(true);
        try {
          await onSubmit(b);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className={f.type === "checkbox" ? "checkbox" : ""}>
          {f.label}
          {f.options ? (
            <select
              name={f.name}
              defaultValue={initial[f.name] ?? f.default}
              required={f.required !== false}
            >
              {f.options.map((o) => (
                <option value={o.value ?? o} key={o.value ?? o}>
                  {o.label ?? o}
                </option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              name={f.name}
              maxLength={f.maxLength || 4000}
              defaultValue={initial[f.name] ?? f.default}
              required={f.required !== false}
            />
          ) : (
            <input
              name={f.name}
              type={f.type || "text"}
              min={f.min ?? 0}
              max={f.max}
              maxLength={f.maxLength || 500}
              defaultValue={
                f.type === "checkbox"
                  ? undefined
                  : (initial[f.name] ?? f.default)
              }
              defaultChecked={
                f.type === "checkbox"
                  ? (initial[f.name] ?? f.default)
                  : undefined
              }
              required={f.type !== "checkbox" && f.required !== false}
            />
          )}
        </label>
      ))}
      {children}
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : label}
      </button>
    </form>
  );
}
const opt = (rows) => rows.map((x) => ({ value: x.id, label: x.name }));
export function NotificationPanel({ data, act }) {
  const unread = data.notifications?.filter((n) => !n.read) || [];
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>
          <Bell size={16} /> Community updates
        </h3>
        <span className="badge">{unread.length} unread</span>
      </div>
      {!data.notifications?.length ? (
        <p className="feature-empty">
          Schedule changes and cancellations will appear here.
        </p>
      ) : (
        data.notifications.slice(0, 8).map((n) => (
          <div className="feature-row" key={n.id}>
            <div>
              <b>{n.title}</b>
              <p>{n.text}</p>
              <small>{date(n.createdAt)}</small>
            </div>
            {!n.read &&
              button("Mark read", () => act("notification-read", { id: n.id }))}
          </div>
        ))
      )}
    </section>
  );
}

export function ScheduleTools({ data, act }) {
  const [edit, setEdit] = useState(null);
  return (
    <section className="card space-top">
      {staff(data) && <SchedulePlanner data={data} act={act} />}
      <div className="card-head">
        <h3>Calendar tools</h3>
        <ReportButton
          type="calendar"
          name="basketball-calendar.ics"
          label="Export calendar"
        />
      </div>
      {staff(data) && (
        <>
          <p className="feature-empty">
            Changes check court, coach, team, and player conflicts. Families
            receive an in-app update.
          </p>
          {data.events.map((e) => (
            <div className="feature-row" key={e.id}>
              <div>
                <b>{e.title}</b>
                <p>
                  {date(e.start)} · {e.location}
                </p>
                <span className="badge">{e.status || "Scheduled"}</span>
              </div>
              {e.status !== "Cancelled" && (
                <div className="inline">
                  {button("Edit session", () => setEdit(e))}
                  {button("Cancel session", () =>
                    setEdit({ ...e, cancel: true }),
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="feature-pad">
            <ReportButton type="attendance" label="Attendance report" />
          </div>
        </>
      )}
      {edit && (
        <Dialog
          title={edit.cancel ? "Cancel this session?" : "Edit session"}
          close={() => setEdit(null)}
        >
          {edit.cancel ? (
            <>
              <p>
                {edit.title} · {date(edit.start)}
              </p>
              <p className="muted">
                It stays in the calendar as cancelled. RSVPs and check-ins will
                be disabled.
              </p>
              {button("Confirm cancellation", async () => {
                if (await act("session-cancel", { id: edit.id })) setEdit(null);
              })}
            </>
          ) : (
            <FieldsForm
              fields={[
                { name: "title", label: "Title" },
                {
                  name: "start",
                  label: "Date and time",
                  type: "datetime-local",
                },
                {
                  name: "minutes",
                  label: "Minutes",
                  type: "number",
                  min: 15,
                  max: 240,
                },
                { name: "location", label: "Court / location" },
                { name: "address", label: "Map address" },
              ]}
              initial={{
                ...edit,
                start: new Date(
                  +new Date(edit.start) -
                    new Date(edit.start).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16),
              }}
              onSubmit={async (b) => {
                if (
                  await act("session-edit", {
                    ...b,
                    id: edit.id,
                    start: new Date(b.start).toISOString(),
                  })
                )
                  setEdit(null);
              }}
            />
          )}
        </Dialog>
      )}
    </section>
  );
}

function SchedulePlanner({ data, act }) {
  const [plan, setPlan] = useState(null),
    [request, setRequest] = useState(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function preview(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPlan(null);
    const f = new FormData(e.currentTarget),
      b = Object.fromEntries(f);
    b.teamIds = f.getAll("teamIds");
    b.weekdays = f.getAll("weekdays").map(Number);
    b.blackoutDates = String(b.blackoutDates || "")
      .split(/[\s,]+/)
      .filter(Boolean);
    b.courts = [
      b.location,
      ...String(b.extraCourts || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean),
    ];
    b.teamBlackouts = Object.fromEntries(
      b.teamIds.map((id) => [
        id,
        String(f.get("blackout:" + id) || "")
          .split(/[\s,]+/)
          .filter(Boolean),
      ]),
    );
    for (const key of [
      "minutes",
      "days",
      "slots",
      "gap",
      "restHours",
      "maxGamesPerDay",
      "rounds",
    ])
      b[key] = Number(b[key]);
    try {
      const r = await fetch(
        e.nativeEvent.submitter?.value === "ai"
          ? "/api/schedule/assist"
          : "/api/schedule/preview",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token(),
          },
          body: JSON.stringify(b),
        },
      );
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Could not create a preview.");
      setRequest(result.request || b);
      setPlan(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="schedule-planner">
      <h3>League schedule planner</h3>
      <p className="muted">
        Choose teams in one division and a daily court window. Review
        suggestions before adding games to the shared calendar.
      </p>
      <form
        onSubmit={preview}
        onChange={() => {
          setPlan(null);
          setError("");
        }}
      >
        <fieldset>
          <legend>Teams · choose 2–12</legend>
          {data.teams.map((t) => (
            <label key={t.id}>
              <input type="checkbox" name="teamIds" value={t.id} /> {t.name} ·{" "}
              {t.division}
            </label>
          ))}
        </fieldset>
        <div className="form-row">
          <label>
            First daily slot
            <input type="datetime-local" name="start" required />
          </label>
          <label>
            Time zone
            <input
              name="timeZone"
              required
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            />
          </label>
        </div>
        <label>
          Court / location
          <input
            name="location"
            required
            maxLength={120}
            placeholder="Fieldhouse · Court 1"
          />
        </label>
        <div className="form-row">
          <label>
            Calendar days
            <input
              type="number"
              name="days"
              min="1"
              max="42"
              defaultValue="14"
              required
            />
          </label>
          <label>
            Daily slots
            <input
              type="number"
              name="slots"
              min="1"
              max="8"
              defaultValue="3"
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Game minutes
            <input
              type="number"
              name="minutes"
              min="15"
              max="180"
              defaultValue="60"
              required
            />
          </label>
          <label>
            Minutes between slots
            <input
              type="number"
              name="gap"
              min="0"
              max="120"
              defaultValue="15"
              required
            />
          </label>
        </div>
        <fieldset>
          <legend>Allowed weekdays</legend>
          {[
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ].map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                name="weekdays"
                value={i + 1}
                defaultChecked
              />{" "}
              {d}
            </label>
          ))}
        </fieldset>
        <label>
          Additional courts · one per line
          <textarea name="extraCourts" placeholder="Fieldhouse · Court 2" />
        </label>
        <label>
          Blackout dates · comma separated
          <input name="blackoutDates" placeholder="2027-01-10, 2027-01-17" />
        </label>
        <label>
          Maximum sessions per team per day
          <input
            name="maxGamesPerDay"
            type="number"
            min="1"
            max="4"
            defaultValue="1"
            required
          />
        </label>
        <label>
          Round robin rounds{" "}
          <select name="rounds">
            <option value="1">Single</option>
            <option value="2">Home and away</option>
          </select>
        </label>
        <label>
          Minimum hours of rest between sessions
          <input
            name="restHours"
            type="number"
            min="0"
            max="168"
            defaultValue="12"
            required
          />
        </label>
        <details>
          <summary>Team blackout dates</summary>
          {data.teams.map((t) => (
            <label key={t.id}>
              {t.name}
              <input
                name={"blackout:" + t.id}
                placeholder="YYYY-MM-DD, YYYY-MM-DD"
              />
            </label>
          ))}
        </details>
        <label>
          Optional AI request
          <textarea
            name="instructions"
            maxLength={1500}
            placeholder="Only Saturdays and Sundays, avoid January 10, and allow 24 hours of rest."
          />
        </label>
        <p className="muted">
          AI can interpret weekdays, global blackout dates and rest hours. It
          sends this request and date settings to OpenAI when connected. Review
          the resulting constraints before publishing.
        </p>
        <button className="btn secondary" value="ai" disabled={busy}>
          Ask AI for a draft
        </button>
        <button className="btn secondary" disabled={busy}>
          {busy ? "Checking bookings…" : "Preview schedule"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {plan && (
        <div aria-live="polite">
          <h4>{plan.games.length} proposed games</h4>
          <p className="muted">{plan.explanation}</p>
          {plan.aiExplanation && (
            <p>
              <b>AI draft:</b> {plan.aiExplanation}
              <br />
              Weekdays: {request.weekdays.join(", ")} (Monday = 1). Blackouts:{" "}
              {request.blackoutDates.join(", ") || "none"}. Rest:{" "}
              {request.restHours} hours.
            </p>
          )}
          {plan.games.map((g, i) => (
            <div className="feature-row" key={i}>
              <div>
                <b>{g.title}</b>
                <p>
                  {new Date(g.start).toLocaleString(undefined, {
                    timeZone: request.timeZone,
                  })}{" "}
                  · {request.timeZone}
                </p>
                <small>
                  {g.location} · {g.minutes} minutes
                </small>
              </div>
            </div>
          ))}
          {!plan.complete && (
            <p role="alert">
              Could not fit: {plan.unscheduled.join("; ")}. Extend the date
              window or change the court and preview again.
            </p>
          )}
          <button
            className="btn"
            disabled={busy || !plan.complete}
            onClick={async () => {
              setBusy(true);
              try {
                if (
                  await act("schedule-plan", {
                    ...request,
                    fingerprint: plan.fingerprint,
                  })
                )
                  setPlan(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add {plan.games.length} games to calendar
          </button>
        </div>
      )}
    </div>
  );
}

export function Playoffs({ data, act }) {
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState([]),
    [game, setGame] = useState(null),
    [stats, setStats] = useState(null);
  const games = data.games.filter(
    (g) => g.homeId && g.awayId && g.status !== "Bye",
  );
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Playoffs & player stats</h3>
        {staff(data) &&
          button("Create bracket", () => {
            setSelected([]);
            setCreating(true);
          })}
      </div>
      {!data.brackets?.length && (
        <p className="feature-empty">
          Create a seeded bracket for 2–16 teams in one division. Winners
          advance automatically.
        </p>
      )}
      {data.brackets?.map((b) => (
        <div className="bracket-block" key={b.id}>
          <h3>
            {b.name} <span className="badge">{b.division}</span>
          </h3>
          {b.championId && (
            <p className="champion">
              Champion: {title(data.teams, b.championId)}
            </p>
          )}
          <div className="bracket">
            {b.rounds.map((round, r) => (
              <div className="bracket-round" key={r}>
                <small>
                  {r === b.rounds.length - 1 ? "FINAL" : `ROUND ${r + 1}`}
                </small>
                {round.map((id) => {
                  const g = data.games.find((g) => g.id === id);
                  return (
                    <article key={id} className="bracket-game">
                      <span className="badge">{g.status}</span>
                      <div>
                        <b>{title(data.teams, g.homeId)}</b>
                        <strong>{g.homeScore}</strong>
                      </div>
                      <div>
                        <b>{title(data.teams, g.awayId)}</b>
                        <strong>{g.awayScore}</strong>
                      </div>
                      {staff(data) &&
                        g.homeId &&
                        g.awayId &&
                        button("Score game", () => setGame(g))}
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="feature-pad">
        <h3>Individual game statistics</h3>
        {staff(data) && button("Record player stats", () => setStats({}))}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Game</th>
                <th>PTS</th>
                <th>REB</th>
                <th>AST</th>
                <th>STL</th>
                <th>BLK</th>
                <th>PF</th>
              </tr>
            </thead>
            <tbody>
              {data.gameStats?.map((s) => {
                const g = data.games.find((g) => g.id === s.gameId);
                return (
                  <tr key={s.id}>
                    <td>{title(data.players, s.playerId)}</td>
                    <td>
                      {title(data.teams, g?.homeId)} /{" "}
                      {title(data.teams, g?.awayId)}
                    </td>
                    {[
                      "points",
                      "rebounds",
                      "assists",
                      "steals",
                      "blocks",
                      "fouls",
                    ].map((k) => (
                      <td key={k}>{s[k]}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {creating && (
        <Dialog
          title="Create a playoff bracket"
          close={() => setCreating(false)}
        >
          <FieldsForm
            fields={[{ name: "name", label: "Bracket name" }]}
            label="Generate bracket"
            onSubmit={async (b) => {
              if (await act("bracket-create", { ...b, teamIds: selected }))
                setCreating(false);
            }}
          >
            <p className="muted">
              Select teams in seed order. All teams must be in the same
              division; byes go to the highest seeds.
            </p>
            <div className="team-choices">
              {data.teams.map((t) => (
                <label className="checkbox" key={t.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(t.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, t.id]
                          : selected.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {selected.includes(t.id)
                    ? `#${selected.indexOf(t.id) + 1} `
                    : ""}
                  {t.name} · {t.division}
                </label>
              ))}
            </div>
          </FieldsForm>
        </Dialog>
      )}
      {game && (
        <Dialog title="Playoff scoresheet" close={() => setGame(null)}>
          <p>
            {title(data.teams, game.homeId)} vs.{" "}
            {title(data.teams, game.awayId)}
          </p>
          <FieldsForm
            initial={game}
            fields={[
              {
                name: "homeScore",
                label: "Home score",
                type: "number",
                max: 500,
              },
              {
                name: "awayScore",
                label: "Away score",
                type: "number",
                max: 500,
              },
              {
                name: "status",
                label: "Status",
                options: ["Scheduled", "Live", "Final"],
              },
            ]}
            onSubmit={async (b) => {
              if (
                await act("score", {
                  ...b,
                  id: game.id,
                  version: game.controlVersion || 0,
                })
              )
                setGame(null);
            }}
          />
          <p className="muted">
            Final games must have a winner. Participant changes are blocked once
            a later round starts.
          </p>
        </Dialog>
      )}
      {stats && (
        <Dialog title="Record player statistics" close={() => setStats(null)}>
          <FieldsForm
            fields={[
              {
                name: "gameId",
                label: "Game",
                options: games.map((g) => ({
                  value: g.id,
                  label: `${title(data.teams, g.homeId)} vs. ${title(data.teams, g.awayId)}`,
                })),
              },
              { name: "playerId", label: "Player", options: opt(data.players) },
              ...[
                "points",
                "rebounds",
                "assists",
                "steals",
                "blocks",
                "fouls",
              ].map((name) => ({
                name,
                label: name.toUpperCase(),
                type: "number",
                default: 0,
                max: name === "fouls" ? 6 : 200,
              })),
            ]}
            onSubmit={async (b) => {
              if (await act("game-stats", b)) setStats(null);
            }}
          />
          <p className="muted">
            Saving replaces that player’s line for the selected game. Only
            players on a participating team are accepted.
          </p>
        </Dialog>
      )}
    </section>
  );
}

const startFrame = [
  { x: 50, y: 70 },
  { x: 20, y: 55 },
  { x: 80, y: 55 },
  { x: 30, y: 25 },
  { x: 70, y: 25 },
];
export function CoachingTools({ data, act }) {
  const [tab, setTab] = useState("Playbook"),
    [showArchived, setShowArchived] = useState(false),
    [play, setPlay] = useState(null),
    [drill, setDrill] = useState(null),
    [video, setVideo] = useState(null);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Coaching studio</h3>
        <div className="pills">
          {["Playbook", "Drill builder", "Video analysis"].map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="feature-pad">
        {tab === "Playbook" && (
          <>
            {coach(data) &&
              button("Create a play", () =>
                setPlay({
                  name: "",
                  teamId: data.channels[0],
                  notes: "",
                  frames: [structuredClone(startFrame)],
                }),
              )}
            {coach(data) && (
              <label>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />{" "}
                Show archived plays
              </label>
            )}
            <div className="studio-grid">
              {data.plays
                ?.filter((p) => !!p.archivedAt === showArchived)
                .map((p) => (
                  <div className="mini-card" key={p.id}>
                    <h3>{p.name}</h3>
                    <p>
                      {title(data.teams, p.teamId)} · {p.frames.length} frames{" "}
                      {p.archivedAt ? "· Archived" : ""}
                    </p>
                    <CourtBoard frames={p.frames} routes={p.routes || []} />
                    <p>{p.notes}</p>
                    {coach(data) &&
                      button("Edit play", () => setPlay(structuredClone(p)))}
                    {coach(data) &&
                      button(
                        p.archivedAt ? "Restore play" : "Archive play",
                        () =>
                          act(p.archivedAt ? "play-restore" : "play-archive", {
                            id: p.id,
                          }),
                      )}
                  </div>
                ))}
            </div>
            {!data.plays?.length && (
              <p className="feature-empty">
                Map the movement. Save a play. Walk your team through it.
              </p>
            )}
          </>
        )}
        {tab === "Drill builder" && (
          <>
            {coach(data) &&
              button("Create drill", () =>
                setDrill({
                  category: "Strength",
                  minutes: 20,
                  sets: 3,
                  reps: 10,
                  rest: 30,
                }),
              )}
            <div className="studio-grid">
              {data.drills.map((d) => (
                <div className="mini-card" key={d.id}>
                  <span className="badge">{d.category}</span>
                  <h3>{d.name}</h3>
                  <p>{d.instructions}</p>
                  <p>
                    {d.sets || 1} sets × {d.reps || 1} reps · {d.rest ?? 30}s
                    rest · {d.minutes} min
                  </p>
                  {coach(data) && button("Edit drill", () => setDrill(d))}
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "Video analysis" && (
          <>
            {coach(data) && button("Add training video", () => setVideo({}))}
            {staff(data) && <DriveImport data={data} />}
            <div className="studio-grid">
              {data.videos?.map((v) => (
                <VideoReview
                  key={v.id}
                  video={v}
                  canEdit={coach(data)}
                  act={act}
                />
              ))}
            </div>
            {!data.videos?.length && (
              <p className="feature-empty">
                Upload a clip or add an HTTPS video link to tag moments and draw
                arrows.
              </p>
            )}
          </>
        )}
      </div>
      {play && (
        <Dialog
          title={play.id ? "Edit tactical play" : "Create tactical play"}
          close={() => setPlay(null)}
        >
          <PlayEditor
            initial={play}
            teams={data.teams.filter((t) => data.channels.includes(t.id))}
            onSave={async (p) => {
              if (await act("play-save", p)) setPlay(null);
            }}
          />
        </Dialog>
      )}
      {drill && (
        <Dialog
          title={drill.id ? "Edit drill" : "Create drill"}
          close={() => setDrill(null)}
        >
          <FieldsForm
            initial={drill}
            fields={[
              { name: "name", label: "Drill name" },
              {
                name: "category",
                label: "Category",
                options: [
                  "Shooting",
                  "Ball handling",
                  "Strength",
                  "Conditioning",
                  "Team tactics",
                ],
              },
              { name: "instructions", label: "Instructions", type: "textarea" },
              ...["minutes", "sets", "reps", "rest"].map((name) => ({
                name,
                label: name === "rest" ? "Rest between sets (seconds)" : name,
                type: "number",
                min: name === "rest" ? 0 : 1,
                max: { minutes: 180, sets: 30, reps: 1000, rest: 600 }[name],
              })),
            ]}
            onSubmit={async (b) => {
              if (await act("drill-save", { ...b, id: drill.id }))
                setDrill(null);
            }}
          />
        </Dialog>
      )}
      {video && (
        <Dialog title="Add training video" close={() => setVideo(null)}>
          <VideoForm
            teams={data.teams.filter((t) => data.channels.includes(t.id))}
            act={act}
            close={() => setVideo(null)}
          />
        </Dialog>
      )}
    </section>
  );
}
function CourtBoard({
  frames,
  frame,
  onMove,
  selected,
  setSelected,
  routes = [],
}) {
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % frames.length),
      900,
    );
    return () => clearInterval(timer);
  }, [playing, frames.length]);
  const i = frame ?? Math.min(index, frames.length - 1),
    points = frames[i];
  return (
    <>
      <svg
        className="tactics-court"
        viewBox="0 0 100 100"
        role="img"
        aria-label="Basketball tactical diagram"
        onClick={
          onMove
            ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                onMove({
                  x: Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(((e.clientX - rect.left) / rect.width) * 100),
                    ),
                  ),
                  y: Math.max(
                    0,
                    Math.min(
                      100,
                      Math.round(((e.clientY - rect.top) / rect.height) * 100),
                    ),
                  ),
                });
              }
            : undefined
        }
      >
        <rect x="1" y="1" width="98" height="98" />
        <path d="M32 1v35h36V1M5 1v18a45 45 0 0 0 90 0V1M1 99h98" />
        <circle cx="50" cy="36" r="18" />
        <circle cx="50" cy="8" r="3" />
        {routes
          .filter((r) => r.frame === i)
          .map((r, k) => (
            <g key={"route" + k}>
              <line
                x1={points[r.player].x}
                y1={points[r.player].y}
                x2={r.x}
                y2={r.y}
                style={{
                  stroke: r.kind === "pass" ? "#ffb286" : "#38b6ff",
                  strokeWidth: 1,
                  strokeDasharray: r.kind === "cut" ? "none" : "3 2",
                }}
              />
              <text x={r.x} y={r.y} style={{ fontSize: 3, fill: "#ffffff" }}>
                {r.kind}
              </text>
            </g>
          ))}
        {points.map((p, j) => (
          <g
            key={j}
            className={"tactics-player " + (selected === j ? "chosen" : "")}
            style={{ transform: `translate(${p.x}px,${p.y}px)` }}
            onClick={(e) => {
              if (setSelected) {
                e.stopPropagation();
                setSelected(j);
              }
            }}
          >
            <circle r="5" style={j >= 5 ? { fill: "#b94439" } : undefined} />
            <text textAnchor="middle" y="1.8">
              {j >= 5 ? "D" + (j - 4) : j + 1}
            </text>
          </g>
        ))}
      </svg>
      {frame === undefined && (
        <div className="play-controls">
          {button(playing ? <Pause size={15} /> : <Play size={15} />, () =>
            setPlaying(!playing),
          )}
          <input
            aria-label="Play frame"
            type="range"
            min="0"
            max={frames.length - 1}
            value={i}
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
          <span>
            {i + 1}/{frames.length}
          </span>
        </div>
      )}
    </>
  );
}
function PlayEditor({ initial, teams, onSave }) {
  const [routes, setRoutes] = useState(initial.routes || []),
    [routeKind, setRouteKind] = useState("cut");
  const [frames, setFrames] = useState(initial.frames),
    [frame, setFrame] = useState(0),
    [selected, setSelected] = useState(0);
  const move = (p) =>
    setFrames((fs) =>
      fs.map((f, i) =>
        i === frame ? f.map((old, j) => (j === selected ? p : old)) : f,
      ),
    );
  return (
    <FieldsForm
      fields={[
        { name: "name", label: "Play name" },
        { name: "teamId", label: "Team", options: opt(teams) },
        {
          name: "notes",
          label: "Coaching notes",
          type: "textarea",
          required: false,
        },
      ]}
      initial={initial}
      onSubmit={(b) => onSave({ ...b, id: initial.id, frames, routes })}
    >
      <p className="muted">
        Select a player number, then click the court to move them. Add frames to
        animate the next movement.
      </p>
      <div className="pills">
        {frames[frame].map((_, i) => (
          <button
            type="button"
            key={i}
            className={selected === i ? "selected" : ""}
            onClick={() => setSelected(i)}
          >
            {i >= 5 ? "Defender " + (i - 4) : "Player " + (i + 1)}
          </button>
        ))}
      </div>
      <CourtBoard
        frames={frames}
        routes={routes}
        frame={frame}
        selected={selected}
        setSelected={setSelected}
        onMove={move}
      />
      <div className="inline">
        <label>
          X
          <input
            type="number"
            min="0"
            max="100"
            value={frames[frame][selected].x}
            onChange={(e) =>
              move({
                ...frames[frame][selected],
                x: Math.min(100, Math.max(0, Number(e.target.value))),
              })
            }
          />
        </label>
        <label>
          Y
          <input
            type="number"
            min="0"
            max="100"
            value={frames[frame][selected].y}
            onChange={(e) =>
              move({
                ...frames[frame][selected],
                y: Math.min(100, Math.max(0, Number(e.target.value))),
              })
            }
          />
        </label>
      </div>
      <div className="inline">
        {button(
          "Add five defenders",
          () =>
            setFrames(
              frames.map((f) => [
                ...f,
                ...startFrame.map((p) => ({
                  x: p.x,
                  y: Math.min(100, p.y + 10),
                })),
              ]),
            ),
          frames[0].length === 10,
        )}
        <label>
          Route type
          <select
            value={routeKind}
            onChange={(e) => setRouteKind(e.target.value)}
          >
            <option value="cut">Cut</option>
            <option value="dribble">Dribble</option>
            <option value="pass">Pass</option>
          </select>
        </label>
        {button(
          "Add route to next-frame position",
          () =>
            setRoutes([
              ...routes,
              {
                frame,
                player: selected,
                kind: routeKind,
                ...frames[frame + 1][selected],
              },
            ]),
          frame >= frames.length - 1 || routes.length >= 200,
        )}
        {button("Clear this frame's routes", () =>
          setRoutes(routes.filter((r) => r.frame !== frame)),
        )}
      </div>
      <p className="muted">
        Routes connect the selected player's position to their next-frame
        position. Add and position the next frame, then return here to add a
        cut, dribble or pass route.
      </p>
      <div className="pills">
        {frames.map((_, i) => (
          <button
            type="button"
            key={i}
            className={i === frame ? "selected" : ""}
            onClick={() => setFrame(i)}
          >
            Frame {i + 1}
          </button>
        ))}
      </div>
      {button(
        "Add next frame",
        () => {
          setFrames([...frames, structuredClone(frames[frame])]);
          setFrame(frames.length);
        },
        frames.length >= 20,
      )}
    </FieldsForm>
  );
}
const uploadKeys = new WeakMap();
async function upload(file, purpose, teamId) {
  if (!uploadKeys.has(file)) uploadKeys.set(file, crypto.randomUUID());
  const params = new URLSearchParams({
    name: file.name,
    purpose,
    ...(teamId ? { teamId } : {}),
  });
  const r = await fetch("/api/files?" + params, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token(),
      "Content-Type": "application/octet-stream",
      "X-Upload-Key": uploadKeys.get(file) + (teamId ? "_" + teamId : ""),
    },
    body: file,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error);
  return d;
}
function VideoForm({ teams, act, close }) {
  const [file, setFile] = useState(null),
    [error, setError] = useState("");
  return (
    <>
      <FieldsForm
        fields={[
          { name: "name", label: "Video title" },
          { name: "teamId", label: "Team", options: opt(teams) },
          {
            name: "url",
            label: "HTTPS video link (or upload below)",
            type: "url",
            required: false,
          },
        ]}
        label="Add video"
        onSubmit={async (b) => {
          try {
            setError("");
            if (file) {
              const f = await upload(file, "video", b.teamId);
              b.fileId = f.id;
              b.url = "";
            }
            if (await act("video-save", b)) close();
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <label>
          Upload MP4 / WebM (up to 100 MB)
          <input
            type="file"
            accept="video/mp4,video/webm"
            onChange={(e) => setFile(e.target.files[0])}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </FieldsForm>
    </>
  );
}
function VideoReview({ video, canEdit, act }) {
  const ref = useRef(null);
  const [src, setSrc] = useState(video.url),
    [error, setError] = useState(""),
    [drawing, setDrawing] = useState(false),
    [lines, setLines] = useState([]),
    [from, setFrom] = useState(null),
    [label, setLabel] = useState(""),
    [active, setActive] = useState(null),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!video.fileId) return;
    let url,
      dead = false;
    fetch("/api/media/" + video.fileId + "/playback", {
      headers: { Authorization: "Bearer " + token() },
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.blob();
      })
      .then((b) => {
        url = URL.createObjectURL(b);
        if (!dead) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => setError("Video could not be loaded."));
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [video.fileId]);
  const point = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * 100,
      ((e.clientY - r.top) / r.height) * 100,
    ];
  };
  return (
    <article className="mini-card">
      <h3>{video.name}</h3>
      <div className="video-stage">
        <video
          ref={ref}
          src={src}
          controls={!drawing}
          onError={() =>
            setError(
              "Video unavailable. Check that the URL points to a playable MP4 or WebM.",
            )
          }
          onPlay={() => setActive(null)}
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ pointerEvents: drawing ? "auto" : "none" }}
          onPointerDown={(e) => {
            if (!drawing) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setFrom(point(e));
          }}
          onPointerUp={(e) => {
            if (!drawing || !from) return;
            setLines([
              ...lines,
              [...from, ...point(e).map((n) => Math.min(100, Math.max(0, n)))],
            ]);
            setFrom(null);
          }}
        >
          <defs>
            <marker
              id={"arrow-" + video.id}
              markerWidth="4"
              markerHeight="4"
              refX="3"
              refY="2"
              orient="auto"
            >
              <path d="M0 0L4 2L0 4Z" fill="#ffd46a" />
            </marker>
          </defs>
          {(active?.lines || lines).map(([x1, y1, x2, y2], i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#ffd46a"
              strokeWidth=".7"
              markerEnd={"url(#arrow-" + video.id + ")"}
            />
          ))}
        </svg>
      </div>
      {canEdit && (
        <>
          <div className="inline">
            {button(drawing ? "Finish drawing" : "Pause & draw", () => {
              ref.current?.pause();
              setDrawing(!drawing);
              setActive(null);
            })}
            {button("Clear arrows", () => {
              setLines([]);
              setActive(null);
            })}
          </div>
          <form
            className="annotation-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                if (
                  await act("video-tag", {
                    id: video.id,
                    label,
                    seconds: ref.current?.currentTime || 0,
                    lines,
                  })
                ) {
                  setLabel("");
                  setLines([]);
                  setDrawing(false);
                }
              } finally {
                setSaving(false);
              }
            }}
          >
            <input
              aria-label="Moment label"
              placeholder="What should the player notice?"
              required
              maxLength={160}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button className="btn" disabled={saving}>
              Tag moment
            </button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="video-tags">
        {video.tags.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              ref.current.currentTime = t.seconds;
              ref.current.pause();
              setDrawing(false);
              setActive(t);
            }}
          >
            <span>
              {Math.floor(t.seconds / 60)}:
              {String(Math.floor(t.seconds % 60)).padStart(2, "0")}
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </article>
  );
}

export function Management({ data, act }) {
  const [kind, setKind] = useState("Families"),
    [edit, setEdit] = useState(null);
  const configs = {
    Families: {
      rows: data.families,
      action: "family-save",
      fields: [
        { name: "name", label: "Family name" },
        { name: "email", label: "Email", type: "email" },
        {
          name: "membership",
          label: "Membership",
          options: ["Active", "Pending", "Expired"],
        },
      ],
    },
    Players: {
      rows: data.players,
      action: "player-save",
      fields: [
        { name: "name", label: "Player name" },
        { name: "familyId", label: "Family", options: opt(data.families) },
        { name: "teamId", label: "Team", options: opt(data.teams) },
        { name: "age", label: "Age", type: "number", min: 4, max: 100 },
        { name: "number", label: "Jersey number", type: "number", max: 99 },
      ],
    },
    Teams: {
      rows: data.teams,
      action: "team-save",
      fields: [
        { name: "name", label: "Team name" },
        { name: "coach", label: "Coach name" },
        { name: "division", label: "Division", default: "U14" },
      ],
    },
    Programs: {
      rows: data.programs,
      action: "program-edit",
      noAdd: true,
      fields: [
        { name: "name", label: "Program name" },
        { name: "description", label: "Description", type: "textarea" },
        { name: "ages", label: "Age range" },
        { name: "location", label: "Location" },
        { name: "price", label: "Price (CAD)", type: "number", max: 10000 },
        {
          name: "capacity",
          label: "Capacity",
          type: "number",
          min: 1,
          max: 500,
        },
        {
          name: "sessions",
          label: "Sessions",
          type: "number",
          min: 1,
          max: 100,
        },
      ],
    },
    Products: {
      rows: data.products,
      action: "product-save",
      fields: [
        { name: "name", label: "Product name" },
        { name: "category", label: "Category", default: "ESSENTIALS" },
        { name: "color", label: "Color" },
        { name: "price", label: "Price (CAD)", type: "number", max: 10000 },
        {
          name: "sizes",
          label: "Sizes, separated by commas",
          default: "S,M,L",
        },
        {
          name: "stock",
          label: "Initial stock for new sizes",
          type: "number",
          default: 0,
          max: 10000,
        },
        {
          name: "creditEligible",
          label: "Eligible for tee credits",
          type: "checkbox",
        },
      ],
    },
  };
  const config = configs[kind];
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Manage your community</h3>
      </div>
      <div className="feature-pad">
        <div className="pills">
          {Object.keys(configs).map((k) => (
            <button
              key={k}
              className={kind === k ? "selected" : ""}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
        {!config.noAdd && (
          <div className="space-top">
            {button(
              "Add " +
                kind.toLowerCase().replace(/ies$/, "y").replace(/s$/, ""),
              () => setEdit({}),
            )}
          </div>
        )}
        {kind === "Products" && (
          <p>
            Archiving hides a product and releases unsubmitted carts containing
            it. Existing orders and inventory are retained. Restore it here at
            any time.
          </p>
        )}
        {config.rows.map((row) => (
          <div className="feature-row" key={row.id}>
            <div>
              <b>
                {row.name}
                {kind === "Products" && row.archivedAt
                  ? " · Archived (hidden from store)"
                  : ""}
              </b>
              <p>
                {row.email ||
                  row.division ||
                  row.location ||
                  row.color ||
                  title(data.teams, row.teamId)}
              </p>
            </div>
            {kind === "Products" &&
              button(
                row.archivedAt ? "Restore product" : "Archive product",
                () =>
                  act(row.archivedAt ? "product-restore" : "product-archive", {
                    id: row.id,
                  }),
              )}
            {button("Edit", () =>
              setEdit({
                ...row,
                sizes: Array.isArray(row.sizes)
                  ? row.sizes.join(",")
                  : row.sizes,
                stock: 0,
              }),
            )}
          </div>
        ))}
      </div>
      {edit && (
        <Dialog
          title={(edit.id ? "Edit " : "Add ") + kind.toLowerCase()}
          close={() => setEdit(null)}
        >
          <FieldsForm
            fields={config.fields}
            initial={edit}
            onSubmit={async (b) => {
              if (await act(config.action, { ...b, id: edit.id }))
                setEdit(null);
            }}
          />
        </Dialog>
      )}
    </section>
  );
}
export function StoreTools({ data, act }) {
  const [restock, setRestock] = useState(null),
    [cancel, setCancel] = useState(null);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Inventory & fulfillment</h3>
        <ReportButton type="orders" label="Export orders" />
      </div>
      <div className="feature-pad">
        <h3>Stock by size</h3>
        {data.products.map((p) => (
          <div className="feature-row" key={p.id}>
            <div>
              <b>
                {p.name} · {p.color}
              </b>
              <p>{p.sizes.map((s) => `${s}: ${p.stock[s]}`).join(" · ")}</p>
            </div>
            {button("Add stock", () => setRestock(p))}
          </div>
        ))}
        <h3 className="space-top">Delivery labels</h3>
        <div className="label-grid">
          {data.orders
            .filter((o) => o.status !== "Cancelled")
            .map((o) => (
              <article key={o.id} className="delivery-label">
                <small>THE BASKETBALL EXPERIENCE</small>
                <h3>{title(data.players, o.playerId)}</h3>
                <p>Coach: {o.coach}</p>
                <p>
                  {title(data.products, o.productId)} · {o.color || ""} ·{" "}
                  {o.size} × {o.quantity}
                </p>
                <small>
                  {o.id.slice(0, 8)} · {o.status}
                </small>
                {o.status !== "Delivered" &&
                  !o.cartId &&
                  button("Cancel order", () => setCancel(o))}
              </article>
            ))}
        </div>
        {button("Print delivery labels", () => window.print())}
      </div>
      {restock && (
        <Dialog
          title={"Restock " + restock.name}
          close={() => setRestock(null)}
        >
          <FieldsForm
            fields={[
              { name: "size", label: "Size", options: restock.sizes },
              {
                name: "quantity",
                label: "Quantity to add",
                type: "number",
                min: 1,
                max: 10000,
              },
            ]}
            onSubmit={async (b) => {
              if (await act("restock", { ...b, id: restock.id }))
                setRestock(null);
            }}
          />
        </Dialog>
      )}
      {cancel && (
        <Dialog title="Cancel order?" close={() => setCancel(null)}>
          <p>
            This restores stock and any tee credits used. It does not issue a
            payment refund.
          </p>
          {button("Confirm cancellation", async () => {
            if (await act("order-cancel", { id: cancel.id })) setCancel(null);
          })}
        </Dialog>
      )}
    </section>
  );
}
export function StaffOnboarding({ data, act, refresh }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const profile = data.staffProfiles?.find((p) => p.userId === data.user.id);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Staff onboarding</h3>
        <span className="badge">{profile?.status || "Not submitted"}</span>
      </div>
      <div className="feature-pad">
        <FieldsForm
          key={profile?.updatedAt || "new"}
          initial={profile || {}}
          fields={[
            { name: "phone", label: "Contact phone" },
            { name: "emergencyContact", label: "Emergency contact" },
            {
              name: "availability",
              label: "Availability and qualifications",
              type: "textarea",
            },
          ]}
          label="Submit profile"
          onSubmit={(b) => act("staff-profile", b)}
        />
        <p className="muted">
          Use sample details in this local demo. Documents are visible only to
          the uploader and administrators.
        </p>
        <label className="upload-label">
          <Upload size={18} />
          {busy
            ? "Uploading…"
            : "Upload a staff document (PDF, PNG or JPEG; up to 10 MB)"}
          <input
            disabled={busy}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              setBusy(true);
              try {
                setError("");
                await upload(file, "staff");
                await refresh();
              } catch (err) {
                setError(err.message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {data.files
          ?.filter((f) => f.purpose === "staff")
          .map((f) => (
            <div className="feature-row" key={f.id}>
              <span>
                {f.name} · {title(data.staffDirectory, f.ownerId)}
              </span>
              {button("Download", () =>
                download("files/" + f.id, f.name).catch((e) =>
                  setError(e.message),
                ),
              )}
            </div>
          ))}
        {data.user.role === "admin" && (
          <>
            <h3 className="space-top">Review submissions</h3>
            {data.staffProfiles?.map((p) => (
              <div className="mini-card" key={p.userId}>
                <h3>{title(data.staffDirectory, p.userId)}</h3>
                <p>
                  {p.phone} · {p.availability}
                </p>
                <p>Emergency contact: {p.emergencyContact}</p>
                <FieldsForm
                  initial={p}
                  fields={[
                    {
                      name: "status",
                      label: "Review status",
                      options: ["Submitted", "Approved", "Needs changes"],
                    },
                    {
                      name: "reviewNote",
                      label: "Review notes",
                      type: "textarea",
                      required: false,
                    },
                  ]}
                  onSubmit={(b) =>
                    act("staff-review", { ...b, userId: p.userId })
                  }
                />
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
export function EnrollmentTools({ data, act }) {
  const [cancel, setCancel] = useState(null);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Registration management</h3>
      </div>
      {data.enrollments.map((e) => (
        <div className="feature-row" key={e.id}>
          <div>
            <b>{title(data.players, e.playerId)}</b>
            <p>
              {title(data.programs, e.programId)} · {e.status}
            </p>
          </div>
          {e.status === "Active" &&
            button("Cancel registration", () => setCancel(e))}
        </div>
      ))}
      {cancel && (
        <Dialog title="Cancel registration?" close={() => setCancel(null)}>
          <p>
            This frees the program place and removes this player from its
            sessions. Payment refunds require a separate process.
          </p>
          {button("Confirm cancellation", async () => {
            if (await act("enrollment-cancel", { id: cancel.id }))
              setCancel(null);
          })}
        </Dialog>
      )}
    </section>
  );
}
export function AuditLog({ data }) {
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Activity log</h3>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.audit?.slice(0, 30).map((a) => (
              <tr key={a.id}>
                <td>{date(a.createdAt)}</td>
                <td>{a.actor}</td>
                <td>{a.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function Billing({ data }) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState(false);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => setConfigured(c.payments === "stripe-test"))
      .catch(() => {});
  }, []);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Invoices & payments</h3>
        <span className="badge">
          {configured ? "Stripe test mode" : "Payments not connected"}
        </span>
      </div>
      <p className="feature-empty">
        Invoices are created for new registrations and store orders. Test
        payments never charge real money. A checkout return alone does not mark
        an invoice paid.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Description</th>
              <th>Total CAD</th>
              <th>Status</th>
              <th>Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices?.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.id.slice(0, 8)}
                  <small className="block">
                    {new Date(i.createdAt).toLocaleDateString()}
                  </small>
                </td>
                <td>{i.description}</td>
                <td>${(i.amountCents / 100).toFixed(2)}</td>
                <td>
                  <span className="badge">{i.status}</span>
                  <small className="block">
                    {i.recoveryStatus}
                    {i.refundedCents
                      ? ` · Refunded ${(i.refundedCents / 100).toFixed(2)}`
                      : ""}
                  </small>
                </td>
                <td>
                  {i.status === "Unpaid" &&
                    button(
                      busy === i.id
                        ? "Opening…"
                        : i.recoveryStatus
                          ? "Retry test checkout"
                          : "Test checkout",
                      async () => {
                        setBusy(i.id);
                        setError("");
                        try {
                          const r = await fetch("/api/billing/checkout", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              Authorization: "Bearer " + token(),
                            },
                            body: JSON.stringify({ invoiceId: i.id }),
                          });
                          const result = await r.json();
                          if (!r.ok) throw Error(result.error);
                          const url = new URL(result.url);
                          if (
                            url.protocol !== "https:" ||
                            url.hostname !== "checkout.stripe.com"
                          )
                            throw Error("Unexpected checkout destination.");
                          window.location.assign(url.href);
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy("");
                        }
                      },
                      !configured || !!busy,
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function RegistrationForms({ data, act }) {
  const [open, setOpen] = useState(false),
    [fields, setFields] = useState([]);
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Registration forms & waivers</h3>
        {button("Create a form version", () => {
          setFields([]);
          setOpen(true);
        })}
      </div>
      {data.forms?.map((f) => (
        <div className="feature-row" key={f.id}>
          <div>
            <b>
              {f.title} · version {f.version}
            </b>
            <p>
              {title(data.programs, f.programId)} · {f.fields.length} questions
            </p>
          </div>
          <span className="badge">
            {data.programs.find((p) => p.id === f.programId)?.formId === f.id
              ? "Current"
              : "Archived version"}
          </span>
        </div>
      ))}
      {open && (
        <Dialog title="Create registration form" close={() => setOpen(false)}>
          <FieldsForm
            fields={[
              { name: "title", label: "Form title" },
              {
                name: "programId",
                label: "Attach to program",
                options: opt(data.programs),
              },
              {
                name: "waiverText",
                label: "Registration terms / waiver text",
                type: "textarea",
                maxLength: 8000,
              },
            ]}
            label="Save new version"
            onSubmit={async (b) => {
              if (await act("form-save", { ...b, fields })) setOpen(false);
            }}
          >
            <p className="muted">
              Existing signed records keep their original terms. Use
              organization-approved wording before real registrations.
            </p>
            {fields.map((f, i) => (
              <div className="mini-card" key={i}>
                <label>
                  Question {i + 1}
                  <input
                    value={f.label}
                    required
                    maxLength={160}
                    onChange={(e) =>
                      setFields((fs) =>
                        fs.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Answer type
                  <select
                    value={f.type}
                    onChange={(e) =>
                      setFields((fs) =>
                        fs.map((x, j) =>
                          j === i ? { ...x, type: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    <option value="text">Written answer</option>
                    <option value="checkbox">Confirmation checkbox</option>
                    {["textarea", "email", "number", "date", "select"].map(
                      (t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                {f.type === "select" && (
                  <label>
                    Choices, one per line
                    <textarea
                      required
                      value={(f.options || []).join("\n")}
                      onChange={(e) =>
                        setFields((fs) =>
                          fs.map((x, j) =>
                            j === i
                              ? { ...x, options: e.target.value.split("\n") }
                              : x,
                          ),
                        )
                      }
                    />
                  </label>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setFields((fs) =>
                        fs.map((x, j) =>
                          j === i ? { ...x, required: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  Required
                </label>
                {button("Remove question", () =>
                  setFields((fs) => fs.filter((_, j) => j !== i)),
                )}
              </div>
            ))}
            {button(
              "Add question",
              () =>
                setFields([
                  ...fields,
                  { label: "", type: "text", required: true },
                ]),
              fields.length >= 20,
            )}
          </FieldsForm>
        </Dialog>
      )}
      <div className="feature-pad">
        <h3>Signed records</h3>
        {data.waivers.map((w) => (
          <details className="mini-card" key={w.id}>
            <summary>
              {title(data.players, w.playerId)} ·{" "}
              {w.title || "Sample acknowledgement"} · {date(w.signedAt)}
            </summary>
            <p style={{ whiteSpace: "pre-wrap" }}>{w.text}</p>
            <p>
              Signed by {w.signature} · version {w.version}
            </p>
            {w.fields?.map((f) => (
              <p key={f.id}>
                <b>{f.label}:</b> {String(w.answers?.[f.id] ?? "")}
              </p>
            ))}
          </details>
        ))}
      </div>
    </section>
  );
}
