import React, { useState } from "react";
import {
  dayKey,
  fromDay,
  daysFor,
  moveCalendar,
  eventsOnDay,
} from "./calendar-utils.mjs";
import "./calendar.css";
export function FamilyCalendar({ events, renderEvent, onOpen }) {
  const [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(() => new Date()),
    [selected, setSelected] = useState(() => dayKey(new Date())),
    [showCancelled, setShowCancelled] = useState(false);
  const filtered = events.filter(
      (e) => showCancelled || e.status !== "Cancelled",
    ),
    days = daysFor(anchor, view),
    selectedDate = fromDay(selected),
    selectedEvents = eventsOnDay(filtered, selectedDate);
  const period =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : days[0].toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        }) +
        " – " +
        days[6].toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
  function navigate(next) {
    setAnchor(next);
    setSelected(dayKey(next));
  }
  return (
    <section className="card family-calendar">
      <div className="calendar-controls">
        <div className="pills" aria-label="Calendar view">
          {["month", "week", "agenda"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              className={view === v ? "selected" : ""}
              onClick={() => {
                setAnchor(selectedDate);
                setView(v);
              }}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <label className="calendar-cancelled">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
          />
          Show cancelled sessions
        </label>
      </div>
      {view === "agenda" ? (
        <>
          {filtered.map(renderEvent)}
          {!filtered.length && (
            <p className="feature-empty">No sessions match your selection.</p>
          )}
        </>
      ) : (
        <>
          <div className="calendar-controls">
            <div>
              <button
                className="btn secondary"
                aria-label={"Previous " + view}
                onClick={() => navigate(moveCalendar(anchor, view, -1))}
              >
                Previous
              </button>
              <button
                className="btn secondary"
                onClick={() => navigate(new Date())}
              >
                Today
              </button>
              <button
                className="btn secondary"
                aria-label={"Next " + view}
                onClick={() => navigate(moveCalendar(anchor, view, 1))}
              >
                Next
              </button>
            </div>
            <h3 aria-live="polite">{period}</h3>
            <label>
              Go to date
              <input
                type="date"
                aria-label="Go to date"
                value={selected}
                onChange={(e) => {
                  const d = fromDay(e.target.value);
                  if (d) navigate(d);
                }}
              />
            </label>
          </div>
          <p className="calendar-zone">
            Times shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.
            Select a day for full session details.
          </p>
          <div className="calendar-scroll">
            <div className={"calendar-grid " + view}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div className="calendar-weekday" key={d}>
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = dayKey(day),
                  rows = eventsOnDay(filtered, day);
                return (
                  <div
                    key={key}
                    className={
                      "calendar-cell " +
                      (day.getMonth() !== anchor.getMonth() ? "outside " : "") +
                      (key === selected ? "chosen" : "")
                    }
                  >
                    <button
                      className="calendar-day"
                      aria-pressed={key === selected}
                      aria-current={
                        key === dayKey(new Date()) ? "date" : undefined
                      }
                      aria-label={
                        day.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }) +
                        ", " +
                        rows.length +
                        " sessions"
                      }
                      onClick={() => setSelected(key)}
                    >
                      {day.getDate()}
                      {key === dayKey(new Date()) && <span>Today</span>}
                    </button>
                    {rows.slice(0, view === "week" ? 8 : 3).map((e) => (
                      <button
                        key={e.id}
                        className={
                          "calendar-session " +
                          (e.status === "Cancelled" ? "cancelled" : "")
                        }
                        onClick={() => onOpen(e)}
                      >
                        <small>
                          {dayKey(e.start) !== key
                            ? "Continues"
                            : new Date(e.start).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                        </small>
                        {e.title}
                        {e.status === "Cancelled" ? " · Cancelled" : ""}
                      </button>
                    ))}
                    {rows.length > (view === "week" ? 8 : 3) && (
                      <button
                        className="calendar-more"
                        onClick={() => setSelected(key)}
                      >
                        +{rows.length - (view === "week" ? 8 : 3)} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card-head">
            <h3>
              {selectedDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h3>
            <span className="badge">{selectedEvents.length} sessions</span>
          </div>
          {selectedEvents.map(renderEvent)}
          {!selectedEvents.length && (
            <p className="feature-empty">No matching sessions on this day.</p>
          )}
        </>
      )}
    </section>
  );
}
