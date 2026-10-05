import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { headingFont } from "./theme";
function Button({ title, onPress, disabled, selected }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        selected && { backgroundColor: "#dff2ff" },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Field({ label, value, onChange, numeric }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={String(value ?? "")}
        onChangeText={onChange}
        keyboardType={numeric ? "number-pad" : "default"}
        style={s.input}
        maxLength={label.includes("Address") ? 300 : 254}
      />
    </View>
  );
}
function PlayerForm({ player, act, busy }) {
  const [name, setName] = useState(player?.name || ""),
    [age, setAge] = useState(String(player?.age || ""));
  return (
    <View style={s.card}>
      <Text style={s.heading}>{player ? "Edit player" : "Add a player"}</Text>
      <Field label="Player name" value={name} onChange={setName} />
      <Field label="Age" numeric value={age} onChange={setAge} />
      <Text>Staff manage team placement and jersey numbers.</Text>
      <Button
        title={player ? "Save player" : "Add player"}
        disabled={busy || !name || !age}
        onPress={async () => {
          if (
            (await act("family-player", {
              ...(player ? { id: player.id } : {}),
              name,
              age: Number(age),
            })) &&
            !player
          ) {
            setName("");
            setAge("");
          }
        }}
      />
    </View>
  );
}
export function MobileFamily({ data, act, busy }) {
  const f = data.families.find((f) => f.id === data.user.familyId),
    [fields, setFields] = useState({
      name: f?.name || "",
      email: f?.email || "",
      phone: f?.phone || "",
      address: f?.address || "",
    });
  if (!f) return <Text>No family profile is available.</Text>;
  return (
    <View>
      <View style={s.card}>
        <Text style={s.heading}>Family contact details</Text>
        <Text>Contact email does not change your sign-in email.</Text>
        {Object.entries({
          name: "Family name",
          email: "Contact email",
          phone: "Phone",
          address: "Address",
        }).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={fields[key]}
            onChange={(value) => setFields({ ...fields, [key]: value })}
          />
        ))}
        <Button
          title="Save family details"
          disabled={busy}
          onPress={() => act("family-profile", fields)}
        />
      </View>
      {data.players.map((p) => (
        <PlayerForm key={p.id} player={p} act={act} busy={busy} />
      ))}
      <PlayerForm act={act} busy={busy} />
    </View>
  );
}
export function MobileWaitlists({ data, act, busy }) {
  const [programId, setProgram] = useState(data.programs[0]?.id || ""),
    [playerId, setPlayer] = useState(data.players[0]?.id || "");
  const staff = ["staff", "admin"].includes(data.user.role);
  if (!staff && data.user.role !== "parent") return null;
  return (
    <View style={s.card}>
      <Text style={s.heading}>Program waitlists</Text>
      <Text>
        Offers reserve a spot for 48 hours. Accept by completing the program's
        registration form above, including its waiver.
      </Text>
      <Text style={s.label}>Program</Text>
      {data.programs.map((p) => (
        <Button
          key={p.id}
          title={p.name}
          selected={programId === p.id}
          onPress={() => setProgram(p.id)}
        />
      ))}
      <Text style={s.label}>Player</Text>
      {data.players.map((p) => (
        <Button
          key={p.id}
          title={p.name}
          selected={playerId === p.id}
          onPress={() => setPlayer(p.id)}
        />
      ))}
      <Button
        title="Join waitlist"
        disabled={busy || !programId || !playerId}
        onPress={() => act("waitlist-join", { programId, playerId })}
      />
      {data.waitlist?.map((r) => (
        <View style={s.card} key={r.id}>
          <Text style={s.heading}>
            {data.programs.find((p) => p.id === r.programId)?.name}
          </Text>
          <Text>
            {data.players.find((p) => p.id === r.playerId)?.name} · {r.status}
            {r.position ? ` · Position ${r.position}` : ""}
          </Text>
          {r.status === "Offered" && (
            <Text>
              Complete registration above before{" "}
              {new Date(r.expiresAt).toLocaleString()}.
            </Text>
          )}
          {staff && r.status === "Waiting" && (
            <Button
              title="Offer spot"
              disabled={
                busy ||
                r.position !== 1 ||
                !data.programAvailability?.find(
                  (a) => a.programId === r.programId,
                )?.available
              }
              onPress={() => act("waitlist-offer", { id: r.id })}
            />
          )}{" "}
          {["Waiting", "Offered"].includes(r.status) && (
            <Button
              title={
                r.status === "Offered" ? "Decline offer" : "Leave waitlist"
              }
              disabled={busy}
              onPress={() => act("waitlist-leave", { id: r.id })}
            />
          )}
        </View>
      ))}
      {!data.waitlist?.length && <Text>No waitlist entries yet.</Text>}
    </View>
  );
}
export function MobilePlanControls({ data, act, busy }) {
  const [assignPlan, setAssignPlan] = useState(""),
    [players, setPlayers] = useState([]),
    [start, setStart] = useState(""),
    [weeks, setWeeks] = useState("1"),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [drills, setDrills] = useState([]);
  if (!["coach", "staff", "admin"].includes(data.user.role)) return null;
  const sessions = Object.values(
    data.workouts
      .filter((w) => w.sessionId)
      .reduce((a, w) => {
        (a[w.sessionId] ??= []).push(w);
        return a;
      }, {}),
  );
  return (
    <View style={s.card}>
      <Text style={s.heading}>Manage training plans</Text>
      <Button
        title="Create training plan"
        disabled={busy}
        onPress={() => {
          setEditing("new");
          setName("");
          setNotes("");
          setDrills([]);
        }}
      />
      <View style={s.card}>
        <Text style={s.heading}>Assign a plan</Text>
        {data.trainingPlans
          .filter((p) => !p.archived)
          .map((p) => (
            <Button
              key={p.id}
              title={p.name}
              selected={assignPlan === p.id}
              onPress={() => setAssignPlan(p.id)}
            />
          ))}
        <Text>Select up to 30 players</Text>
        {data.players.map((p) => (
          <Button
            key={p.id}
            title={p.name}
            selected={players.includes(p.id)}
            onPress={() =>
              setPlayers((a) =>
                a.includes(p.id) ? a.filter((id) => id !== p.id) : [...a, p.id],
              )
            }
          />
        ))}
        <Field
          label="First due date and time (YYYY-MM-DDTHH:mm)"
          value={start}
          onChange={setStart}
        />
        <Field label="Time zone" value={zone} onChange={setZone} />
        <Field label="Weeks (1–12)" value={weeks} onChange={setWeeks} numeric />
        <Text>
          Weekly assignments preserve local time. Each player receives a
          separate copy of the instructions.
        </Text>
        <Button
          title="Assign weekly training"
          disabled={
            busy ||
            !data.trainingPlans.some(
              (p) => p.id === assignPlan && !p.archived,
            ) ||
            !players.length ||
            players.length > 30 ||
            !start
          }
          onPress={async () => {
            if (
              await act("training-plan-assign", {
                planId: assignPlan,
                playerIds: players,
                start,
                timeZone: zone,
                count: Number(weeks),
              })
            )
              setPlayers([]);
          }}
        />
      </View>
      <Text>
        Edits apply to future assignments. Existing instructions and completed
        results are preserved.
      </Text>
      {data.trainingPlans.map((p) => (
        <View style={s.card} key={p.id}>
          <Text>
            {p.name}
            {p.archived ? " · Archived" : ""}
          </Text>
          <Button
            title="Edit plan"
            disabled={busy}
            onPress={() => {
              setEditing(p.id);
              setName(p.name);
              setNotes(p.notes);
              setDrills(p.exercises.map((d) => d.id));
            }}
          />
          <Button
            title={p.archived ? "Restore plan" : "Archive plan"}
            disabled={busy}
            onPress={() =>
              act("training-plan-archive", {
                planId: p.id,
                archived: !p.archived,
              })
            }
          />
        </View>
      ))}
      {editing && (
        <View style={s.card}>
          <Field label="Plan name" value={name} onChange={setName} />
          <Field label="Coaching notes" value={notes} onChange={setNotes} />
          <Text>
            Select exercises in order. Unselect and reselect to reorder.
          </Text>
          {data.drills.map((d) => (
            <Button
              key={d.id}
              title={
                (drills.includes(d.id) ? `${drills.indexOf(d.id) + 1}. ` : "") +
                d.name
              }
              selected={drills.includes(d.id)}
              onPress={() =>
                setDrills((a) =>
                  a.includes(d.id)
                    ? a.filter((id) => id !== d.id)
                    : [...a, d.id],
                )
              }
            />
          ))}
          <Button
            title={editing === "new" ? "Create plan" : "Save revised plan"}
            disabled={busy || !drills.length || drills.length > 12}
            onPress={async () => {
              if (
                await act(
                  editing === "new"
                    ? "training-plan-create"
                    : "training-plan-edit",
                  {
                    planId: editing,
                    name,
                    notes,
                    drillIds: drills,
                  },
                )
              )
                setEditing(null);
            }}
          />
          <Button title="Close editor" onPress={() => setEditing(null)} />
        </View>
      )}
      {sessions.map((rows) => {
        const w = rows[0],
          pending = rows.filter((x) => !x.completed && !x.cancelledAt).length;
        return (
          <View style={s.card} key={w.sessionId}>
            <Text>
              {w.planName} ·{" "}
              {data.players.find((p) => p.id === w.playerId)?.name}
            </Text>
            <Text>
              {new Date(w.due).toLocaleString()} · {pending} unfinished ·{" "}
              {rows.filter((w) => w.cancelledAt).length} cancelled
            </Text>
            {pending > 0 && (
              <Button
                title="Cancel unfinished exercises"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    "Cancel unfinished exercises?",
                    "Completed results remain in history.",
                    [
                      { text: "Keep assignment", style: "cancel" },
                      {
                        text: "Cancel exercises",
                        onPress: () =>
                          act("training-plan-cancel", {
                            sessionId: w.sessionId,
                          }),
                      },
                    ],
                  )
                }
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
export function MobileReports({ api }) {
  const [kind, setKind] = useState("enrollment"),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    api("reports/" + kind)
      .then((d) => {
        if (active) setResult(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [kind, revision]);
  const rows =
    result?.rows.filter((r) =>
      r.join(" ").toLowerCase().includes(search.toLowerCase()),
    ) || [];
  return (
    <View>
      {Object.entries({
        enrollment: "Enrollment",
        attendance: "Attendance",
        payments: "Outstanding payments",
        inventory: "Inventory",
      }).map(([key, label]) => (
        <Button
          key={key}
          title={label}
          selected={kind === key}
          onPress={() => setKind(key)}
        />
      ))}
      <Field label="Filter report" value={search} onChange={setSearch} />
      <Button
        title="Refresh report"
        onPress={() => setRevision((n) => n + 1)}
      />
      {error ? (
        <Text accessibilityRole="alert">{error}</Text>
      ) : !result ? (
        <Text>Loading report…</Text>
      ) : (
        <Text>
          {rows.length} matching records. CSV downloads are available in the web
          portal.
        </Text>
      )}
      {rows.slice(0, 100).map((r, i) => (
        <View key={i} style={s.card}>
          {r.map((c, j) => (
            <Text key={j}>
              {result.columns[j]}: {c}
            </Text>
          ))}
        </View>
      ))}
      {rows.length > 100 && (
        <Text>
          Showing the first 100 records. Narrow the filter or use the web report
          for all rows.
        </Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 16,
    marginVertical: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dce5eb",
    borderRadius: 4,
    gap: 10,
  },
  heading: { fontFamily: headingFont, fontSize: 22, color: "#17212b" },
  button: {
    minHeight: 48,
    padding: 13,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#83bbde",
    borderRadius: 3,
    marginVertical: 3,
  },
  buttonText: { color: "#163e58", fontSize: 15 },
  label: { fontSize: 15, color: "#35495b", marginBottom: 6 },
  input: {
    fontSize: 16,
    minHeight: 48,
    padding: 12,
    borderWidth: 1,
    borderColor: "#b7c9d6",
    borderRadius: 3,
    color: "#17212b",
  },
});
