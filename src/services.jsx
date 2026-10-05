import React, { useEffect, useState } from "react";
export function LiveServices({ data }) {
  const [status, setStatus] = useState(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function call(path, post = false) {
    const r = await fetch("/api/services" + path, {
      method: post ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
        "Content-Type": "application/json",
      },
      ...(post ? { body: "{}" } : {}),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Service check failed.");
    return d;
  }
  useEffect(() => {
    call("")
      .then(setStatus)
      .catch((e) => setMessage(e.message));
  }, []);
  async function run(path) {
    setBusy(true);
    try {
      setMessage((await call(path, true)).message);
      setStatus(await call(""));
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Service connections</h3>
      </div>
      <div style={{ padding: 24 }}>
        <p>
          Configuration is separate from live verification. Provider acceptance
          does not prove delivery.
        </p>
        {status && (
          <ul>
            {[
              ["Stripe test API", "stripe"],
              ["Stripe webhook secret", "stripeWebhook"],
              ["Email · Resend", "email"],
              ["Phone push · Expo", "push"],
              ["AI scheduling · OpenAI", "ai"],
              ["Video import · Google Drive", "drive"],
            ].map(([label, key]) => (
              <li key={key}>
                {label}:{" "}
                <b>
                  {status[key]
                    ? "configured · verification required"
                    : "not configured"}
                </b>
              </li>
            ))}
          </ul>
        )}
        <p>
          External delivery:{" "}
          {status?.externalDeliveryEnabled
            ? "enabled · send queued requests below"
            : "disabled"}
          . Sending processes up to 10 opted-in requests.
        </p>
        {data.user.role === "admin" && (
          <div className="feature-actions">
            <button
              className="btn secondary"
              disabled={busy || !status?.stripe}
              onClick={() => run("/stripe-check")}
            >
              Validate Stripe test credentials
            </button>
            <button
              className="btn secondary"
              disabled={busy || !status?.externalDeliveryEnabled}
              onClick={() => run("/send-pending")}
            >
              Send pending notifications
            </button>
            <button
              className="btn secondary"
              disabled={busy || !status?.push}
              onClick={() => run("/push-receipts")}
            >
              Check phone push receipts
            </button>
          </div>
        )}
        <p role="status">{message}</p>
      </div>
    </section>
  );
}
