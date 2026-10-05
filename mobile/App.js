import { Administration } from "./Administration";
import {
  NativeCart,
  NativeScoring,
  NativePlaybook,
  NativeStaff,
  NativeInventory,
  NativeRefundReview,
  NativeGameStats,
} from "./QuoteTools";
import {
  MobileProgress,
  MobileVideoManagement,
  MobilePayments,
} from "./Operations";
import { headingFont } from "./theme";
import { MobileCalendar } from "./Calendar";
import { MobileVideo } from "./Video";
import {
  MobileFamily,
  MobileWaitlists,
  MobilePlanControls,
  MobileReports,
} from "./Workflows";
import { PhonePush } from "./Push";
import { MobileChat, MobileRedeem } from "./Communication";
import { MobileMemberships, MobilePreferences } from "./FamilySettings";
import { canManageMemberships } from "./membership-utils.mjs";
import React, { useState, useEffect } from "react";
import {
  View,
  Image,
  ImageBackground,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from "react-native";
import {
  Programs,
  Store,
  Updates,
  Brackets,
  MobileAccountLogin,
} from "./Modules";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
const BASE =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:4173"
    : "http://127.0.0.1:4173");
const date = (s) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
export default function App() {
  const [token, setToken] = useState(""),
    [data, setData] = useState(null),
    [page, setPage] = useState("Home"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [draft, setDraft] = useState(""),
    [channel, setChannel] = useState(""),
    [selected, setSelected] = useState(null),
    [attempts, setAttempts] = useState("0"),
    [made, setMade] = useState("0");
  const [mode, setMode] = useState("local-demo");
  const [accountLink, setAccountLink] = useState(null);
  useEffect(() => {
    const accept = (url) => {
      if (
        typeof url === "string" &&
        (url.startsWith("tbe://account") ||
          url.startsWith(BASE + "/#account-link="))
      )
        setAccountLink(url);
    };
    Linking.getInitialURL()
      .then(accept)
      .catch(() => {});
    const subscription = Linking.addEventListener("url", (e) => accept(e.url));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    fetch(BASE + "/api/config")
      .then((r) => r.json())
      .then((c) => setMode(c.mode))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!token || page !== "League" || busy) return;
    let active = true,
      inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await api("state");
        if (active) setData(next);
      } catch {
      } finally {
        inFlight = false;
      }
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, page, busy]);
  async function accountLogin(body) {
    setBusy(true);
    setError("");
    try {
      const result = await api("auth/login", body);
      setToken(result.token);
      const d = await api("state", null, result.token);
      setData(d);
      setChannel(d.channels[0] || "");
      setPage("Home");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function api(path, body, auth = token) {
    const r = await fetch(BASE + "/api/" + path, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json();
    if (!r.ok) {
      if (r.status === 401) {
        setData(null);
        setToken("");
      }
      throw new Error(d.error || "Request failed");
    }
    return d;
  }
  async function refresh() {
    setBusy(true);
    try {
      setData(await api("state"));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function login(userId) {
    setBusy(true);
    setError("");
    try {
      const s = await api("demo-session", { userId });
      setToken(s.token);
      const d = await api("state", null, s.token);
      setData(d);
      setChannel(d.channels[0] || "");
      setPage("Home");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function act(action, body) {
    setBusy(true);
    setError("");
    try {
      await api("actions/" + action, body);
      setData(await api("state"));
      setMessage("Saved to your community.");
      setSelected(null);
      setDraft("");
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const Button = ({ title, onPress, outline = false }) => (
    <Pressable
      disabled={busy}
      accessibilityRole="button"
      onPress={onPress}
      style={[s.button, outline && s.outline, busy && { opacity: 0.5 }]}
    >
      <Text style={[s.buttonText, outline && { color: "#171d24" }]}>
        {title}
      </Text>
    </Pressable>
  );
  const name = (id) => data.players.find((p) => p.id === id)?.name || "Player";
  const team = (id) => data.teams.find((t) => t.id === id)?.name || "Team";
  const staff = data && ["admin", "staff", "coach"].includes(data.user.role);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.safe}>
        <View style={s.top}>
          <Image
            source={require("./assets/logo.png")}
            accessibilityLabel="The Basketball Experience"
            style={{ width: 205, height: 78 }}
            resizeMode="contain"
          />
          <Text style={s.demo}>
            {mode === "accounts" ? "COMMUNITY PORTAL" : "LOCAL DEMO"}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            data ? (
              <RefreshControl refreshing={busy} onRefresh={refresh} />
            ) : undefined
          }
        >
          {!data && mode === "accounts" && accountLink === null && (
            <Button
              title="Use invitation / reset link"
              outline
              onPress={() => setAccountLink("")}
            />
          )}
          {accountLink !== null ? (
            <MobileRedeem
              key={accountLink}
              api={api}
              initialLink={accountLink}
              onCancel={() => setAccountLink(null)}
              onDone={() => {
                setToken("");
                setData(null);
                setAccountLink(null);
              }}
            />
          ) : !data && mode === "accounts" ? (
            <MobileAccountLogin
              login={accountLogin}
              busy={busy}
              error={error}
            />
          ) : !data ? (
            <>
              <ImageBackground
                source={require("./assets/training.jpg")}
                style={s.hero}
                imageStyle={{ opacity: 0.28 }}
              >
                <Text style={s.eyebrow}>MORE THAN A GAME</Text>
                <Text style={s.heroTitle}>
                  YOUR BASKETBALL.{"\n"}ONE EXPERIENCE.
                </Text>
                <Text style={s.heroText}>
                  Your basketball journey, together in one place.
                </Text>
              </ImageBackground>
              <Text style={s.title}>Welcome back.</Text>
              <Text style={s.muted}>
                Choose a sample account to explore. No real payments or messages
                are sent.
              </Text>
              {[
                ["parent", "Jordan Morgan · Parent"],
                ["player", "Alex Morgan · Player"],
                ["coach", "Taylor Brooks · Coach"],
                ["staff", "Casey Rivera · Staff"],
                ["admin", "Sam Chen · Admin"],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  title={label + " →"}
                  outline
                  onPress={() => login(id)}
                />
              ))}
            </>
          ) : (
            <>
              <Text style={s.eyebrowDark}>
                {data.user.role.toUpperCase()} WORKSPACE
              </Text>
              <Text style={s.title}>
                {page === "Home"
                  ? `Hi, ${data.user.name.split(" ")[0]}.`
                  : page}
              </Text>
              {page === "Home" && (
                <>
                  <ImageBackground
                    source={require("./assets/training.jpg")}
                    style={s.hero}
                    imageStyle={{ opacity: 0.28 }}
                  >
                    <Text style={s.eyebrow}>SASKATOON BASKETBALL</Text>
                    <Text style={s.heroTitle}>EVOLVE YOUR{"\n"}GAME.</Text>
                    <Text style={s.heroText}>
                      A little progress, every day.
                    </Text>
                  </ImageBackground>
                  <Text style={s.subtitle}>Your players</Text>
                  {data.players.map((p) => (
                    <View key={p.id} style={s.card}>
                      <Text style={s.cardTitle}>
                        {p.name} · #{p.number}
                      </Text>
                      <Text style={s.muted}>{team(p.teamId)}</Text>
                      <Text style={s.tag}>
                        {[
                          ...new Set(
                            data.enrollments
                              .filter((e) => e.playerId === p.id)
                              .map(
                                (e) =>
                                  data.programs.find(
                                    (a) => a.id === e.programId,
                                  )?.type,
                              ),
                          ),
                        ].join(" · ") || "Explore your first program"}
                      </Text>
                    </View>
                  ))}
                  <Button
                    title="View the family calendar →"
                    onPress={() => setPage("Schedule")}
                  />
                  <Button
                    title="Switch demo account"
                    outline
                    onPress={async () => {
                      try {
                        await api("logout", {});
                      } finally {
                        setToken("");
                        setData(null);
                      }
                    }}
                  />
                </>
              )}
              {page === "Programs" && (
                <Programs data={data} act={act} busy={busy} />
              )}
              {page === "Store" && (
                <NativeCart data={data} act={act} busy={busy} />
              )}
              {page === "Updates" && (
                <>
                  <Updates data={data} act={act} />
                  <MobilePreferences data={data} act={act} busy={busy} />
                </>
              )}
              {page === "Memberships" && (
                <MobileMemberships
                  data={data}
                  api={api}
                  refresh={refresh}
                  busy={busy}
                />
              )}
              {page === "Family" && (
                <MobileFamily data={data} act={act} busy={busy} />
              )}
              {page === "Administration" && (
                <Administration
                  data={data}
                  act={act}
                  api={api}
                  busy={busy}
                  base={BASE}
                  token={token}
                  mode={mode}
                  refresh={refresh}
                />
              )}
              {page === "Reports" && (
                <>
                  <NativeStaff data={data} act={act} busy={busy} />
                  <NativeInventory data={data} act={act} busy={busy} />
                  <NativeRefundReview data={data} act={act} busy={busy} />
                  <MobileReports api={api} />
                </>
              )}
              {page === "Programs" && (
                <MobileWaitlists data={data} act={act} busy={busy} />
              )}
              {page === "Training" && (
                <>
                  <NativePlaybook data={data} act={act} busy={busy} />
                  <MobileProgress data={data} act={act} busy={busy} />
                  <MobilePlanControls data={data} act={act} busy={busy} />
                </>
              )}
              {page === "Video" && (
                <MobileVideoManagement data={data} act={act} busy={busy} />
              )}
              {page === "Family" && <MobilePayments data={data} api={api} />}
              {page === "More" && (
                <View style={s.row}>
                  {[
                    "Home",
                    "Schedule",
                    "Programs",
                    "Store",
                    "Training",
                    "Video",
                    "League",
                    "Chat",
                    "Updates",
                    ...(data.user.role === "parent" ? ["Family"] : []),
                    ...(["coach", "staff", "admin"].includes(data.user.role)
                      ? ["Administration"]
                      : []),
                    ...(canManageMemberships(data.user.role)
                      ? ["Memberships"]
                      : []),
                    ...(["staff", "admin"].includes(data.user.role)
                      ? ["Reports"]
                      : []),
                  ].map((p) => (
                    <Button
                      key={p}
                      title={p}
                      onPress={() => {
                        setPage(p);
                        setError("");
                        setMessage("");
                      }}
                    />
                  ))}
                </View>
              )}
              {page === "League" && (
                <>
                  <NativeScoring data={data} act={act} busy={busy} />
                  <NativeGameStats data={data} act={act} busy={busy} />
                  <Brackets data={data} />
                </>
              )}
              {page === "Schedule" && (
                <MobileCalendar data={data} act={act} busy={busy} />
              )}
              {page === "Updates" && <PhonePush api={api} mode={mode} />}
              {page === "Video" && (
                <MobileVideo
                  data={data}
                  base={BASE}
                  token={token}
                  act={act}
                  busy={busy}
                />
              )}
              {page === "Training" &&
                data.workouts.map((w) => {
                  const d =
                    w.drillSnapshot ||
                    data.drills.find((d) => d.id === w.drillId);
                  return (
                    <View style={s.card} key={w.id}>
                      <Text style={s.tag}>
                        {name(w.playerId)} · {d.category}
                      </Text>
                      {w.planName && (
                        <Text style={s.tag}>
                          {w.planName} · Exercise {w.exerciseNumber}/
                          {w.exerciseCount}
                          {"\n"}
                          {w.planNotes}
                        </Text>
                      )}
                      <Text style={s.cardTitle}>{d.name}</Text>
                      {d.sets != null && (
                        <Text style={s.muted}>
                          {d.sets} sets · {d.reps} reps · {d.rest}s rest
                        </Text>
                      )}
                      <Text style={s.muted}>{d.instructions}</Text>
                      <Text style={s.tag}>
                        {d.minutes} min · Due {date(w.due)}
                      </Text>
                      {w.cancelledAt ? (
                        <Text style={s.person}>
                          Cancelled · retained in history
                        </Text>
                      ) : w.completed ? (
                        <Text style={s.person}>✓ Completed</Text>
                      ) : selected === w.id ? (
                        <>
                          <Text style={s.label}>Attempts</Text>
                          <TextInput
                            style={s.input}
                            accessibilityLabel="Attempts"
                            value={attempts}
                            onChangeText={setAttempts}
                            keyboardType="number-pad"
                          />
                          <Text style={s.label}>Makes</Text>
                          <TextInput
                            style={s.input}
                            accessibilityLabel="Makes"
                            value={made}
                            onChangeText={setMade}
                            keyboardType="number-pad"
                          />
                          <Text style={s.muted}>
                            Leave both at 0 for a non-shooting workout.
                          </Text>
                          <Button
                            title="Complete & log results"
                            onPress={() =>
                              act("workout", {
                                id: w.id,
                                attempts: Number(attempts),
                                made: Number(made),
                              })
                            }
                          />
                        </>
                      ) : (
                        <Button
                          title="Log this workout →"
                          outline
                          onPress={() => {
                            setSelected(w.id);
                            setAttempts("0");
                            setMade("0");
                          }}
                        />
                      )}
                    </View>
                  );
                })}
              {page === "League" &&
                data.games
                  .filter((g) => !g.bracketId)
                  .map((g) => (
                    <View style={s.card} key={g.id}>
                      <Text style={s.tag}>{g.status.toUpperCase()}</Text>
                      <Text style={s.cardTitle}>
                        {team(g.homeId)} vs. {team(g.awayId)}
                      </Text>
                      <Text style={s.score}>
                        {g.homeScore} : {g.awayScore}
                      </Text>
                    </View>
                  ))}
              {page === "Chat" && (
                <MobileChat
                  data={data}
                  act={act}
                  base={BASE}
                  token={token}
                  busy={busy}
                />
              )}
            </>
          )}
          {busy && <ActivityIndicator color="#171d24" />}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {message && data ? <Text style={s.tag}>{message}</Text> : null}
        </ScrollView>
        {data && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={s.nav}
          >
            {["Home", "Schedule", "Chat", "More"].map((p) => (
              <Pressable
                key={p}
                accessibilityRole="button"
                accessibilityState={{ selected: page === p }}
                accessibilityLabel={
                  p === "More"
                    ? "More screens: programs, family, training and settings"
                    : p
                }
                onPress={() => {
                  setPage(p);
                  setError("");
                  setMessage("");
                }}
                style={s.navItem}
              >
                <Text
                  style={[
                    s.navText,
                    page === p && { color: "#006aab", fontWeight: "800" },
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f9fb" },
  top: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderColor: "#38b6ff",
    backgroundColor: "#fff",
  },
  brand: {
    fontSize: 11,
    fontWeight: "800",
    fontFamily: headingFont,
    letterSpacing: 1,
    color: "#171d24",
  },
  demo: { fontSize: 8, color: "#607182", marginTop: 6, letterSpacing: 1 },
  content: { padding: 22, paddingBottom: 35 },
  title: {
    fontSize: 30,
    fontWeight: "700",
    fontFamily: headingFont,
    color: "#171d24",
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: headingFont,
    color: "#171d24",
    marginVertical: 20,
  },
  muted: { fontSize: 13, color: "#607182", lineHeight: 22 },
  hero: {
    overflow: "hidden",
    borderBottomWidth: 4,
    borderBottomColor: "#38b6ff",
    backgroundColor: "#171d24",
    padding: 27,
    borderRadius: 2,
    marginBottom: 26,
  },
  heroTitle: {
    fontSize: 37,
    lineHeight: 44,
    color: "#edf5fa",
    fontWeight: "600",
    fontFamily: headingFont,
    marginVertical: 15,
  },
  heroText: { fontSize: 13, color: "#ffffff", lineHeight: 22 },
  eyebrow: { fontSize: 9, color: "#c4d9e7", letterSpacing: 2 },
  eyebrowDark: {
    fontSize: 9,
    color: "#607182",
    letterSpacing: 2,
    marginBottom: 12,
  },
  button: {
    minHeight: 48,
    backgroundColor: "#38b6ff",
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 3,
    marginVertical: 7,
    borderWidth: 1,
    borderColor: "#171d24",
  },
  outline: { backgroundColor: "transparent", borderColor: "#c4d9e7" },
  buttonText: {
    color: "#102333",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: headingFont,
    textAlign: "center",
  },
  card: {
    padding: 21,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#edf5fa",
    borderRadius: 10,
    marginBottom: 15,
  },
  cardTitle: {
    fontSize: 17,
    color: "#171d24",
    fontWeight: "600",
    fontFamily: headingFont,
    marginBottom: 9,
  },
  tag: { fontSize: 10, color: "#607182", marginVertical: 9, lineHeight: 17 },
  person: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: headingFont,
    color: "#35495b",
    marginTop: 14,
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  label: { fontSize: 12, color: "#35495b", marginVertical: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#edf5fa",
    borderRadius: 7,
    padding: 13,
    backgroundColor: "#fff",
    color: "#171d24",
  },
  nav: {
    borderTopColor: "#38b6ff",
    flexDirection: "row",
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "#edf5fa",
  },
  navItem: {
    minWidth: 80,
    minHeight: 48,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  navText: { fontSize: 14, color: "#35495b" },
  score: {
    fontSize: 40,
    textAlign: "center",
    color: "#171d24",
    marginVertical: 20,
  },
  error: {
    color: "#a14430",
    backgroundColor: "#f8e6dc",
    padding: 14,
    borderRadius: 6,
    marginVertical: 15,
  },
});
