import { headingFont } from "./theme";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  Switch,
  Linking,
  StyleSheet,
  AppState,
} from "react-native";
import {
  checkoutDestination,
  canManageMemberships,
  endedMembership,
  canChangeRenewal,
  preferenceLabels,
  preferencePayload,
} from "./membership-utils.mjs";
function Button({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function MobilePreferences({ data, act, busy }) {
  const [values, setValues] = useState(() =>
      preferencePayload(data.notificationPreferences || {}),
    ),
    [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false);
  const key = JSON.stringify(
    preferencePayload(data.notificationPreferences || {}),
  );
  useEffect(() => {
    setValues(JSON.parse(key));
  }, [key]);
  return (
    <View style={s.card}>
      <Text style={s.title}>Notification preferences</Text>
      <Text style={s.note}>
        Email and push need connected providers and enabled external delivery.
        Register your phone above and enable push here to receive phone alerts.
        In-app reminders appear in Updates.
      </Text>
      {Object.entries(preferenceLabels).map(([name, label]) => (
        <View style={s.row} key={name}>
          <Text style={s.label}>{label}</Text>
          <Switch
            accessibilityLabel={label}
            value={values[name]}
            disabled={busy || saving}
            onValueChange={(value) => {
              setValues((v) => ({ ...v, [name]: value }));
              setSaved(false);
            }}
          />
        </View>
      ))}
      <Button
        title={saving ? "Saving…" : "Save preferences"}
        disabled={busy || saving}
        onPress={async () => {
          setSaving(true);
          setSaved(false);
          try {
            if (
              await act("notification-preferences", preferencePayload(values))
            )
              setSaved(true);
          } finally {
            setSaving(false);
          }
        }}
      />
      {saved && <Text accessibilityRole="alert">Preferences saved.</Text>}
    </View>
  );
}
export function MobileMemberships({ data, api, refresh, busy }) {
  const [family, setFamily] = useState(
      data.user.familyId || data.families[0]?.id || "",
    ),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState(null),
    [provider, setProvider] = useState("loading");
  const staff = ["staff", "admin"].includes(data.user.role),
    disabled = working || busy;
  useEffect(() => {
    let active = true;
    api("config")
      .then((c) => {
        if (active) setProvider(c.payments);
      })
      .catch(() => {
        if (active) setProvider("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  if (!canManageMemberships(data.user.role))
    return (
      <Text>Membership management is available to parents and staff.</Text>
    );
  const current = (data.memberships || []).filter((m) => m.familyId === family),
    open = current.find((m) => !endedMembership(m));
  async function run(fn) {
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  function checkout(planId) {
    return run(async () => {
      const result = await api("memberships/checkout", {
        familyId: family,
        planId,
      });
      const url = checkoutDestination(result.url);
      await Linking.openURL(url);
      setNotice(
        "Test checkout opened in your browser. Return here and refresh status after checkout. Payment is confirmed by Stripe, not by the return page.",
      );
      await refresh();
    });
  }
  function manage(m, operation) {
    return run(async () => {
      await api("memberships/" + m.id + "/manage", { operation });
      await refresh();
      setConfirm(null);
      setNotice(
        operation === "cancel"
          ? "Renewal is cancelled at the billing-period end."
          : operation === "resume"
            ? "Automatic renewal resumed."
            : "Membership status refreshed.",
      );
    });
  }
  return (
    <View>
      <Text style={s.title}>Family memberships</Text>
      <Text style={s.note}>
        Stripe test mode only. Memberships renew automatically. Cancellation
        takes effect at the billing-period end.
      </Text>
      {provider !== "stripe-test" && (
        <Text style={s.note}>
          {provider === "loading"
            ? "Checking payment connection…"
            : "Stripe test checkout is not connected. Plans are available to review; subscribing requires provider configuration."}
        </Text>
      )}
      {staff && (
        <View style={s.card}>
          <Text>Select family</Text>
          {data.families.map((f) => (
            <Button
              key={f.id}
              title={(family === f.id ? "✓ " : "") + f.name}
              disabled={disabled}
              onPress={() => {
                setFamily(f.id);
                setConfirm(null);
                setError("");
                setNotice("");
              }}
            />
          ))}
        </View>
      )}
      {!family && <Text>No family is assigned to this account.</Text>}
      {error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {notice && (
        <Text accessibilityRole="alert" style={s.note}>
          {notice}
        </Text>
      )}
      {current.map((m) => (
        <View key={m.id} style={s.card}>
          <Text style={s.title}>{m.planName}</Text>
          <Text>
            CAD {(m.amountCents / 100).toFixed(2)} / {m.interval}
          </Text>
          <Text>Status: {m.status}</Text>
          <Text>
            {m.periodEnd
              ? (endedMembership(m)
                  ? "Period ended: "
                  : m.cancelAtPeriodEnd
                    ? "Ends: "
                    : "Next renewal: ") +
                new Date(m.periodEnd * 1000).toLocaleDateString()
              : "Billing period pending"}
          </Text>
          {["past_due", "unpaid"].includes(m.status) && (
            <Text style={s.error}>
              Payment needs attention. Contact staff to update payment details
              through Stripe test mode.
            </Text>
          )}
          {!endedMembership(m) && (
            <>
              <Button
                title="Refresh membership status"
                disabled={disabled || provider !== "stripe-test"}
                onPress={() => manage(m, "refresh")}
              />
              {!m.subscriptionId && (
                <Button
                  title="Resume test checkout"
                  disabled={disabled || provider !== "stripe-test"}
                  onPress={() => checkout(m.planId)}
                />
              )}
            </>
          )}
          {canChangeRenewal(m) && (
            <Button
              title={
                m.cancelAtPeriodEnd
                  ? "Resume automatic renewal"
                  : "Cancel renewal at period end"
              }
              disabled={disabled || provider !== "stripe-test"}
              onPress={() =>
                setConfirm({
                  id: m.id,
                  operation: m.cancelAtPeriodEnd ? "resume" : "cancel",
                })
              }
            />
          )}
          {confirm?.id === m.id && (
            <View>
              <Text>
                {confirm.operation === "cancel"
                  ? "Your membership stays active until the current billing period ends. No refund is issued."
                  : "Renewals will continue at the plan price on each billing date."}
              </Text>
              <Button
                title="Confirm renewal change"
                disabled={disabled}
                onPress={() => manage(m, confirm.operation)}
              />
              <Button
                title="Keep current setting"
                disabled={disabled}
                onPress={() => setConfirm(null)}
              />
            </View>
          )}
        </View>
      ))}
      {(data.membershipPlans || [])
        .filter((p) => p.active)
        .map((p) => (
          <View style={s.card} key={p.id}>
            <Text style={s.title}>{p.name}</Text>
            <Text>{p.description}</Text>
            <Text>
              CAD {(p.amountCents / 100).toFixed(2)} / {p.interval} · recurring
            </Text>
            <Button
              title="Subscribe in Stripe test mode"
              disabled={
                disabled || !family || provider !== "stripe-test" || !!open
              }
              onPress={() => checkout(p.id)}
            />
            {open && (
              <Text>
                Manage your existing membership above before starting another.
              </Text>
            )}
          </View>
        ))}
      {!data.membershipPlans?.some((p) => p.active) && (
        <Text>No membership plans are currently available.</Text>
      )}
      <Text style={s.title}>Membership invoices</Text>
      {(data.invoices || [])
        .filter((i) => i.familyId === family && i.sourceType === "membership")
        .map((i) => (
          <View style={s.card} key={i.id}>
            <Text>{i.description}</Text>
            <Text>
              {i.currency.toUpperCase()} {(i.amountCents / 100).toFixed(2)} ·{" "}
              {i.status}
            </Text>
            <Text>{new Date(i.createdAt).toLocaleDateString()}</Text>
          </View>
        ))}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    gap: 10,
    marginVertical: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: headingFont,
    color: "#171d24",
    marginVertical: 8,
  },
  note: { color: "#35495b", lineHeight: 22, marginVertical: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  label: { flex: 1, color: "#171d24" },
  button: {
    backgroundColor: "#171d24",
    padding: 14,
    borderRadius: 8,
    marginVertical: 5,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#a33228", marginVertical: 10 },
});
