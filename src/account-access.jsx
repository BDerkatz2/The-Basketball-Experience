import React, { useState } from "react";
async function request(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (sessionStorage.getItem("tbe-token") || ""),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}
export function RedeemAccountLink() {
  const [token] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("account-link"),
  );
  const [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <div className="login-form">
        <h2>Set your account password</h2>
        <p>
          Your invitation or recovery link can be used once. Choose a password
          of 12–128 characters.
        </p>
        {done ? (
          <>
            <p role="status">Your password is set. Sign in to continue.</p>
            <a className="btn" href="/">
              Go to sign in
            </a>
          </>
        ) : (
          <form
            className="feature-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setError("");
              if (f.get("password") !== f.get("confirm")) {
                setError("Passwords do not match.");
                return;
              }
              setBusy(true);
              try {
                await request("auth/redeem-link", {
                  token,
                  password: f.get("password"),
                });
                sessionStorage.removeItem("tbe-token");
                history.replaceState(null, "", location.pathname);
                setDone(true);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              New password
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                name="confirm"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <button className="btn" disabled={busy}>
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
export function AccountAccess({ data }) {
  const [kind, setKind] = useState("invite"),
    [role, setRole] = useState("parent"),
    [result, setResult] = useState(null),
    [links, setLinks] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setLinks((await request("account-links")).links);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  if (data.mode !== "accounts" || data.user.role !== "admin") return null;
  return (
    <section className="card space-top">
      <div className="card-head">
        <h3>Account invitations & recovery</h3>
      </div>
      <div style={{ padding: 24 }}>
        <p>
          Email delivery is not connected. Share links through your established
          private process. Verify the account holder’s identity before issuing a
          recovery link. Links grant the access selected below.
        </p>
        <form
          className="feature-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            setResult(null);
            try {
              const r = await request("account-links", {
                ...Object.fromEntries(f),
                kind,
                role,
                teamIds: f.getAll("teamIds"),
              });
              setResult(r);
              await load();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Link purpose
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setResult(null);
              }}
            >
              <option value="invite">Invite new account · 48 hours</option>
              <option value="reset">Reset existing account · 30 minutes</option>
            </select>
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          {kind === "invite" && (
            <>
              <label>
                Full name
                <input name="name" maxLength={100} required />
              </label>
              <label>
                Account role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {["parent", "player", "coach", "staff"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {["parent", "player"].includes(role) && (
                <label>
                  Existing family
                  <select name="familyId" required>
                    <option value="">Choose family</option>
                    {data.families.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {role === "player" && (
                <label>
                  Player
                  <select name="playerId" required>
                    <option value="">Choose player</option>
                    {data.players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {role === "coach" && (
                <fieldset>
                  <legend>Assigned teams</legend>
                  {data.teams.map((t) => (
                    <label className="checkbox" key={t.id}>
                      <input type="checkbox" name="teamIds" value={t.id} />
                      {t.name}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Creating…" : "Create single-use link"}
          </button>
        </form>
        {result && (
          <div role="status">
            <p>
              Copy this private link now. It will not be shown again. Expires{" "}
              {new Date(result.expires).toLocaleString()}.
            </p>
            <input
              aria-label="Single-use account link"
              readOnly
              style={{ width: "100%" }}
              value={location.origin + "/#account-link=" + result.token}
            />
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="btn secondary space-top" onClick={load}>
          Refresh issued links
        </button>
        {links.map((l) => (
          <div className="feature-row" key={l.id}>
            <div>
              <b>{l.email}</b>
              <p>
                {l.kind} · {l.role || "existing account"} ·{" "}
                {l.usedAt
                  ? "Used"
                  : l.revoked
                    ? "Revoked"
                    : l.expires < Date.now()
                      ? "Expired"
                      : "Pending"}
              </p>
            </div>
            {!l.usedAt && !l.revoked && l.expires > Date.now() && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request("account-links/" + l.id + "/revoke", {});
                    if (result?.id === l.id) setResult(null);
                    await load();
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke link
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
