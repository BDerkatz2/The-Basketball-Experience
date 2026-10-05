import * as Picker from "expo-document-picker";
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Switch } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetch as nativeFetch } from "expo/fetch";
const field = {
    borderWidth: 1,
    borderColor: "#9ab1c1",
    padding: 12,
    minHeight: 48,
    marginVertical: 6,
    fontSize: 16,
  },
  box = { padding: 14, backgroundColor: "white", marginVertical: 10 };
function Button({ label, onPress, disabled }) {
  return (
    <Pressable
      style={{ ...field, backgroundColor: disabled ? "#ddd" : "#dbf2ff" }}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Pressable>
  );
}
function Pick({ label, rows, value, set }) {
  return (
    <View>
      <Text>{label}</Text>
      {rows.map((r) => (
        <Button
          key={r.id}
          label={(value === r.id ? "✓ " : "") + r.name}
          onPress={() => set(r.id)}
        />
      ))}
    </View>
  );
}
function Form({ title, initial, fields, save, disabled }) {
  const [b, set] = useState(initial),
    [working, setWorking] = useState(false);
  return (
    <View style={box}>
      <Text style={{ fontSize: 22 }}>{title}</Text>
      {fields.map((f) => (
        <View key={f.name}>
          <Text>{f.label || f.name}</Text>
          {f.rows ? (
            <Pick
              label="Choose"
              rows={f.rows}
              value={b[f.name]}
              set={(v) => set({ ...b, [f.name]: v })}
            />
          ) : f.type === "boolean" ? (
            <Switch
              accessibilityLabel={f.label || f.name}
              value={!!b[f.name]}
              onValueChange={(v) => set({ ...b, [f.name]: v })}
            />
          ) : (
            <TextInput
              accessibilityLabel={f.label || f.name}
              style={field}
              multiline={f.multiline}
              keyboardType={f.type === "number" ? "numeric" : "default"}
              value={String(b[f.name] ?? "")}
              onChangeText={(v) =>
                set({ ...b, [f.name]: f.type === "number" ? Number(v) : v })
              }
            />
          )}
        </View>
      ))}
      <Button
        label="Save"
        disabled={disabled || working}
        onPress={async () => {
          setWorking(true);
          try {
            await save(b);
          } finally {
            setWorking(false);
          }
        }}
      />
    </View>
  );
}
export function Administration({
  data,
  act,
  api,
  busy,
  base,
  token,
  mode,
  refresh,
}) {
  const [tab, setTab] = useState(
      data.user.role === "coach" ? "Documents" : "Programs",
    ),
    [selected, setSelected] = useState(data.programs[0]?.id || ""),
    [error, setError] = useState(""),
    [link, setLink] = useState("");
  const staff = ["admin", "staff"].includes(data.user.role),
    admin = data.user.role === "admin",
    program = data.programs.find((p) => p.id === selected);
  async function run(fn) {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
      return null;
    }
  }
  async function download(path, name, type) {
    await run(async () => {
      if (!(await Sharing.isAvailableAsync()))
        throw Error("Sharing is unavailable on this device.");
      const r = await nativeFetch(base + "/api/" + path, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok) throw Error("Download unavailable.");
      const local = new File(Paths.cache, Date.now() + "-" + name);
      try {
        local.write(new Uint8Array(await r.arrayBuffer()));
        await Sharing.shareAsync(local.uri, { mimeType: type });
      } finally {
        if (local.exists) local.delete();
      }
    });
  }
  async function uploadDocument() {
    await run(async () => {
      const r = await Picker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg"],
        copyToCacheDirectory: true,
      });
      if (r.canceled) return;
      const a = r.assets[0];
      const file = new File(a.uri);
      if (!file.size || file.size > 20 * 1024 * 1024)
        throw Error("Choose a document up to 20 MB.");
      const response = await nativeFetch(
        base +
          "/api/files?" +
          new URLSearchParams({ purpose: "staff", name: a.name }),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/octet-stream",
          },
          body: await file.arrayBuffer(),
        },
      );
      if (!response.ok) throw Error("Document upload failed.");
      await refresh();
    });
  }
  if (!staff && data.user.role !== "coach") return null;
  const tabs = staff
    ? ["Programs", "Scheduling", "Documents", ...(admin ? ["Invitations"] : [])]
    : ["Documents"];
  return (
    <View>
      <Pick
        label="Administration area"
        rows={tabs.map((id) => ({ id, name: id }))}
        value={tab}
        set={setTab}
      />
      {error && <Text accessibilityRole="alert">{error}</Text>}
      {tab === "Programs" && staff && (
        <>
          <Pick
            label="Existing program"
            rows={data.programs}
            value={selected}
            set={setSelected}
          />
          {program && (
            <>
              <Form
                key={program.id + "edit"}
                title="Edit program"
                initial={program}
                fields={[
                  "name",
                  "description",
                  "location",
                  "ages",
                  "price",
                  "capacity",
                  "sessions",
                ].map((name) => ({
                  name,
                  type: ["price", "capacity", "sessions"].includes(name)
                    ? "number"
                    : "text",
                }))}
                save={(b) => act("program-edit", { ...b, id: program.id })}
                disabled={busy}
              />
              <Form
                key={program.id + "rules"}
                title="Registration eligibility"
                initial={{
                  minAge: "",
                  maxAge: "",
                  opensAt: "",
                  closesAt: "",
                  closed: false,
                  membersOnly: false,
                  ...program.registration,
                }}
                fields={[
                  { name: "minAge" },
                  { name: "maxAge" },
                  {
                    name: "opensAt",
                    label:
                      "Opens at (ISO date/time with offset; blank for none)",
                  },
                  {
                    name: "closesAt",
                    label:
                      "Closes at (ISO date/time with offset; blank for none)",
                  },
                  { name: "closed", type: "boolean" },
                  { name: "membersOnly", type: "boolean" },
                ]}
                disabled={busy}
                save={(b) =>
                  act("registration-rules", {
                    ...b,
                    id: program.id,
                    minAge: b.minAge === "" ? null : Number(b.minAge),
                    maxAge: b.maxAge === "" ? null : Number(b.maxAge),
                  })
                }
              />
              <Form
                key={program.id + "season"}
                title="Copy to a new season"
                initial={{ season: "", name: program.name, confirm: false }}
                fields={[
                  { name: "season" },
                  { name: "name", label: "New program name" },
                  {
                    name: "confirm",
                    label:
                      "Close old registration and create a closed copy; history remains unchanged",
                    type: "boolean",
                  },
                ]}
                disabled={busy}
                save={(b) => act("season-rollover", { ...b, id: program.id })}
              />
            </>
          )}
          <Form
            title="Create program"
            initial={{
              name: "",
              description: "",
              location: "",
              ages: "",
              type: "League",
              price: 0,
              capacity: 20,
              sessions: 8,
            }}
            fields={[
              ...["name", "description", "location", "ages"].map((name) => ({
                name,
              })),
              {
                name: "type",
                rows: ["League", "Skill Development"].map((id) => ({
                  id,
                  name: id,
                })),
              },
              ...["price", "capacity", "sessions"].map((name) => ({
                name,
                type: "number",
              })),
            ]}
            disabled={busy}
            save={(b) => act("program", b)}
          />
          <Button
            label="Download signed waiver records (JSON)"
            onPress={() =>
              download("export/waivers", "waivers.json", "application/json")
            }
          />
        </>
      )}
      {tab === "Scheduling" && staff && (
        <NativeSchedules
          data={data}
          act={act}
          api={api}
          busy={busy}
          run={run}
        />
      )}
      {tab === "Invitations" && admin && (
        <>
          <Text>
            Invitation creation requires account mode. Delivery is manual until
            email is configured. Share invitation links only with the named
            recipient.
          </Text>
          <Form
            title="Issue account invitation"
            initial={{
              name: "",
              email: "",
              role: "staff",
              familyId: data.families[0]?.id || "",
              playerId: data.players[0]?.id || "",
              teamId: data.teams[0]?.id || "",
            }}
            disabled={busy || mode !== "accounts"}
            fields={[
              { name: "name" },
              { name: "email" },
              {
                name: "role",
                rows: ["parent", "player", "coach", "staff"].map((id) => ({
                  id,
                  name: id,
                })),
              },
              { name: "familyId", rows: data.families },
              { name: "playerId", rows: data.players },
              { name: "teamId", rows: data.teams },
            ]}
            save={(b) =>
              run(async () => {
                const r = await api("account-links", {
                  ...b,
                  kind: "invite",
                  teamIds: b.role === "coach" ? [b.teamId] : [],
                });
                setLink(base + "/#account-link=" + r.token);
              })
            }
          />
          {link && (
            <>
              <Text selectable>{link}</Text>
              <Button
                label="Hide invitation link"
                onPress={() => setLink("")}
              />
            </>
          )}
        </>
      )}
      {tab === "Documents" && (
        <>
          <Button
            label="Upload my staff document"
            disabled={busy}
            onPress={uploadDocument}
          />
          <Form
            title="My onboarding profile"
            initial={
              data.staffProfiles.find((p) => p.userId === data.user.id) || {
                phone: "",
                emergencyContact: "",
                availability: "",
              }
            }
            fields={["phone", "emergencyContact", "availability"].map(
              (name) => ({ name }),
            )}
            save={(b) => act("staff-profile", b)}
            disabled={busy}
          />
          {data.files
            .filter((f) => f.purpose === "staff")
            .map((f) => (
              <View key={f.id} style={box}>
                <Text>
                  {f.documentTitle || f.name} ·{" "}
                  {f.expiresOn
                    ? "Expires " + f.expiresOn
                    : "No expiry recorded"}
                </Text>
                <Button
                  label="Open / share document"
                  onPress={() =>
                    download(
                      "files/" + f.id,
                      f.id +
                        (f.type === "application/pdf"
                          ? ".pdf"
                          : f.type === "image/png"
                            ? ".png"
                            : ".jpg"),
                      f.type,
                    )
                  }
                />
                <Form
                  title="Document details"
                  initial={{
                    title: f.documentTitle || f.name,
                    expiresOn: f.expiresOn || "",
                    retired: !!f.retired,
                  }}
                  fields={[
                    { name: "title" },
                    {
                      name: "expiresOn",
                      label: "Expiry date YYYY-MM-DD; blank for no expiry",
                    },
                    {
                      name: "retired",
                      type: "boolean",
                      label: "Superseded document retained in history",
                    },
                  ]}
                  disabled={busy}
                  save={(b) => act("staff-document", { ...b, id: f.id })}
                />
              </View>
            ))}
          {admin &&
            data.staffProfiles.map((p) => (
              <Form
                key={p.userId + p.updatedAt}
                title={
                  "Review " +
                  (data.staffDirectory.find((u) => u.id === p.userId)?.name ||
                    p.userId)
                }
                initial={{ status: p.status, reviewNote: p.reviewNote || "" }}
                fields={[
                  {
                    name: "status",
                    rows: ["Submitted", "Approved", "Needs changes"].map(
                      (id) => ({ id, name: id }),
                    ),
                  },
                  { name: "reviewNote", multiline: true },
                ]}
                disabled={busy}
                save={(b) => act("staff-review", { ...b, userId: p.userId })}
              />
            ))}
        </>
      )}
    </View>
  );
}
function NativeSchedules({ data, act, api, busy, run }) {
  const [teams, setTeams] = useState([]),
    [preview, setPreview] = useState(null),
    [request, setRequest] = useState(null);
  return (
    <>
      <Form
        title="Change this and following practices"
        initial={{
          id: data.events.find((e) => e.seriesId)?.id || "",
          shiftDays: 0,
          localTime: "18:00",
          confirm: false,
        }}
        fields={[
          {
            name: "id",
            rows: data.events
              .filter((e) => e.seriesId && e.status !== "Cancelled")
              .map((e) => ({ id: e.id, name: e.title + " · " + e.start })),
          },
          { name: "shiftDays", type: "number" },
          {
            name: "localTime",
            label: "New local time HH:mm in session time zone",
          },
          {
            name: "confirm",
            type: "boolean",
            label: "Apply to this and following active sessions",
          },
        ]}
        disabled={busy}
        save={(b) => act("series-reschedule", b)}
      />
      <Form
        title="Recurring practice"
        initial={{
          teamId: data.teams[0]?.id || "",
          title: "Practice",
          location: "",
          start: "",
          timeZone: "America/Edmonton",
          minutes: 60,
          count: 8,
          intervalWeeks: 1,
          excludeDates: "",
        }}
        fields={[
          { name: "teamId", rows: data.teams },
          { name: "title" },
          { name: "location" },
          { name: "start", label: "First local start YYYY-MM-DDTHH:mm" },
          { name: "timeZone" },
          ...["minutes", "count", "intervalWeeks"].map((name) => ({
            name,
            type: "number",
          })),
          {
            name: "excludeDates",
            label: "Skipped dates YYYY-MM-DD, comma separated",
          },
        ]}
        disabled={busy}
        save={(b) =>
          act("schedule", {
            ...b,
            excludeDates: b.excludeDates
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
      />
      <Text style={{ fontSize: 22 }}>Tournament teams</Text>
      {data.teams.map((t) => (
        <Button
          key={t.id}
          label={(teams.includes(t.id) ? "✓ " : "") + t.name}
          onPress={() => {
            setTeams(
              teams.includes(t.id)
                ? teams.filter((id) => id !== t.id)
                : [...teams, t.id],
            );
            setPreview(null);
          }}
        />
      ))}
      <Form
        title="Preview tournament schedule"
        initial={{
          start: "",
          timeZone: "America/Edmonton",
          location: "",
          courts: "",
          days: 7,
          slots: 4,
          minutes: 60,
          gap: 15,
          rounds: 1,
          restHours: 2,
          maxGamesPerDay: 2,
          blackoutDates: "",
          weekdays: "1,2,3,4,5,6,7",
        }}
        fields={[
          { name: "start", label: "First local start YYYY-MM-DDTHH:mm" },
          { name: "timeZone" },
          { name: "location" },
          { name: "courts", label: "Court names separated by commas" },
          ...[
            "days",
            "slots",
            "minutes",
            "gap",
            "rounds",
            "restHours",
            "maxGamesPerDay",
          ].map((name) => ({ name, type: "number" })),
          {
            name: "blackoutDates",
            label: "Blackout dates YYYY-MM-DD, comma separated",
          },
          {
            name: "weekdays",
            label:
              "Allowed weekdays: Monday 1 through Sunday 7, comma separated",
          },
        ]}
        disabled={busy}
        save={(b) =>
          run(async () => {
            setPreview(null);
            const params = {
              ...b,
              teamIds: teams,
              courts: b.courts
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              blackoutDates: b.blackoutDates
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
              weekdays: b.weekdays.split(",").map(Number),
            };
            if (!params.courts.length) params.courts = [b.location];
            const result = await api("schedule/preview", params);
            setRequest(params);
            setPreview(result);
          })
        }
      />
      {preview && (
        <View style={box}>
          <Text>{preview.explanation}</Text>
          <Text>
            {preview.games.length} games ·{" "}
            {preview.complete ? "Complete" : "Incomplete"}
          </Text>
          {preview.games.map((g, i) => (
            <Text key={i}>
              {g.title} · {g.start} · {g.location}
            </Text>
          ))}
          {preview.unscheduled.map((s, i) => (
            <Text key={i}>Unscheduled: {s}</Text>
          ))}
          <Button
            label="Commit previewed schedule"
            disabled={busy || !preview.complete}
            onPress={async () => {
              if (
                await act("schedule-plan", {
                  ...request,
                  fingerprint: preview.fingerprint,
                })
              )
                setPreview(null);
            }}
          />
        </View>
      )}
    </>
  );
}
