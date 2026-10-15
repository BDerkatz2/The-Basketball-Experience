import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";

export function TabButton({ title, onPress, selected, disabled }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, selected && s.active]}><Text style={{ color: selected ? "white" : "#005c91", fontWeight: "600" }}>{title}</Text></Pressable>;
}
export function SessionPage({ event, data, act, busy, back }) {
  const [tab, setTab] = useState("Plan");
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(event.sessionPlan?.notes || "");
  const [planId, setPlanId] = useState(event.sessionPlan?.planId || "");
  const staff = ["coach", "staff", "admin"].includes(data.user.role);
  const players = data.players.filter((p) => event.playerIds.includes(p.id));
  return <View style={s.stack}>
    <TabButton title="‹ Back to sessions" onPress={back} />
    <Text style={s.heading}>{event.title}</Text>
    <Text>{new Date(event.start).toLocaleString()} · {event.minutes} min</Text>
    <Text>{event.location}{event.status === "Cancelled" ? " · Cancelled" : ""}</Text>
    <View style={s.tabs}>{["Plan", staff ? "Player check-ins" : "My check-in"].map((t) => <TabButton key={t} title={t} selected={tab === t} onPress={() => setTab(t)} />)}</View>
    {tab === "Plan" ? <View style={s.card}>
      <Text style={s.heading}>Session plan</Text>
      <Text>{event.kind} · {event.title}</Text>
      <Text>{event.sessionPlan?.notes || event.notes || event.description || "No additional session instructions have been added."}</Text>
      {event.sessionPlan?.name && <Text style={s.heading}>{event.sessionPlan.name}</Text>}
      {!!event.sessionPlan?.trainingNotes && <Text>{event.sessionPlan.trainingNotes}</Text>}
      {event.sessionPlan?.exercises?.map((d, i) => <View key={`${d.id}-${i}`} style={s.stack}><Text style={s.heading}>{i + 1}. {d.name} · {d.minutes} min</Text><Text>{d.instructions}</Text></View>)}
      {staff && !editing && <TabButton title="Edit session plan" disabled={busy || event.status === "Cancelled"} onPress={() => { setNotes(event.sessionPlan?.notes || ""); setPlanId(event.sessionPlan?.planId || ""); setEditing(true); }} />}
      {staff && editing && <View style={s.stack}>
        <Text>Session instructions</Text><TextInput accessibilityLabel="Session instructions" multiline value={notes} onChangeText={setNotes} maxLength={2000} style={{ borderWidth: 1, borderColor: "#78909c", borderRadius: 8, padding: 12, minHeight: 100 }} />
        <Text>Attach a training plan</Text>
        <TabButton title="Instructions only" selected={!planId} onPress={() => setPlanId("")} />
        {(data.trainingPlans || []).filter((p) => !p.archived).map((p) => <TabButton key={p.id} title={p.name} selected={planId === p.id} onPress={() => setPlanId(p.id)} />)}
        <TabButton title="Save session plan" disabled={busy} onPress={async () => { if (await act("session-plan", { eventId: event.id, notes, planId })) setEditing(false); }} />
        <TabButton title="Cancel editing" disabled={busy} onPress={() => setEditing(false)} />
      </View>}
    </View> : <View style={s.stack}>
      {!players.length && <Text>No players are available for this session.</Text>}
      {players.map((p) => {
        const present = data.attendance.some((a) => a.eventId === event.id && a.playerId === p.id && a.present);
        const rsvp = data.rsvps.find((r) => r.eventId === event.id && r.playerId === p.id)?.status || "Unsure";
        return <View key={p.id} style={s.card}><Text style={s.heading}>{p.name}</Text><Text>{present ? "Checked in" : "Not checked in"}</Text><Text style={s.note}>RSVP: {rsvp}</Text>
          {!staff && <><View style={s.tabs}>{["Going", "Unavailable", "Unsure"].map((status) => <TabButton key={status} title={status} selected={rsvp === status} disabled={busy || event.status === "Cancelled"} onPress={() => act("rsvp", { eventId: event.id, playerId: p.id, status })} />)}</View><TabButton title={present ? "Undo my check-in" : "Check in"} disabled={busy || event.status === "Cancelled"} onPress={() => act("self-checkin", { eventId: event.id, playerId: p.id, present: !present })} /></>}
        </View>;
      })}
    </View>}
  </View>;
}
export function TeamPage({ team, data, act, busy, back, onScreenChange }) {
  const [tab, setTab] = useState("Sessions");
  const [eventId, setEventId] = useState(null);
  const roster = data.players.filter((p) => p.teamId === team.id);
  const events = data.events.filter((e) => e.teamId === team.id || e.opponentId === team.id);
  const event = events.find((e) => e.id === eventId);
  if (event) return <SessionPage event={event} data={data} act={act} busy={busy} back={() => { setEventId(null); onScreenChange?.(); }} />;
  return <View style={s.stack}>
    <TabButton title="‹ Back to your teams" onPress={back} />
    <Text style={s.heading}>{team.name}</Text>
    <View style={s.tabs}>{["Sessions", "Roster"].map((t) => <TabButton key={t} title={t} selected={tab === t} onPress={() => { setTab(t); onScreenChange?.(); }} />)}</View>
    {tab === "Roster" ? <View style={s.stack}>{roster.map((p) => <View key={p.id} style={s.card}><Text style={s.heading}>{p.name}</Text></View>)}<Text style={s.note}>{["parent", "player"].includes(data.user.role) ? "Showing players your account can access." : `${roster.length} players`}</Text></View> : <View style={s.stack}>{events.map((e) => <TabButton key={e.id} title={`${e.title} · ${new Date(e.start).toLocaleDateString()} ›`} onPress={() => { setEventId(e.id); onScreenChange?.(); }} />)}{!events.length && <Text>No sessions scheduled for this team.</Text>}</View>}
  </View>;
}
const s = StyleSheet.create({ stack: { gap: 18 }, tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, button: { minHeight: 48, padding: 14, borderRadius: 16, backgroundColor: "#def2ff", justifyContent: "center" }, active: { backgroundColor: "#073b56" }, card: { backgroundColor: "white", borderRadius: 18, padding: 18, gap: 12 }, heading: { fontSize: 19, fontWeight: "700", color: "#172d3c" }, note: { color: "#576d7c", lineHeight: 21 } });

