import React, { useState } from "react";
export function AccountLogin({
  onLogin,
  registrationEnabled = true,
  pilot = false,
}) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="login-form">
      <span className="badge">
        {pilot ? "PRIVATE COMPANY PILOT" : "YOUR COMMUNITY ACCOUNT"}
      </span>
      {pilot && (
        <p>
          Invitation-only evaluation. Use fictional players and test records.
          Payments and external delivery are disabled.
        </p>
      )}
      <h2>{register ? "Join your basketball community." : "Welcome back."}</h2>
      <form
        className="feature-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const body = Object.fromEntries(new FormData(e.currentTarget));
            const r = await fetch(
              "/api/auth/" + (register ? "register" : "login"),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              },
            );
            const d = await r.json();
            if (!r.ok) throw Error(d.error);
            await onLogin(d);
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {register && (
          <label>
            Full name
            <input name="name" autoComplete="name" maxLength={100} required />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            minLength={register ? 12 : 1}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            required
          />
        </label>
        {register && (
          <p className="muted">
            Use at least 12 characters. Your account starts as a parent; staff
            manage player and team assignments.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="btn" disabled={busy}>
          {busy
            ? "Please wait…"
            : register
              ? "Create parent account"
              : "Sign in"}
        </button>
      </form>
      <button
        className="text-btn space-top"
        type="button"
        onClick={() =>
          setError(
            "Email recovery is not connected yet. Contact your organization administrator to verify your identity and request a single-use password reset link.",
          )
        }
      >
        Forgot your password?
      </button>
      {registrationEnabled && (
        <button
          className="text-btn space-top"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      )}
    </div>
  );
}
