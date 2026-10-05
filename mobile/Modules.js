import { headingFont } from "./theme";
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  StyleSheet,
} from "react-native";
function Button({ label, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={s.buttonText}>{label}</Text>
    </Pressable>
  );
}
function Choose({ label, rows, value, onChange }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.options}>
        {rows.map((r) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: value === r.id }}
            key={r.id}
            onPress={() => onChange(r.id)}
            style={[s.option, value === r.id && s.selected]}
          >
            <Text
              style={{
                color: value === r.id ? "#fff" : "#171d24",
                fontSize: 11,
              }}
            >
              {r.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Programs({ data, act, busy }) {
  const [selected, setSelected] = useState(null),
    [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [signature, setSignature] = useState(""),
    [accepted, setAccepted] = useState(false),
    [answers, setAnswers] = useState({});
  const parent = ["parent", "admin", "staff"].includes(data.user.role);
  return (
    <>
      {data.programs.map((p) => {
        const form = data.forms?.find((f) => f.id === p.formId);
        return (
          <View key={p.id} style={s.card}>
            <Text style={s.tag}>
              {p.type} · Ages {p.ages}
            </Text>
            <Text style={s.title}>{p.name}</Text>
            <Text style={s.body}>{p.description}</Text>
            {(p.registration || p.registrationClosed) && (
              <Text style={s.body}>
                {p.season ? p.season + " · " : ""}
                {p.registrationClosed || p.registration?.closed
                  ? "Registration closed. "
                  : ""}
                {p.registration?.minAge != null
                  ? `Minimum age ${p.registration.minAge}. `
                  : ""}
                {p.registration?.maxAge != null
                  ? `Maximum age ${p.registration.maxAge}. `
                  : ""}
                {p.registration?.membersOnly
                  ? "Active family membership required. "
                  : ""}
                {p.registration?.opensAt
                  ? `Opens ${new Date(p.registration.opensAt).toLocaleString()}. `
                  : ""}
                {p.registration?.closesAt
                  ? `Closes ${new Date(p.registration.closesAt).toLocaleString()}. `
                  : ""}
              </Text>
            )}
            <Text style={s.label}>
              ${p.price} CAD · {p.sessions} sessions
            </Text>
            {parent && selected !== p.id && (
              <Button
                label="Register a player"
                onPress={() => {
                  setSelected(p.id);
                  setAccepted(false);
                  setSignature("");
                  setAnswers({});
                }}
              />
            )}
            {selected === p.id && (
              <>
                <Choose
                  label="Player"
                  rows={data.players}
                  value={playerId}
                  onChange={setPlayer}
                />
                {form?.fields.map((f) => (
                  <View key={f.id}>
                    <Text style={s.label}>
                      {f.label}
                      {f.required ? " *" : ""}
                    </Text>
                    {f.type === "checkbox" ? (
                      <Switch
                        accessibilityLabel={f.label}
                        value={answers[f.id] === true}
                        onValueChange={(v) =>
                          setAnswers({ ...answers, [f.id]: v })
                        }
                      />
                    ) : f.type === "select" ? (
                      <Choose
                        label={f.label}
                        rows={f.options.map((o) => ({ id: o, name: o }))}
                        value={answers[f.id] || ""}
                        onChange={(v) => setAnswers({ ...answers, [f.id]: v })}
                      />
                    ) : (
                      <TextInput
                        multiline={f.type === "textarea"}
                        keyboardType={
                          f.type === "email"
                            ? "email-address"
                            : f.type === "number"
                              ? "decimal-pad"
                              : "default"
                        }
                        placeholder={
                          f.type === "date" ? "YYYY-MM-DD" : undefined
                        }
                        accessibilityLabel={f.label}
                        style={s.input}
                        maxLength={2000}
                        value={answers[f.id] || ""}
                        onChangeText={(v) =>
                          setAnswers({ ...answers, [f.id]: v })
                        }
                      />
                    )}
                  </View>
                ))}
                <Text style={s.body}>
                  {form?.waiverText ||
                    "Demonstration acknowledgement only. No payment is taken by this registration."}
                </Text>
                <View style={s.options}>
                  <Switch
                    accessibilityLabel="Accept registration terms"
                    value={accepted}
                    onValueChange={setAccepted}
                  />
                  <Text style={s.label}>I accept the terms above.</Text>
                </View>
                <TextInput
                  accessibilityLabel="Guardian signature"
                  style={s.input}
                  placeholder="Parent / guardian full name"
                  value={signature}
                  onChangeText={setSignature}
                  maxLength={100}
                />
                <Button
                  label="Complete registration"
                  disabled={busy || !accepted || !signature.trim() || !playerId}
                  onPress={async () => {
                    if (
                      await act("enroll", {
                        programId: p.id,
                        playerId,
                        accepted,
                        signature,
                        formId: form?.id,
                        answers,
                      })
                    )
                      setSelected(null);
                  }}
                />
                <Button label="Close" onPress={() => setSelected(null)} />
              </>
            )}
          </View>
        );
      })}
    </>
  );
}
export function Store({ data, act, busy }) {
  const [product, setProduct] = useState(null),
    [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [size, setSize] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [useCredits, setCredits] = useState(true);
  const parent = ["parent", "admin", "staff"].includes(data.user.role);
  const used = data.credits
    .filter(
      (c) => c.playerId === playerId && c.year === new Date().getFullYear(),
    )
    .reduce((n, c) => n + c.quantity, 0);
  return (
    <>
      <Text style={s.body}>
        Every order is linked to a player and their coach. Two tee credits per
        player per calendar year.
      </Text>
      {data.products
        .filter((p) => !p.archivedAt)
        .map((p) => (
          <View style={s.card} key={p.id}>
            <Text style={s.tag}>
              {p.category} · {p.color}
            </Text>
            <Text style={s.title}>{p.name}</Text>
            <Text style={s.label}>${p.price} CAD</Text>
            {parent && product !== p.id && (
              <Button
                label="Choose options"
                onPress={() => {
                  setProduct(p.id);
                  setSize(p.sizes[0]);
                  setQuantity("1");
                }}
              />
            )}
            {product === p.id && (
              <>
                <Choose
                  label="Player for this order"
                  rows={data.players}
                  value={playerId}
                  onChange={setPlayer}
                />
                <Choose
                  label="Size"
                  rows={p.sizes.map((size) => ({
                    id: size,
                    name: `${size} (${p.stock[size]} left)`,
                  }))}
                  value={size}
                  onChange={setSize}
                />
                <Text style={s.label}>Quantity</Text>
                <TextInput
                  accessibilityLabel="Quantity"
                  style={s.input}
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />
                {p.creditEligible && (
                  <View style={s.options}>
                    <Switch
                      accessibilityLabel="Use tee credits"
                      value={useCredits}
                      onValueChange={setCredits}
                    />
                    <Text style={s.label}>
                      Use tee credits ({Math.max(0, 2 - used)} left)
                    </Text>
                  </View>
                )}
                <Button
                  label="Place order"
                  disabled={busy || !playerId}
                  onPress={async () => {
                    if (
                      await act("order", {
                        productId: p.id,
                        playerId,
                        size,
                        quantity: Number(quantity),
                        useCredits,
                      })
                    )
                      setProduct(null);
                  }}
                />
                <Text style={s.body}>
                  This records the order. No card is charged here.
                </Text>
              </>
            )}
          </View>
        ))}
      <Text style={s.title}>Your orders</Text>
      {data.orders.map((o) => (
        <View key={o.id} style={s.card}>
          <Text style={s.label}>
            {data.players.find((p) => p.id === o.playerId)?.name} ·{" "}
            {data.products.find((p) => p.id === o.productId)?.name}
          </Text>
          <Text style={s.body}>
            {o.size} × {o.quantity} · ${o.total} CAD · {o.free} credits
          </Text>
          <Text style={s.tag}>
            {o.status} · Coach {o.coach}
          </Text>
        </View>
      ))}
    </>
  );
}
export function Updates({ data, act }) {
  return (
    <>
      {data.notifications?.map((n) => (
        <View key={n.id} style={s.card}>
          <Text style={s.title}>{n.title}</Text>
          <Text style={s.body}>{n.text}</Text>
          <Text style={s.tag}>{new Date(n.createdAt).toLocaleString()}</Text>
          {!n.read && (
            <Button
              label="Mark read"
              onPress={() => act("notification-read", { id: n.id })}
            />
          )}
        </View>
      ))}
      {!data.notifications?.length && (
        <Text style={s.body}>No schedule updates yet.</Text>
      )}
    </>
  );
}
export function Brackets({ data }) {
  const team = (id) =>
    data.teams.find((t) => t.id === id)?.name || "Awaiting winner";
  return (
    <>
      {data.brackets?.map((b) => (
        <View key={b.id} style={s.card}>
          <Text style={s.title}>{b.name}</Text>
          {b.championId && (
            <Text style={s.tag}>Champion: {team(b.championId)}</Text>
          )}
          {b.rounds.map((r, i) => (
            <View key={i}>
              <Text style={s.label}>
                {i === b.rounds.length - 1 ? "Final" : `Round ${i + 1}`}
              </Text>
              {r.map((id) => {
                const g = data.games.find((g) => g.id === id);
                return (
                  <View key={id} style={s.match}>
                    <Text style={s.body}>
                      {team(g.homeId)} {g.homeScore} : {g.awayScore}{" "}
                      {team(g.awayId)}
                    </Text>
                    <Text style={s.tag}>{g.status}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      ))}
    </>
  );
}
export function MobileAccountLogin({ login, busy, error }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  return (
    <View style={s.card}>
      <Text style={s.title}>Sign in to your account</Text>
      <TextInput
        style={s.input}
        accessibilityLabel="Email"
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={s.input}
        accessibilityLabel="Password"
        placeholder="Password"
        secureTextEntry
        autoComplete="current-password"
        value={password}
        onChangeText={setPassword}
      />
      <Button
        label="Sign in"
        disabled={busy}
        onPress={() => login({ email, password })}
      />
      <Text style={s.body}>
        New parent? Create your account in the web portal first.
      </Text>
      {error && <Text style={s.body}>{error}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 21,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#edf5fa",
    borderRadius: 10,
    marginBottom: 15,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: headingFont,
    color: "#171d24",
    marginVertical: 10,
  },
  body: { fontSize: 12, color: "#607182", lineHeight: 21, marginVertical: 6 },
  tag: { fontSize: 10, color: "#607182", marginVertical: 8 },
  label: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: headingFont,
    color: "#35495b",
    marginVertical: 10,
  },
  button: {
    backgroundColor: "#171d24",
    padding: 13,
    borderRadius: 7,
    marginVertical: 7,
  },
  buttonText: {
    color: "#fff",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
    fontFamily: headingFont,
  },
  input: {
    borderWidth: 1,
    borderColor: "#edf5fa",
    borderRadius: 7,
    padding: 13,
    backgroundColor: "#fff",
    color: "#171d24",
    marginVertical: 6,
  },
  options: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "wrap",
    alignItems: "center",
  },
  option: {
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#edf5fa",
    marginVertical: 4,
  },
  selected: { backgroundColor: "#171d24" },
  match: { padding: 12, borderBottomWidth: 1, borderColor: "#edf5fa" },
});
