import React, { useState } from "react";
export function Memberships({ data, act, refresh }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [family, setFamily] = useState(
      data.user.familyId || data.families[0]?.id || "",
    );
  const staff = ["admin", "staff"].includes(data.user.role),
    admin = data.user.role === "admin";
  async function request(path, body) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
        },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      if (result.url) {
        const url = new URL(result.url);
        if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
          throw Error("Unexpected checkout destination.");
        location.assign(url.href);
      } else await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Family memberships</h3>
        <span className="badge">Stripe test mode</span>
      </div>
      <div style={{ padding: 24 }}>
        <p>
          Plans renew automatically at the listed price. Cancel renewal to end
          the subscription at the billing-period end. Test checkout requires a
          configured Stripe account and webhook.
        </p>
        {staff && (
          <label>
            Family
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              {data.families.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        {(data.memberships || [])
          .filter((m) => m.familyId === family)
          .map((m) => (
            <div className="feature-row" key={m.id}>
              <div>
                <b>{m.planName}</b>
                <p>
                  {m.status} · CAD {(m.amountCents / 100).toFixed(2)} /{" "}
                  {m.interval}
                </p>
                <p>
                  {m.periodEnd
                    ? (m.cancelAtPeriodEnd ? "Ends " : "Next renewal ") +
                      new Date(m.periodEnd * 1000).toLocaleDateString()
                    : "Billing period pending"}
                  {m.cancelAtPeriodEnd ? " · Renewal cancelled" : ""}
                </p>
                {["past_due", "unpaid"].includes(m.status) && (
                  <p>
                    Payment needs attention. Contact staff to resolve payment
                    details in Stripe test mode.
                  </p>
                )}
              </div>
              <div>
                {!["canceled", "incomplete_expired"].includes(m.status) && (
                  <>
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        request("memberships/" + m.id + "/manage", {
                          operation: "refresh",
                        })
                      }
                    >
                      Refresh status
                    </button>
                    {m.subscriptionId ? (
                      <button
                        className="btn secondary"
                        disabled={busy}
                        onClick={() =>
                          request("memberships/" + m.id + "/manage", {
                            operation: m.cancelAtPeriodEnd
                              ? "resume"
                              : "cancel",
                          })
                        }
                      >
                        {m.cancelAtPeriodEnd
                          ? "Resume renewal"
                          : "Cancel at period end"}
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() =>
                          request("memberships/checkout", {
                            familyId: family,
                            planId: m.planId,
                          })
                        }
                      >
                        Resume test checkout
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        {(data.membershipPlans || [])
          .filter((p) => p.active || admin)
          .map((p) => (
            <div className="feature-row" key={p.id}>
              <div>
                <b>
                  {p.name}
                  {!p.active ? " · Archived" : ""}
                </b>
                <p>{p.description}</p>
                <p>
                  CAD {(p.amountCents / 100).toFixed(2)} / {p.interval}
                </p>
              </div>
              <div>
                {p.active && (
                  <button
                    className="btn"
                    disabled={busy || !family}
                    onClick={() =>
                      request("memberships/checkout", {
                        familyId: family,
                        planId: p.id,
                      })
                    }
                  >
                    Subscribe in test mode
                  </button>
                )}
                {admin && (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      act("membership-plan", { id: p.id, active: !p.active })
                    }
                  >
                    {p.active ? "Archive plan" : "Restore plan"}
                  </button>
                )}
              </div>
            </div>
          ))}
        {!data.membershipPlans?.length && (
          <p>No membership plans have been created.</p>
        )}
        {admin && (
          <form
            className="feature-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = Object.fromEntries(new FormData(form));
              if (
                await act("membership-plan", {
                  ...f,
                  amountCents: Math.round(Number(f.price) * 100),
                })
              )
                form.reset();
            }}
          >
            <h4>Create membership plan</h4>
            <p>
              Existing subscriptions retain their price. Create a new plan for a
              price change.
            </p>
            <label>
              Plan name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Description
              <textarea name="description" required maxLength={1000} />
            </label>
            <label>
              Price in CAD
              <input
                name="price"
                type="number"
                min="1"
                max="10000"
                step="0.01"
                required
              />
            </label>
            <label>
              Billing frequency
              <select name="interval">
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </select>
            </label>
            <button className="btn">Create plan</button>
          </form>
        )}
      </div>
    </section>
  );
}
