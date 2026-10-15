import { TeamPage } from "./TeamPages";
import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
export function MobileHome({ data, navigate, onScreenChange, act, busy }) {
  const parent = data.user.role === "parent";
  const coach = ["coach", "staff", "admin"].includes(data.user.role);
  const [teamId, setTeamId] = useState(null);
  const teams = data.teams.filter((t) => data.channels.includes(t.id));
  const selectedTeam = teams.find((t) => t.id === teamId);
  function openTeam(id) {
    setTeamId(id);
    onScreenChange?.();
  }
  const next = [...data.events]
    .filter(
      (e) => e.status !== "Cancelled" && Date.parse(e.start) >= Date.now(),
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
  const workouts = data.workouts.filter((w) => !w.completed && !w.cancelledAt);
  if (selectedTeam) return <TeamPage team={selectedTeam} data={data} act={act} busy={busy} back={() => openTeam(null)} onScreenChange={onScreenChange} />;
  return (
    <View style={{ gap: 20 }}>
      <View style={h.feature}>
        <Text style={h.kicker}>UP NEXT</Text>
        <Text style={h.featureTitle}>
          {next?.title || "Room for your next move."}
        </Text>
        <Text style={h.featureBody}>
          {next
            ? new Date(next.start).toLocaleString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "Your next session will appear here when it is scheduled."}
        </Text>
        {next && <Text style={h.featureBody}>{next.location}</Text>}
        <Action
          title="Open schedule →"
          onPress={() => navigate("Schedule")}
          light
        />
      </View>
      <Text style={h.heading}>
        {"Your teams"}
      </Text>
      {teams.map((t) => {
        const count = data.players.filter((p) => p.teamId === t.id).length;
        return (
          <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Open ${t.name} team`} onPress={() => openTeam(t.id)} style={h.person}>
            <View style={h.avatar}><Text style={h.initial}>{t.name.split(" ").map((n) => n[0]).slice(0, 3).join("")}</Text></View>
            <View style={{ flex: 1 }}><Text style={h.name}>{t.name}</Text><Text style={h.note}>{count} {count === 1 ? "player" : "players"} · View team</Text></View>
            <Text style={h.arrow}>›</Text>
          </Pressable>
        );
      })}
      {!teams.length && <Text style={h.note}>Your assigned teams will appear here.</Text>}
      <View style={h.line}>
        <Text style={h.heading}>
          {coach ? "Team training to check in on" : parent ? "Training to check in on" : "Your next workout"}
        </Text>
        <Text style={h.note}>{workouts.length} to go</Text>
      </View>
      {workouts.slice(0, 2).map((w) => {
        const d =
          w.drillSnapshot || data.drills.find((d) => d.id === w.drillId);
        return (
          <Pressable
            key={w.id}
            accessibilityRole="button"
            onPress={() => navigate("Training")}
            style={h.card}
          >
            <Text style={h.kickerDark}>
              {parent || coach
                ? data.players.find((p) => p.id === w.playerId)?.name + " · "
                : ""}
              {d?.category}
            </Text>
            <Text style={h.name}>{d?.name || "Assigned workout"}</Text>
            <Text style={h.note}>{d?.minutes || 0} min · Open training →</Text>
          </Pressable>
        );
      })}
      {!workouts.length && (
        <Text style={h.note}>
          All caught up. New assignments will appear here.
        </Text>
      )}
      <View style={h.line}>
        <Action title="Browse programs" onPress={() => navigate("Programs")} />
        <Action title="Shop TBE" onPress={() => navigate("Store")} />
      </View>
    </View>
  );
}
export function Action({ title, onPress, light = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[h.action, light && { backgroundColor: "#fff" }]}
    >
      <Text style={h.actionText}>{title}</Text>
    </Pressable>
  );
}
const h = StyleSheet.create({
  feature: {
    backgroundColor: "#073b56",
    borderRadius: 24,
    padding: 24,
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#82d6ff",
  },
  featureTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: "#fff",
  },
  featureBody: { fontSize: 15, lineHeight: 23, color: "#d2eafa" },
  heading: { fontSize: 19, fontWeight: "700", color: "#172d3c", flexShrink: 1 },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    minHeight: 80,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#dff3ff",
    alignItems: "center",
    justifyContent: "center",
  },
  initial: { fontWeight: "700", color: "#006aab" },
  name: { fontSize: 17, fontWeight: "600", color: "#172d3c", lineHeight: 25 },
  note: { fontSize: 13, color: "#576d7c", lineHeight: 21 },
  arrow: { fontSize: 26, color: "#006aab" },
  line: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  card: { padding: 20, borderRadius: 18, backgroundColor: "#fff", gap: 8 },
  kickerDark: { fontSize: 12, color: "#006aab", fontWeight: "600" },
  action: {
    minHeight: 48,
    padding: 14,
    backgroundColor: "#def2ff",
    borderRadius: 24,
    justifyContent: "center",
  },
  actionText: { color: "#005c91", fontWeight: "700", textAlign: "center" },
});

