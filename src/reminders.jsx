import React, { useState } from "react";
export function ReminderSettings({ data, act }) {
  const [busy, setBusy] = useState(false);
  const labels = {
    inApp: "Show in-app notifications",
    email: "Queue email notifications",
    push: "Queue phone push notifications",
    sessions: "Practices and games · 24-hour reminder",
    workouts: "Workouts · due within 24 hours",
    changes: "Schedule changes",
    payments: "Membership payment issues",
  };
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Notification preferences</h3>
      </div>
      <form
        className="feature-form"
        style={{ padding: 24 }}
        key={JSON.stringify(data.notificationPreferences)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await act(
              "notification-preferences",
              Object.fromEntries(Object.keys(labels).map((k) => [k, f.has(k)])),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Email and phone push require a connected provider and enabled external
          delivery. These preferences opt you into queued reminders. In-app
          reminders work locally.
        </p>
        {Object.entries(labels).map(([key, label]) => (
          <label className="checkbox" key={key}>
            <input
              name={key}
              type="checkbox"
              defaultChecked={data.notificationPreferences[key]}
            />
            {label}
          </label>
        ))}
        <button className="btn" disabled={busy}>
          Save preferences
        </button>
      </form>
    </section>
  );
}
export function DeliveryQueue({ data, act }) {
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Reminder delivery queue</h3>
        <button
          className="btn secondary"
          onClick={() => act("reminders-run", {})}
        >
          Check reminders now
        </button>
      </div>
      <p className="feature-empty">
        Reminders are checked every minute while the server is running.
        Administrators can send queued requests from Service connections when
        providers are enabled. Failure simulations do not contact anyone.
        Unknown or interrupted sends require provider-dashboard review before
        any retry.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Recipient ID</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Retry</th>
            </tr>
          </thead>
          <tbody>
            {data.deliveryQueue
              .slice(-100)
              .reverse()
              .map((j) => (
                <tr key={j.id}>
                  <td>{new Date(j.createdAt).toLocaleString()}</td>
                  <td>{j.userId}</td>
                  <td>{j.channel}</td>
                  <td>
                    {j.status}
                    {j.lastError && <small> · {j.lastError}</small>}
                  </td>
                  <td>{j.attempts}</td>
                  <td>
                    {j.nextAttemptAt
                      ? new Date(j.nextAttemptAt).toLocaleString()
                      : ""}
                    {["waiting-provider", "retry"].includes(j.status) && (
                      <button
                        className="btn secondary"
                        onClick={() =>
                          act("delivery-test-failure", { id: j.id })
                        }
                      >
                        Simulate failure
                      </button>
                    )}
                    {j.status === "failed" && (
                      <button
                        className="btn secondary"
                        onClick={() => act("delivery-retry", { id: j.id })}
                      >
                        Retry delivery
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!data.deliveryQueue.length && (
        <p className="feature-empty">
          No external delivery requests. Users must enable a channel in
          notification preferences.
        </p>
      )}
    </section>
  );
}
