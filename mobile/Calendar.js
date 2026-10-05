import { headingFont } from "./theme";
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Switch,
  ScrollView,
  Linking,
  StyleSheet,
} from "react-native";
import {
  dayKey,
  fromDay,
  daysFor,
  moveCalendar,
  eventsOnDay,
  filterSessions,
} from "./calendar-utils.mjs";
function Button({ title, onPress, disabled, selected }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, selected && s.selected, disabled && { opacity: 0.4 }]}
    >
      <Text style={[s.buttonText, selected && { color: "#fff" }]}>{title}</Text>
    </Pressable>
  );
}
export function MobileCalendar({ data, act, busy }) {
  const [view, setView] = useState("month"),
    [anchor, setAnchor] = useState(() => new Date()),
    [selected, setSelected] = useState(() => dayKey(new Date())),
    [jump, setJump] = useState(() => dayKey(new Date())),
    [player, setPlayer] = useState("all"),
    [query, setQuery] = useState(""),
    [cancelled, setCancelled] = useState(false),
    [error, setError] = useState("");
  const filtered = filterSessions(data.events, {
      player,
      query,
      showCancelled: cancelled,
    }),
    days = daysFor(anchor, view),
    day = fromDay(selected),
    events = view === "agenda" ? filtered : eventsOnDay(filtered, day),
    staff = ["coach", "staff", "admin"].includes(data.user.role);
  function navigate(date) {
    setAnchor(date);
    setSelected(dayKey(date));
    setJump(dayKey(date));
    setError("");
  }
  const heading =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : days[0].toLocaleDateString() + " – " + days[6].toLocaleDateString();
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Button
          title="All players"
          selected={player === "all"}
          onPress={() => setPlayer("all")}
        />
        {data.players.map((p) => (
          <Button
            key={p.id}
            title={p.name}
            selected={player === p.id}
            onPress={() => setPlayer(p.id)}
          />
        ))}
      </ScrollView>
      <TextInput
        style={s.input}
        accessibilityLabel="Search sessions"
        placeholder="Search sessions or locations"
        value={query}
        onChangeText={setQuery}
      />
      <View style={s.row}>
        {["month", "week", "agenda"].map((v) => (
          <Button
            key={v}
            title={v[0].toUpperCase() + v.slice(1)}
            selected={view === v}
            onPress={() => {
              setAnchor(day);
              setView(v);
            }}
          />
        ))}
      </View>
      <View style={s.row}>
        <Text style={s.label}>Show cancelled sessions</Text>
        <Switch
          accessibilityLabel="Show cancelled sessions"
          value={cancelled}
          onValueChange={setCancelled}
        />
      </View>
      {view !== "agenda" && (
        <>
          <Text style={s.title}>{heading}</Text>
          <View style={s.row}>
            <Button
              title="Previous"
              onPress={() => navigate(moveCalendar(anchor, view, -1))}
            />
            <Button title="Today" onPress={() => navigate(new Date())} />
            <Button
              title="Next"
              onPress={() => navigate(moveCalendar(anchor, view, 1))}
            />
          </View>
          <View style={s.row}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              accessibilityLabel="Go to date YYYY-MM-DD"
              placeholder="YYYY-MM-DD"
              value={jump}
              maxLength={10}
              onChangeText={setJump}
            />
            <Button
              title="Go to date"
              onPress={() => {
                const next = fromDay(jump);
                if (next) navigate(next);
                else setError("Enter a valid date as YYYY-MM-DD.");
              }}
            />
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Text style={s.note}>
            Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Tap a
            date to see sessions below.
          </Text>
          <View style={s.grid}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <View style={s.headingCell} key={i}>
                <Text>{d}</Text>
              </View>
            ))}
            {days.map((d) => {
              const key = dayKey(d),
                count = eventsOnDay(filtered, d).length,
                today = key === dayKey(new Date());
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${count} sessions${today ? ", today" : ""}`}
                  accessibilityState={{ selected: key === selected }}
                  onPress={() => {
                    setSelected(key);
                    setJump(key);
                  }}
                  style={[
                    s.day,
                    d.getMonth() !== anchor.getMonth() && s.outside,
                    key === selected && s.selected,
                  ]}
                >
                  <Text
                    style={[
                      s.dayText,
                      key === selected && { color: "#fff" },
                      today && { fontWeight: "900" },
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                  <Text
                    style={[s.count, key === selected && { color: "#fff" }]}
                  >
                    {count ? `${count} •` : today ? "Today" : " "}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.title}>
            {day.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </>
      )}
      {!events.length && (
        <Text style={s.note}>
          {view === "agenda"
            ? "No sessions match your filters."
            : "No matching sessions on this day."}
        </Text>
      )}
      {events.map((e) => (
        <View key={e.id} style={s.card}>
          <Text style={s.tag}>
            {e.status === "Cancelled" ? "CANCELLED" : e.kind} ·{" "}
            {new Date(e.start).toLocaleString()}
          </Text>
          <Text style={s.title}>{e.title}</Text>
          <Text>
            {e.location} · {e.minutes} minutes
          </Text>
          <Button
            title="Open location in maps"
            onPress={async () => {
              try {
                await Linking.openURL(
                  "https://www.google.com/maps/search/?api=1&query=" +
                    encodeURIComponent(e.address || e.location),
                );
              } catch {
                setError("Could not open maps.");
              }
            }}
          />
          <Text style={s.note}>
            Confirm the venue address before travelling.
          </Text>
          {e.playerIds
            .filter((id) => data.players.some((p) => p.id === id))
            .map((id) => {
              const p = data.players.find((p) => p.id === id),
                rsvp = data.rsvps.find(
                  (r) => r.eventId === e.id && r.playerId === id,
                ),
                present = !!data.attendance.find(
                  (a) => a.eventId === e.id && a.playerId === id,
                )?.present;
              return (
                <View key={id}>
                  <Text style={s.person}>
                    {p.name} · {rsvp?.status || "Unsure"}
                  </Text>
                  <View style={s.row}>
                    {["Going", "Unavailable", "Unsure"].map((status) => (
                      <Button
                        key={status}
                        title={status}
                        selected={(rsvp?.status || "Unsure") === status}
                        disabled={busy || e.status === "Cancelled"}
                        onPress={() =>
                          act("rsvp", { eventId: e.id, playerId: id, status })
                        }
                      />
                    ))}
                  </View>
                  {staff && (
                    <Button
                      title={present ? "Undo check-in" : "Check in"}
                      disabled={busy || e.status === "Cancelled"}
                      onPress={() =>
                        act("checkin", {
                          eventId: e.id,
                          playerId: id,
                          present: !present,
                        })
                      }
                    />
                  )}
                </View>
              );
            })}
        </View>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginVertical: 6,
  },
  label: { flex: 1 },
  button: {
    backgroundColor: "#edf5fa",
    borderRadius: 8,
    padding: 12,
    margin: 3,
  },
  buttonText: { color: "#171d24", fontWeight: "600" },
  selected: { backgroundColor: "#171d24" },
  input: {
    backgroundColor: "#fff",
    borderColor: "#edf5fa",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 10,
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    fontFamily: headingFont,
    color: "#171d24",
    marginVertical: 12,
  },
  note: { fontSize: 12, color: "#35495b", marginVertical: 10, lineHeight: 18 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },
  headingCell: {
    width: "14.285714%",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#edf5fa",
  },
  day: {
    width: "14.285714%",
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
    borderColor: "#edf5fa",
  },
  outside: { backgroundColor: "#f7f9fb" },
  dayText: { fontSize: 15, color: "#171d24" },
  count: { fontSize: 10, color: "#35495b", marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 12,
    marginVertical: 12,
  },
  tag: { fontSize: 12, color: "#35495b" },
  person: {
    fontWeight: "700",
    fontFamily: headingFont,
    marginTop: 12,
    color: "#171d24",
  },
  error: { color: "#a33228", marginVertical: 10 },
});
