import React, { useState, useEffect } from "react";
import "./operations.css";
const staff = (d) => ["admin", "staff"].includes(d.user.role);
async function request(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request failed.");
  return d;
}
export function Refunds({ data, act, refresh }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(path, body) {
    setBusy(true);
    setError("");
    try {
      await request(path, body);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Payment recovery & refunds</h3>
      <p>
        Retry unpaid invoices from the checkout controls above. Refunds require
        staff request and administrator approval, then explicit Stripe test
        submission. A refund does not cancel enrollment, restock an order, or
        end a membership.
      </p>
      {data.invoices
        .filter((i) => i.recoveryStatus && i.recoveryStatus !== "Resolved")
        .map((i) => (
          <p key={i.id}>
            {i.description}: {i.recoveryStatus} · {i.failureCount || 0} recorded
            failures/expiries
          </p>
        ))}
      {staff(data) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await act("refund-request", {
                invoiceId: f.get("invoiceId"),
                amountCents: Math.round(Number(f.get("amount")) * 100),
                reason: f.get("reason"),
              })
            )
              form.reset();
          }}
        >
          <label>
            Paid invoice
            <select name="invoiceId" required>
              <option value="">Choose paid one-time invoice</option>
              {data.invoices
                .filter(
                  (i) =>
                    i.status.startsWith("Paid") &&
                    i.paymentIntent &&
                    i.sourceType !== "membership",
                )
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.description} · {i.id.slice(0, 8)} ·{" "}
                    {(i.amountCents / 100).toFixed(2)} {i.currency}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Refund amount
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              required
            />
          </label>
          <label>
            Reason
            <textarea name="reason" required maxLength={500} />
          </label>
          <button className="btn">Request refund review</button>
        </form>
      )}
      {data.refunds?.map((r) => (
        <article className="mini-card" key={r.id}>
          <strong>
            {(r.amountCents / 100).toFixed(2)} {r.currency.toUpperCase()} ·{" "}
            {r.status}
          </strong>
          <p>{r.reason}</p>
          {data.user.role === "admin" && r.status === "requested" && (
            <>
              <button
                className="btn secondary"
                onClick={() =>
                  act("refund-review", { id: r.id, status: "approved" })
                }
              >
                Approve refund
              </button>
              <button
                className="btn secondary"
                onClick={() =>
                  act("refund-review", { id: r.id, status: "rejected" })
                }
              >
                Reject refund
              </button>
            </>
          )}
          {data.user.role === "admin" && r.status === "approved" && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => run("refunds/" + r.id + "/submit", {})}
            >
              Submit approved test refund
            </button>
          )}
          {data.user.role === "admin" &&
            ["sending", "unknown", "pending", "requires_action"].includes(
              r.status,
            ) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run("refunds/" + r.id + "/reconcile", {
                    providerId: new FormData(e.currentTarget).get("providerId"),
                  });
                }}
              >
                <label>
                  Stripe refund ID
                  <input
                    name="providerId"
                    defaultValue={r.providerId || ""}
                    placeholder="re_…"
                    required
                  />
                </label>
                <button className="btn secondary" disabled={busy}>
                  Reconcile from Stripe
                </button>
              </form>
            )}
        </article>
      ))}
      {!data.refunds?.length && <p>No refund requests.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function TrainingProgress({ data, act }) {
  const [selected, setSelected] = useState(
    data.trainingProgress?.[0]?.playerId || "",
  );
  const row = data.trainingProgress?.find((p) => p.playerId === selected);
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Player progress</h3>
      <label>
        Progress for player
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {data.trainingProgress?.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {row && (
        <>
          <p>
            {row.completed} of {row.assigned} exercises completed ·{" "}
            {row.overdue} overdue. Cancelled exercises excluded.
          </p>
          <progress
            aria-label="Training completion"
            max={row.assigned || 1}
            value={row.completed}
          />
          <p>
            Most recent 12 weeks with recorded results, grouped in UTC. Shooting
            percentage uses total makes divided by attempts.
          </p>
          {row.weeks.map((w) => (
            <div key={w.week}>
              <label>
                {w.week}: {w.completed} completed ·{" "}
                {w.attempts
                  ? Math.round((w.made / w.attempts) * 100) + "% shooting"
                  : "No shot attempts"}
                <meter
                  min="0"
                  max="100"
                  value={w.attempts ? (w.made / w.attempts) * 100 : 0}
                  aria-label={"Shooting percentage week " + w.week}
                />
              </label>
            </div>
          ))}
          {!row.weeks.length && <p>No results recorded yet.</p>}
          {(staff(data) || data.user.role === "coach") && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = e.currentTarget;
                if (
                  await act("training-feedback", {
                    playerId: row.playerId,
                    text: new FormData(f).get("text"),
                  })
                )
                  f.reset();
              }}
            >
              <label>
                Feedback shared with this player and family
                <textarea name="text" maxLength={2000} required />
              </label>
              <button className="btn">Save coaching feedback</button>
            </form>
          )}
          {data.coachingFeedback
            .filter((f) => f.playerId === row.playerId)
            .map((f) => (
              <blockquote key={f.id}>
                <p>{f.text}</p>
                <small>
                  {f.author} · {new Date(f.createdAt).toLocaleDateString()}
                </small>
              </blockquote>
            ))}
        </>
      )}
    </section>
  );
}
export function VideoManagement({ data, act }) {
  if (!staff(data) && data.user.role !== "coach") return null;
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Manage video library</h3>
      <p>
        Deleted clips disappear immediately and can be restored until an
        administrator purges their files after a seven-day grace period.
      </p>
      {data.videos.map((v) => (
        <form
          className="mini-card"
          key={v.id}
          onSubmit={(e) => {
            e.preventDefault();
            act("video-edit", {
              id: v.id,
              name: new FormData(e.currentTarget).get("name"),
            });
          }}
        >
          <label>
            Clip title
            <input
              name="name"
              defaultValue={v.name}
              key={v.name}
              required
              maxLength={100}
            />
          </label>
          <button className="btn secondary">Save title</button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => act("video-delete", { id: v.id })}
          >
            Move to deleted clips
          </button>
        </form>
      ))}
      {data.deletedVideos.map((v) => (
        <p key={v.id}>
          {v.name} · Deleted{" "}
          <button
            className="btn secondary"
            onClick={() => act("video-restore", { id: v.id })}
          >
            Restore clip
          </button>
        </p>
      ))}
    </section>
  );
}
export function ReportMessage({ message, act }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await act("message-report", {
            messageId: message.id,
            reason: new FormData(e.currentTarget).get("reason"),
          })
        )
          setOpen(false);
      }}
    >
      <label>
        Reason for reporting
        <textarea name="reason" maxLength={500} required />
      </label>
      <p>
        The message text and your reason will be shared with staff for review.
      </p>
      <button className="btn secondary">Submit report</button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel report
      </button>
    </form>
  ) : (
    <button className="text-btn" onClick={() => setOpen(true)}>
      Report message
    </button>
  );
}
export function GroupManagement({ current, data, act }) {
  if (current.kind !== "group") return null;
  return (
    <details>
      <summary>Group members & management</summary>
      <p>
        Only the owner can rename or remove members. New members require a new
        group. If the owner leaves, ownership passes to the first remaining
        member.
      </p>
      {current.members.map((m) => (
        <p key={m.id}>
          {m.name}
          {m.id === current.ownerId ? " · Owner" : ""}
          {current.ownerId === data.user.id && m.id !== data.user.id && (
            <button
              className="text-btn"
              onClick={() =>
                act("group-remove", { channel: current.id, userId: m.id })
              }
            >
              Remove member
            </button>
          )}
        </p>
      ))}
      {current.ownerId === data.user.id && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            act("group-rename", {
              channel: current.id,
              name: new FormData(e.currentTarget).get("name"),
            });
          }}
        >
          <label>
            Group name
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={current.name}
            />
          </label>
          <button className="btn secondary">Rename group</button>
        </form>
      )}
    </details>
  );
}
export function Moderation({ data, act }) {
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Message reports</h3>
      <p>
        Only reported text is disclosed here. Staff do not gain access to the
        rest of a private conversation.
      </p>
      {data.messageReports.map((r) => (
        <article className="mini-card" key={r.id}>
          <strong>
            {r.status} · {r.author}
          </strong>
          <blockquote>{r.evidence}</blockquote>
          <p>Reason: {r.reason}</p>
          {r.status === "open" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                act("message-review", {
                  id: r.id,
                  status: f.get("decision"),
                  note: f.get("note"),
                });
              }}
            >
              <label>
                Decision
                <select name="decision">
                  <option value="dismissed">Dismiss report</option>
                  <option value="removed">Remove reported message</option>
                </select>
              </label>
              <label>
                Review note
                <textarea name="note" required maxLength={500} />
              </label>
              <button className="btn secondary">Save review</button>
            </form>
          ) : (
            <p>{r.note}</p>
          )}
        </article>
      ))}
      {!data.messageReports.length && <p>No reported messages.</p>}
    </section>
  );
}
export function LaunchOperations({ data, refresh }) {
  const [status, setStatus] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  async function load() {
    try {
      setStatus(await request("operations/status"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function run(path, body) {
    setBusy(true);
    setError("");
    try {
      const result = await request(path, body);
      await refresh();
      await load();
      setConfirm(false);
      if (result.failed)
        setError(
          result.failed +
            " file purges failed. Review cloud configuration and retry.",
        );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Launch & storage operations</h3>
      <button className="btn secondary" onClick={load}>
        Refresh operational status
      </button>
      {status && (
        <>
          <p>
            Uptime: {status.uptimeSeconds}s · {status.storage} storage ·{" "}
            {status.uncertainRefunds} uncertain refunds · Cloud{" "}
            {status.cloudConfigured
              ? "configured (verification required)"
              : "not configured"}
          </p>
          <p>
            {status.cleanup.length} video files eligible for purge ·{" "}
            {status.pendingPurge} pending purges
          </p>
          <ul>
            {status.cleanup.map((f) => (
              <li key={f.id}>
                {f.name} · {Math.ceil(f.size / 1024)} KB
              </li>
            ))}
          </ul>
          <label>
            <input
              type="checkbox"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />{" "}
            Permanently purge eligible deleted/orphan video files and their
            configured cloud copies
          </label>
          <button
            className="btn secondary"
            disabled={busy || !confirm}
            onClick={() => run("media/cleanup", { confirm: true })}
          >
            Purge eligible files
          </button>
        </>
      )}
      <h4>Private cloud copies</h4>
      <p>
        Copies stay private in the configured S3 bucket. Recorded cloud copies
        play through the protected server endpoint. Keep local backups until
        playback and restore have been verified with your cloud account.
      </p>
      {data.videos
        .filter((v) => v.fileId)
        .map((v) => (
          <p key={v.id}>
            {v.name}{" "}
            <button
              className="btn secondary"
              disabled={busy || !status?.cloudConfigured}
              onClick={() => run("media/" + v.fileId + "/cloud", {})}
            >
              Copy to private cloud
            </button>
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
