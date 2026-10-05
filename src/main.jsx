import { OnboardingRecords } from "./onboarding-records.jsx";
import {
  CartStore,
  StoreConfiguration,
  LiveScorekeeper,
} from "./quote-tools.jsx";
import { RegistrationRules, ProgramEligibility } from "./registration.jsx";
import {
  Refunds,
  TrainingProgress,
  VideoManagement,
  Moderation,
  LaunchOperations,
} from "./operations.jsx";
import { Communications } from "./communications.jsx";
import { LiveServices } from "./services.jsx";
import {
  FamilyProfiles,
  Waitlists,
  AdminReports,
} from "./family-workflows.jsx";
import { PlanLifecycle } from "./plan-lifecycle.jsx";
import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  LayoutDashboard,
  CalendarDays,
  Users,
  ShoppingBag,
  Dumbbell,
  Trophy,
  MessageCircle,
  Settings,
  ChevronRight,
  Plus,
  Check,
  MapPin,
  Clock,
  LogOut,
  X,
  Menu,
  Activity,
  CheckCircle2,
  Search,
  ArrowDownToLine,
} from "lucide-react";
import "./style.css";
import { AccountLogin } from "./accounts.jsx";
import { TrainingPlans } from "./training-plans.jsx";
import { FamilyCalendar } from "./calendar.jsx";
import { ReminderSettings, DeliveryQueue } from "./reminders.jsx";
import { Memberships } from "./memberships.jsx";
import { AccountAccess, RedeemAccountLink } from "./account-access.jsx";
import {
  LiveUpdates,
  NotificationPanel,
  ScheduleTools,
  Playoffs,
  CoachingTools,
  Management,
  StoreTools,
  StaffOnboarding,
  EnrollmentTools,
  AuditLog,
  RegistrationForms,
  Billing,
} from "./features.jsx";
import "./brand.css";
const money = (n) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
const when = (s) =>
  new Date(s).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const time = (s) =>
  new Date(s).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
const names = {
  home: "Overview",
  calendar: "Family calendar",
  programs: "Programs",
  family: "Members",
  store: "Team store",
  training: "Training hub",
  league: "League hub",
  messages: "Messages",
  admin: "Operations",
  onboarding: "Staff onboarding",
};
const icons = {
  home: LayoutDashboard,
  calendar: CalendarDays,
  programs: Activity,
  family: Users,
  store: ShoppingBag,
  training: Dumbbell,
  league: Trophy,
  messages: MessageCircle,
  admin: Settings,
  onboarding: Users,
};
async function api(path, body) {
  const r = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (sessionStorage.getItem("tbe-token") || ""),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) sessionStorage.removeItem("tbe-token");
    throw new Error(d.error || "Request failed.");
  }
  return d;
}
function Button({ children, onClick, secondary = false, ...props }) {
  return (
    <button
      className={secondary ? "btn secondary" : "btn"}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
function Badge({ children, tone = "" }) {
  return <span className={"badge " + tone}>{children}</span>;
}
function App() {
  const modalRef = useRef(null);
  const [data, setData] = useState(null),
    [page, setPage] = useState("home"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState(null),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [channel, setChannel] = useState("t1");
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ mode: "local-demo" }));
  }, []);
  const refresh = async () => {
    try {
      setData(await api("state"));
    } catch (e) {
      setError(e.message);
      if (!sessionStorage.getItem("tbe-token")) setData(null);
    }
  };
  useEffect(() => {
    if (sessionStorage.getItem("tbe-token")) refresh();
  }, []);
  // Authenticated live stream refreshes the authorized state on changes.
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    modalRef.current?.focus();
    const fn = (e) => {
      if (e.key === "Escape") setModal(null);
      if (e.key === "Tab") {
        const nodes = [
          ...(modalRef.current?.querySelectorAll(
            'button,input,select,textarea,a[href],[tabindex="0"]',
          ) || []),
        ].filter((n) => !n.disabled && n.getClientRects().length);
        const first = nodes[0],
          last = nodes.at(-1);
        if (!nodes.length) {
          e.preventDefault();
          return;
        }
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === modalRef.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", fn);
    return () => {
      document.removeEventListener("keydown", fn);
      previous?.focus();
    };
  }, [modal]);
  const login = async (userId) => {
    setBusy(true);
    setError("");
    try {
      const r = await api("demo-session", { userId });
      sessionStorage.setItem("tbe-token", r.token);
      const d = await api("state");
      setData(d);
      setChannel(d.channels[0] || "");
      setPage("home");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const act = async (action, body, success = "Saved successfully") => {
    setBusy(true);
    setError("");
    try {
      await api("actions/" + action, body);
      await refresh();
      setModal(null);
      setToast(success);
      return true;
    } catch (e) {
      setError(e.message);
      setToast(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const go = (p) => {
    setPage(p);
    setMenu(false);
    setSearch("");
    setFilter("all");
  };
  const open = (m) => {
    setError("");
    setModal(m);
  };
  if (new URLSearchParams(location.hash.slice(1)).has("account-link"))
    return <RedeemAccountLink />;
  if (!data && config?.mode === "accounts")
    return (
      <div className="login">
        <div className="login-art">
          <div className="brand">
            <img
              className="brand-logo"
              src="/brand/logo.png"
              alt="The Basketball Experience"
            />
            <span>
              THE BASKETBALL
              <br />
              EXPERIENCE
            </span>
          </div>
          <p className="eyebrow">MORE THAN A GAME</p>
          <h1>
            YOUR BASKETBALL.
            <br />
            ONE EXPERIENCE.
          </h1>
          <Court />
        </div>
        <AccountLogin
          onLogin={async (r) => {
            sessionStorage.setItem("tbe-token", r.token);
            const d = await api("state");
            setData(d);
            setChannel(d.channels[0] || "");
            setPage("home");
          }}
        />
      </div>
    );
  if (!data)
    return (
      <div className="login">
        <div className="login-art">
          <div className="brand">
            <img
              className="brand-logo"
              src="/brand/logo.png"
              alt="The Basketball Experience"
            />
            <span>
              THE BASKETBALL
              <br />
              EXPERIENCE
            </span>
          </div>
          <p className="eyebrow">MORE THAN A GAME</p>
          <h1>
            YOUR BASKETBALL.
            <br />
            ONE EXPERIENCE.
          </h1>
          <p>
            Everything your basketball journey needs.
            <br />
            Together in one place.
          </p>
          <Court />
        </div>
        <div className="login-form">
          <Badge>INTERACTIVE LOCAL DEMO</Badge>
          <h2>
            Welcome to your
            <br />
            basketball community.
          </h2>
          <p className="muted">
            Explore the experience as a parent, player, coach, or member of
            staff. All accounts and activity here are sample data.
          </p>
          <div className="accounts">
            {[
              ["parent", "JM", "Jordan Morgan", "Parent · two players"],
              ["player", "AM", "Alex Morgan", "Player · U14 Falcons"],
              ["coach", "TB", "Taylor Brooks", "Coach · skills & leagues"],
              ["staff", "CR", "Casey Rivera", "Staff · daily operations"],
              ["admin", "SC", "Sam Chen", "Administrator · full portal"],
            ].map(([id, initials, name, role]) => (
              <button disabled={busy} key={id} onClick={() => login(id)}>
                <span className="avatar">{initials}</span>
                <span>
                  <b>{name}</b>
                  <small>{role}</small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small className="muted">
            Demo sign-in • No real charges or external messages
          </small>
        </div>
      </div>
    );
  const u = data.user,
    staff = ["admin", "staff"].includes(u.role),
    coach = staff || u.role === "coach",
    parent = staff || u.role === "parent";
  const playerName = (id) =>
    data.players.find((p) => p.id === id)?.name || "Player";
  const teamName = (id) => data.teams.find((t) => t.id === id)?.name || "Team";
  const programName = (id) =>
    data.programs.find((t) => t.id === id)?.name || "Program";
  const events = data.events
    .filter(
      (e) =>
        (filter === "all" || e.playerIds.includes(filter)) &&
        e.title.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
  const visiblePlayers = data.players;
  const pending = data.workouts.filter((w) => !w.completed && !w.cancelledAt);
  const activeHubs = new Set(
    data.enrollments
      .filter((e) => e.status === "Active")
      .map((e) => data.programs.find((p) => p.id === e.programId)?.type),
  );
  const CardHead = ({ label, link, to }) => (
    <div className="card-head">
      <h3>{label}</h3>
      {link && (
        <button className="text-btn" onClick={() => go(to)}>
          {link}
          <ArrowUpRight size={16} />
        </button>
      )}
    </div>
  );
  const Event = ({ e, compact = false }) => (
    <div className={"event " + (compact ? "compact" : "")}>
      <div className="date-tile">
        <small>
          {new Date(e.start).toLocaleDateString("en", { month: "short" })}
        </small>
        <b>{new Date(e.start).getDate()}</b>
      </div>
      <div className="event-info">
        <div className="inline">
          <Badge
            tone={e.status === "Cancelled" || e.kind === "Game" ? "orange" : ""}
          >
            {e.status === "Cancelled" ? "Cancelled" : e.kind}
          </Badge>
          <small className="muted">
            {time(e.start)} · {e.minutes} min
          </small>
        </div>
        <h4>{e.title}</h4>
        <p>
          <MapPin size={13} />
          {e.location}
        </p>
        <div className="inline">
          {e.playerIds
            .filter((id) => visiblePlayers.some((p) => p.id === id))
            .map((id) => (
              <span key={id} className="player-chip">
                {playerName(id).split(" ")[0]}
              </span>
            ))}
        </div>
      </div>
      <button
        className="icon-button"
        aria-label={"View " + e.title}
        onClick={() => open({ type: "event", e })}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
  const Workout = ({ w }) => {
    const d = w.drillSnapshot || data.drills.find((d) => d.id === w.drillId);
    return (
      <div className="workout">
        <div className={"drill-icon " + (w.completed ? "complete" : "")}>
          <Dumbbell size={21} />
        </div>
        <div>
          <small className="muted">
            {playerName(w.playerId)} · {d.category}
          </small>
          <h4>{d.name}</h4>
          <p>
            {d.minutes} min · Due {when(w.due)}
          </p>
        </div>
        <button
          className="icon-button"
          aria-label={"Open " + d.name}
          onClick={() => open({ type: "workout", w, d })}
        >
          {w.completed ? (
            <CheckCircle2 size={21} />
          ) : (
            <ArrowUpRight size={20} />
          )}
        </button>
      </div>
    );
  };
  return (
    <div className="app">
      <LiveUpdates refresh={refresh} />
      <aside
        id="community-navigation"
        className={menu ? "sidebar show" : "sidebar"}
      >
        <button
          className="mobile-menu icon-button"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X />
        </button>
        <div className="brand">
          <img
            className="brand-logo"
            src="/brand/logo.png"
            alt="The Basketball Experience"
          />
          <span>
            THE BASKETBALL
            <br />
            EXPERIENCE
          </span>
        </div>
        <div className="workspace">
          <span className="avatar">
            {u.name
              .split(" ")
              .map((x) => x[0])
              .join("")}
          </span>
          <div>
            <b>
              {u.role === "parent"
                ? data.families.find((f) => f.id === u.familyId)?.name || u.name
                : u.name}
            </b>
            <small>{u.role} workspace</small>
          </div>
        </div>
        <small className="nav-label">YOUR COMMUNITY</small>
        <nav>
          {Object.entries(names)
            .filter(
              ([key]) =>
                (key !== "admin" || staff) &&
                (key !== "onboarding" || coach) &&
                (coach ||
                  key !== "training" ||
                  activeHubs.has("Skill Development")) &&
                (coach || key !== "league" || activeHubs.has("League")),
            )
            .map(([key, label]) => {
              const Icon = icons[key];
              return (
                <button
                  className={page === key ? "active" : ""}
                  key={key}
                  onClick={() => go(key)}
                >
                  <Icon size={19} />
                  {key === "calendar" && coach ? "Schedule" : label}
                  {key === "messages" && <span className="nav-dot" />}
                </button>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <div className="season">
            <span className="season-dot" /> FALL SEASON{" "}
            <b>{new Date().getFullYear()}</b>
          </div>
          <button
            className="text-btn"
            onClick={async () => {
              await api("logout", {});
              sessionStorage.removeItem("tbe-token");
              setData(null);
            }}
          >
            <LogOut size={16} />
            {data.mode === "accounts" ? "Sign out" : "Switch demo account"}
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="inline">
            <button
              className="mobile-menu icon-button"
              aria-label={menu ? "Close navigation" : "Open navigation"}
              aria-expanded={menu}
              aria-controls="community-navigation"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>The Basketball Experience</span>
            <ChevronRight size={14} />
            <b>{names[page]}</b>
          </div>
          <div className="inline">
            <span className="demo-dot" />{" "}
            <small>
              {data.mode === "accounts" ? "Community portal" : "Local demo"}
            </small>
            <span className="top-avatar">
              {u.name
                .split(" ")
                .map((x) => x[0])
                .join("")}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Date().toLocaleDateString("en-CA", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1>
                {page === "home"
                  ? `Good to see you, ${u.name.split(" ")[0]}.`
                  : names[page]}
              </h1>
              <p className="muted">
                {
                  {
                    home: "A little progress, every day. Here’s what’s happening in your community.",
                    calendar:
                      "Every practice, game, and skill session. One shared schedule.",
                    programs: "Find the next step in your player’s journey.",
                    family:
                      "The people at the heart of your basketball community.",
                    store: "Made for the court. Worn everywhere.",
                    training:
                      "Build good habits. Put in the work. See your progress.",
                    league: "Your teams, your games, your season.",
                    messages: "Stay connected, on and off the court.",
                    admin: "Keep your community moving.",
                  }[page]
                }
              </p>
            </div>
            {page === "home" ? (
              <Button onClick={() => go("programs")}>
                Explore programs <ArrowUpRight size={17} />
              </Button>
            ) : page === "calendar" && staff ? (
              <Button onClick={() => open({ type: "schedule" })}>
                <Plus size={17} />
                Create schedule
              </Button>
            ) : page === "programs" && staff ? (
              <Button onClick={() => open({ type: "program" })}>
                <Plus size={17} />
                Add program
              </Button>
            ) : page === "training" && coach ? (
              <Button onClick={() => open({ type: "assign" })}>
                <Plus size={17} />
                Assign workout
              </Button>
            ) : null}
          </div>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button className="text-btn" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {page === "home" && (
            <>
              <div className="overview-grid">
                <section className="hero">
                  <div>
                    <span className="hero-tag">
                      <span /> SASKATOON BASKETBALL
                    </span>
                    <h2>
                      EVOLVE YOUR
                      <br />
                      GAME.
                    </h2>
                    <p>
                      A new season of learning, competing,
                      <br />
                      and becoming your best.
                    </p>
                    <button onClick={() => go("training")}>
                      Let’s get to work <ArrowUpRight size={18} />
                    </button>
                  </div>
                  <Court />
                  <span className="hero-caption">THE WORK IS WORTH IT.</span>
                </section>
                <section className="card family-card">
                  <CardHead
                    label={coach ? "Your roster" : "Your players"}
                    link="View all"
                    to="family"
                  />
                  {visiblePlayers.slice(0, 2).map((p, i) => (
                    <div className="player-row" key={p.id}>
                      <span className={"player-avatar p" + i}>
                        {p.name
                          .split(" ")
                          .map((x) => x[0])
                          .join("")}
                      </span>
                      <div>
                        <h4>{p.name}</h4>
                        <p>{teamName(p.teamId)}</p>
                      </div>
                      <span className="jersey-number">{p.number}</span>
                    </div>
                  ))}
                  <div className="family-foot">
                    <span className="season-dot" /> Growing together, on and off
                    the court
                  </div>
                </section>
              </div>
              <div className="stats">
                <Stat
                  label="UPCOMING SESSIONS"
                  value={data.events.length}
                  note="On your shared calendar"
                  icon={CalendarDays}
                />
                <Stat
                  label="ACTIVE PROGRAMS"
                  value={new Set(data.enrollments.map((e) => e.programId)).size}
                  note="Room to learn. Space to grow."
                  icon={Activity}
                />
                <Stat
                  label="WORKOUTS TO GO"
                  value={pending.length}
                  note="Your next opportunity to improve"
                  icon={Dumbbell}
                />
                <Stat
                  label="YOUR COMMUNITY"
                  value={visiblePlayers.length}
                  note={
                    coach
                      ? "Players in your workspace"
                      : "Players. One connected family."
                  }
                  icon={Users}
                />
              </div>
              <div className="lower-grid">
                <section className="card">
                  <CardHead
                    label="Coming up next"
                    link="Full calendar"
                    to="calendar"
                  />
                  {events.slice(0, 3).map((e) => (
                    <Event key={e.id} e={e} compact />
                  ))}
                  {!events.length && (
                    <Empty text="Your next session will appear here." />
                  )}
                </section>
                <section className="card">
                  <CardHead
                    label="Put in the work"
                    link="Training hub"
                    to="training"
                  />
                  {pending.slice(0, 3).map((w) => (
                    <Workout key={w.id} w={w} />
                  ))}
                  {!pending.length && (
                    <Empty text="All caught up. Great work!" />
                  )}
                  <div className="tip">
                    <span>COACH’S CORNER</span>
                    <p>
                      “Consistency beats intensity. Show up, stay curious, and
                      trust your progress.”
                    </p>
                    <small>— Coach Taylor</small>
                  </div>
                </section>
              </div>
              <div className="bottom-banner">
                <div>
                  <p className="eyebrow">LOOK THE PART. FEEL THE PART.</p>
                  <h3>Your team. Your colours.</h3>
                  <p>Fresh essentials for a new season.</p>
                </div>
                <Button secondary onClick={() => go("store")}>
                  Visit the team store <ArrowRight size={16} />
                </Button>
              </div>
            </>
          )}
          {page === "calendar" && (
            <>
              <div className="toolbar">
                <div className="pills">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    All players
                  </button>
                  {visiblePlayers.map((p) => (
                    <button
                      key={p.id}
                      className={filter === p.id ? "selected" : ""}
                      onClick={() => setFilter(p.id)}
                    >
                      {p.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search sessions"
                    placeholder="Find a session…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <FamilyCalendar
                events={events}
                renderEvent={(e) => <Event key={e.id} e={e} />}
                onOpen={(e) => open({ type: "event", e })}
              />
            </>
          )}
          {page === "programs" && (
            <div className="program-grid">
              {data.programs.map((a, i) => (
                <article className="card program-card" key={a.id}>
                  <div className={"program-art art" + (i % 3)}>
                    <div className="court-small" />
                    <span>
                      {a.type === "League"
                        ? "PLAY TOGETHER."
                        : "FIND YOUR EDGE."}
                    </span>
                    <Badge>{a.type}</Badge>
                  </div>
                  <div className="program-body">
                    <div className="inline between">
                      <small className="eyebrow">AGES {a.ages}</small>
                      <small className="muted">{a.sessions} sessions</small>
                    </div>
                    <h3>{a.name}</h3>
                    <p>{a.description}</p>
                    <ProgramEligibility program={a} />
                    <p className="inline">
                      <MapPin size={15} />
                      {a.location}
                    </p>
                    <div className="program-bottom">
                      <b>
                        {money(a.price)}
                        <small> / player</small>
                      </b>
                      {parent ? (
                        <Button
                          secondary
                          onClick={() => open({ type: "enroll", a })}
                        >
                          Register <ArrowUpRight size={16} />
                        </Button>
                      ) : (
                        <Badge>Ask a parent to register</Badge>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {page === "family" && (
            <div className="program-grid">
              {visiblePlayers.map((p, i) => (
                <section className="card member-card" key={p.id}>
                  <span className={"player-avatar big p" + (i % 2)}>
                    {p.name
                      .split(" ")
                      .map((x) => x[0])
                      .join("")}
                  </span>
                  <h3>{p.name}</h3>
                  <p className="muted">
                    Age {p.age} · #{p.number} · {teamName(p.teamId)}
                  </p>
                  <hr />
                  <small className="eyebrow">ENROLLED HUBS</small>
                  <div className="hub-tags">
                    {[
                      ...new Set(
                        data.enrollments
                          .filter(
                            (e) => e.playerId === p.id && e.status === "Active",
                          )
                          .map(
                            (e) =>
                              data.programs.find((a) => a.id === e.programId)
                                ?.type,
                          ),
                      ),
                    ].map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </div>
                  <ul className="plain-list">
                    {data.enrollments
                      .filter(
                        (e) => e.playerId === p.id && e.status === "Active",
                      )
                      .map((e) => (
                        <li key={e.id}>
                          <Check size={15} />
                          {programName(e.programId)}
                        </li>
                      ))}
                  </ul>
                  <p className="muted">
                    Coach: {data.teams.find((t) => t.id === p.teamId)?.coach}
                  </p>
                  <Button
                    secondary
                    onClick={() => {
                      go("calendar");
                      setFilter(p.id);
                    }}
                  >
                    View schedule <ArrowRight size={16} />
                  </Button>
                </section>
              ))}
            </div>
          )}
          {page === "store" && (
            <>
              <div className="notice">
                <ShoppingBag size={20} />
                <div>
                  <b>A little something for your team.</b>
                  <p>
                    Players receive clothing credits with staff adjustments.
                    Link every order to a player for coach delivery.
                  </p>
                </div>
                <Badge tone="orange">Demo checkout · no charges</Badge>
              </div>
              <CartStore data={data} act={act} busy={busy} />
              <div className="program-grid">
                {data.products.map((p, i) => (
                  <article key={p.id} className="card product-card">
                    <div className={"product-art product" + i}>
                      <Shirt hoodie={i === 1} number={i === 2 ? "12" : null} />
                      {p.creditEligible && <Badge>TEE CREDITS ELIGIBLE</Badge>}
                    </div>
                    <div className="program-body">
                      <small className="eyebrow">
                        {p.category} / {p.color}
                      </small>
                      <h3>{p.name}</h3>
                      <div className="program-bottom">
                        <b>{money(p.price)}</b>
                        {parent && (
                          <Button
                            secondary
                            onClick={() =>
                              document
                                .querySelector(".operations-panel")
                                ?.scrollIntoView({ behavior: "smooth" })
                            }
                          >
                            Build cart <Plus size={16} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <section className="card space-top">
                <CardHead label={staff ? "Fulfillment queue" : "Your orders"} />
                {data.orders.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Player</th>
                          <th>Item</th>
                          <th>Size / Qty</th>
                          <th>Coach</th>
                          <th>Total</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.orders.map((o) => (
                          <tr key={o.id}>
                            <td>{playerName(o.playerId)}</td>
                            <td>
                              {
                                data.products.find((p) => p.id === o.productId)
                                  ?.name
                              }
                            </td>
                            <td>
                              {o.color || ""} {o.size} / {o.quantity}
                            </td>
                            <td>{o.coach}</td>
                            <td>
                              {money(o.total)}
                              <small className="block">
                                {o.free} credits used
                              </small>
                            </td>
                            <td>
                              {staff &&
                              !["Delivered", "Cancelled"].includes(o.status) ? (
                                <Button
                                  secondary
                                  disabled={busy}
                                  onClick={() =>
                                    act(
                                      "fulfill",
                                      { id: o.id },
                                      "Order marked delivered",
                                    )
                                  }
                                >
                                  Mark delivered
                                </Button>
                              ) : (
                                <Badge>{o.status}</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="Your first order starts here. Pick something you love." />
                )}
              </section>
            </>
          )}
          {page === "training" && (
            <>
              <div className="stats three">
                <Stat
                  label="ASSIGNED"
                  value={data.workouts.filter((w) => !w.cancelledAt).length}
                  note="Purposeful practice"
                  icon={Dumbbell}
                />
                <Stat
                  label="COMPLETED"
                  value={data.workouts.filter((w) => w.completed).length}
                  note="Every rep counts"
                  icon={CheckCircle2}
                />
                <Stat
                  label="SHOOTING ACCURACY"
                  value={
                    data.results.reduce((n, r) => n + r.attempts, 0)
                      ? Math.round(
                          (data.results.reduce((n, r) => n + r.made, 0) /
                            data.results.reduce((n, r) => n + r.attempts, 0)) *
                            100,
                        ) + "%"
                      : "—"
                  }
                  note="Based on logged attempts"
                  icon={Activity}
                />
              </div>
              <div className="lower-grid">
                <section className="card">
                  <CardHead label="Your workout plan" />
                  {data.workouts
                    .filter((w) => !w.cancelledAt)
                    .map((w) => (
                      <Workout key={w.id} w={w} />
                    ))}
                </section>
                <section className="card">
                  <CardHead label="Drill archive" />
                  {data.drills.map((d) => (
                    <div className="drill-card" key={d.id}>
                      <Badge>{d.category}</Badge>
                      <h3>{d.name}</h3>
                      <p>{d.instructions}</p>
                      <small className="muted">{d.minutes} minutes</small>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
          {page === "league" && (
            <>
              <div className="lower-grid">
                <section className="card">
                  <CardHead label="Season scoreboard" />
                  {data.games
                    .filter((g) => !g.bracketId)
                    .map((g) => (
                      <div className="score-card" key={g.id}>
                        <div className="inline between">
                          <Badge tone={g.status === "Live" ? "orange" : ""}>
                            {g.status}
                          </Badge>
                          <small className="muted">FALL LEAGUE</small>
                        </div>
                        <div className="score-line">
                          <div>
                            <span className="team-emblem">
                              {teamName(g.homeId).split(" ").at(-1)[0]}
                            </span>
                            <b>{teamName(g.homeId)}</b>
                          </div>
                          <strong>
                            {g.homeScore}
                            <span>:</span>
                            {g.awayScore}
                          </strong>
                          <div>
                            <span className="team-emblem away">
                              {teamName(g.awayId).split(" ").at(-1)[0]}
                            </span>
                            <b>{teamName(g.awayId)}</b>
                          </div>
                        </div>
                        {staff && (
                          <Button
                            secondary
                            onClick={() => open({ type: "score", g })}
                          >
                            Update score
                          </Button>
                        )}
                      </div>
                    ))}
                </section>
                <section className="card">
                  <CardHead label="League standings" />
                  <Standings data={data} />
                  <p className="table-note">
                    Standings update from games marked final.
                  </p>
                </section>
              </div>
            </>
          )}
          {page === "messages" && (
            <Communications data={data} act={act} busy={busy} />
          )}
          {page === "admin" && staff && (
            <>
              <AccountAccess data={data} />
              <div className="stats three">
                <Stat
                  label="REGISTRATION VALUE"
                  value={money(
                    data.enrollments
                      .filter((e) => e.status === "Active")
                      .reduce((n, e) => n + e.amount, 0),
                  )}
                  note="Demo values · not collected revenue"
                  icon={Activity}
                />
                <Stat
                  label="STORE ORDER VALUE"
                  value={money(
                    data.orders
                      .filter((o) => o.status !== "Cancelled")
                      .reduce((n, o) => n + o.total, 0),
                  )}
                  note="Demo orders · no payments processed"
                  icon={ShoppingBag}
                />
                <Stat
                  label="FAMILY ACCOUNTS"
                  value={data.families.length}
                  note="Active sample families"
                  icon={Users}
                />
              </div>
              <section className="card">
                <CardHead label="Family directory" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Family</th>
                        <th>Contact</th>
                        <th>Players</th>
                        <th>Membership</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.families.map((f) => (
                        <tr key={f.id}>
                          <td>
                            <b>{f.name}</b>
                          </td>
                          <td>{f.email}</td>
                          <td>
                            {data.players
                              .filter((p) => p.familyId === f.id)
                              .map((p) => p.name)
                              .join(", ")}
                          </td>
                          <td>
                            <Badge>{f.membership}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="card space-top">
                <CardHead label="Registration records" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Program</th>
                        <th>Value</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.enrollments.map((e) => (
                        <tr key={e.id}>
                          <td>{playerName(e.playerId)}</td>
                          <td>{programName(e.programId)}</td>
                          <td>{money(e.amount)}</td>
                          <td>
                            <Badge>{e.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="notice space-top">
                <Settings size={22} />
                <div>
                  <b>Local development environment</b>
                  <p>
                    Payments, cloud media, and email / push delivery are not
                    connected. Local staff documents and video uploads are
                    available. See the included scope checklist for launch work.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "home" && (
            <>
              <NotificationPanel data={data} act={act} />
              <ReminderSettings data={data} act={act} />
            </>
          )}
          {page === "calendar" && <ScheduleTools data={data} act={act} />}
          {page === "league" && (
            <>
              <LiveScorekeeper data={data} act={act} busy={busy} />
              <Playoffs data={data} act={act} />
            </>
          )}
          {page === "training" && (
            <>
              <TrainingProgress data={data} act={act} />
              <VideoManagement data={data} act={act} />
              <TrainingPlans data={data} act={act} />
              <PlanLifecycle data={data} act={act} />
              <CoachingTools data={data} act={act} />
            </>
          )}
          {page === "store" && staff && (
            <>
              <StoreConfiguration data={data} act={act} />
              <StoreTools data={data} act={act} />
            </>
          )}
          {page === "programs" && (
            <Waitlists
              data={data}
              act={act}
              onRegister={(row) =>
                open({
                  type: "enroll",
                  a: data.programs.find((p) => p.id === row.programId),
                  playerId: row.playerId,
                })
              }
            />
          )}
          {page === "family" && u.role === "parent" && (
            <>
              <FamilyProfiles data={data} act={act} />
              <OnboardingRecords data={data} act={act} />
            </>
          )}
          {page === "family" && parent && (
            <EnrollmentTools data={data} act={act} />
          )}
          {page === "onboarding" && coach && (
            <>
              <StaffOnboarding data={data} act={act} refresh={refresh} />
              <OnboardingRecords data={data} act={act} />
            </>
          )}
          {((page === "admin" && staff) || (page === "family" && parent)) && (
            <>
              <Memberships data={data} act={act} refresh={refresh} />
              <Billing data={data} />
              <Refunds data={data} act={act} refresh={refresh} />
            </>
          )}
          {page === "admin" && staff && (
            <>
              <Management data={data} act={act} />
              <AdminReports />
              <Moderation data={data} act={act} />
              {data.user.role === "admin" && (
                <LaunchOperations data={data} refresh={refresh} />
              )}
              <RegistrationRules data={data} act={act} />
              <RegistrationForms data={data} act={act} />
              <OnboardingRecords data={data} act={act} />
              <AuditLog data={data} />
              <DeliveryQueue data={data} act={act} />
              <LiveServices data={data} />
            </>
          )}
          <footer>
            <span>THE BASKETBALL EXPERIENCE</span>
            <span>Built around your community.</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={modal.type}
            ref={modalRef}
            tabIndex={-1}
          >
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            <Modal
              m={modal}
              data={data}
              act={act}
              busy={busy}
              error={error}
              coach={coach}
              parent={parent}
              playerName={playerName}
            />
          </section>
        </div>
      )}
    </div>
  );
}
function Modal({ m, data, act, busy, error, coach, parent, playerName }) {
  const [chosen, setChosen] = useState(m.playerId || data.players[0]?.id || "");
  const submit =
    (action, convert = {}) =>
    (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.currentTarget));
      Object.keys(convert).forEach((k) => (b[k] = convert[k](b[k])));
      act(action, b);
    };
  const Player = () => (
    <label>
      Player
      <select
        name="playerId"
        required
        value={chosen}
        onChange={(e) => setChosen(e.target.value)}
      >
        {data.players.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const End = ({ label = "Save" }) => (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <Button disabled={busy}>
        {busy ? "Saving…" : label}
        <ArrowRight size={16} />
      </Button>
    </>
  );
  const form = data.forms?.find((f) => f.id === m.a?.formId);
  if (m.type === "enroll")
    return (
      <>
        <p className="eyebrow">SASKATOON BASKETBALL</p>
        <h2>Register for {m.a.name}</h2>
        <p className="muted">
          {money(m.a.price)} per player · Demo registration, no charge.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const raw = Object.fromEntries(new FormData(e.currentTarget));
            const answers = Object.fromEntries(
              (form?.fields || []).map((f) => [
                f.id,
                f.type === "checkbox"
                  ? raw["answer_" + f.id] === "on"
                  : raw["answer_" + f.id] || "",
              ]),
            );
            act("enroll", {
              ...raw,
              accepted: raw.accepted === "on",
              formId: form?.id,
              answers,
            });
          }}
        >
          <input type="hidden" name="programId" value={m.a.id} />
          <Player />
          {form && (
            <>
              <h3>
                {form.title} · v{form.version}
              </h3>
              {form.fields.map((f) => (
                <label
                  key={f.id}
                  className={f.type === "checkbox" ? "checkbox" : ""}
                >
                  {f.label}
                  {f.type === "select" ? (
                    <select name={"answer_" + f.id} required={f.required}>
                      <option value="">Choose an answer</option>
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : f.type === "textarea" ? (
                    <textarea
                      name={"answer_" + f.id}
                      required={f.required}
                      maxLength={2000}
                    />
                  ) : (
                    <input
                      name={"answer_" + f.id}
                      type={f.type}
                      step={f.type === "number" ? "any" : undefined}
                      required={f.required}
                      maxLength={2000}
                    />
                  )}
                </label>
              ))}
            </>
          )}
          <div className="notice">
            <p style={{ whiteSpace: "pre-wrap" }}>
              {form?.waiverText ||
                "This is a demonstration acknowledgement. A reviewed, organization-approved waiver must replace it before launch."}
            </p>
          </div>
          <label className="checkbox">
            <input type="checkbox" name="accepted" required />
            {form
              ? "I have read and accept the registration terms above."
              : "I acknowledge this is a sample registration."}
          </label>
          <label>
            Parent / guardian signature
            <input
              name="signature"
              placeholder="Full name"
              required
              maxLength={100}
            />
          </label>
          <End label="Complete demo registration" />
        </form>
      </>
    );
  if (m.type === "order") {
    const used = data.credits
      .filter(
        (c) => c.playerId === chosen && c.year === new Date().getFullYear(),
      )
      .reduce((n, c) => n + c.quantity, 0);
    return (
      <>
        <p className="eyebrow">PLAYER-LINKED CHECKOUT</p>
        <h2>{m.p.name}</h2>
        <p className="muted">
          {money(m.p.price)} each · {m.p.color}
        </p>
        <form
          onSubmit={submit("order", {
            quantity: Number,
            useCredits: (v) => v === "on",
          })}
        >
          <input type="hidden" name="productId" value={m.p.id} />
          <Player />
          <div className="form-row">
            <label>
              Size
              <select name="size">
                {m.p.sizes.map((s) => (
                  <option disabled={m.p.stock[s] === 0} key={s} value={s}>
                    {s} ({m.p.stock[s]} left)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                name="quantity"
                min="1"
                max="10"
                defaultValue="1"
                required
              />
            </label>
          </div>
          {m.p.creditEligible && (
            <label className="checkbox">
              <input name="useCredits" type="checkbox" defaultChecked />
              Use available tee credits ({Math.max(0, 2 - used)} remaining)
            </label>
          )}
          <p className="muted">
            Your order will be linked to this player and their coach for
            delivery. No payment will be taken.
          </p>
          <End label="Place demo order" />
        </form>
      </>
    );
  }
  if (m.type === "event") {
    const e = m.e;
    return (
      <>
        <Badge>{e.kind}</Badge>
        <h2>{e.title}</h2>
        <p>
          {when(e.start)} · {time(e.start)} · {e.minutes} minutes
        </p>
        <a
          className="map-link"
          href={
            "https://www.google.com/maps/search/?api=1&query=" +
            encodeURIComponent(e.address)
          }
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={16} />
          {e.location} <ArrowUpRight size={14} />
        </a>
        <p className="muted">
          Sample location — confirm your real venue before launch.
        </p>
        {e.playerIds
          .filter((id) => data.players.some((p) => p.id === id))
          .map((id) => (
            <div className="rsvp-row" key={id}>
              <b>{playerName(id)}</b>
              <div className="inline">
                <select
                  aria-label={"RSVP for " + playerName(id)}
                  disabled={busy || e.status === "Cancelled"}
                  value={
                    data.rsvps.find(
                      (r) => r.eventId === e.id && r.playerId === id,
                    )?.status || "Unsure"
                  }
                  onChange={(ev) =>
                    act(
                      "rsvp",
                      { eventId: e.id, playerId: id, status: ev.target.value },
                      "RSVP updated",
                    )
                  }
                >
                  <option>Unsure</option>
                  <option>Going</option>
                  <option>Unavailable</option>
                </select>
                {coach && (
                  <Button
                    secondary
                    disabled={busy || e.status === "Cancelled"}
                    onClick={() =>
                      act(
                        "checkin",
                        {
                          eventId: e.id,
                          playerId: id,
                          present: !data.attendance.find(
                            (a) => a.eventId === e.id && a.playerId === id,
                          )?.present,
                        },
                        "Attendance updated",
                      )
                    }
                  >
                    {data.attendance.find(
                      (a) => a.eventId === e.id && a.playerId === id,
                    )?.present
                      ? "Undo check-in"
                      : "Check in"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        {error && <p className="error">{error}</p>}
      </>
    );
  }
  if (m.type === "workout")
    return (
      <>
        <Badge>{m.d.category}</Badge>
        <h2>{m.d.name}</h2>
        <p className="muted">
          {playerName(m.w.playerId)} · {m.d.minutes} minutes
        </p>
        <p>{m.d.instructions}</p>
        {m.d.sets != null && (
          <p className="muted">
            {m.d.sets} sets · {m.d.reps} reps · {m.d.rest}s rest
          </p>
        )}
        {m.w.planName && (
          <p>
            {m.w.planName} · Exercise {m.w.exerciseNumber}/{m.w.exerciseCount}
            <br />
            {m.w.planNotes}
          </p>
        )}
        {m.w.completed ? (
          <div className="notice">
            <CheckCircle2 />
            Workout complete. Nice work!
          </div>
        ) : (
          <form
            onSubmit={submit("workout", { attempts: Number, made: Number })}
          >
            <input name="id" type="hidden" value={m.w.id} />
            <div className="form-row">
              <label>
                Attempts
                <input
                  type="number"
                  name="attempts"
                  min="0"
                  max="10000"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                Makes
                <input
                  type="number"
                  name="made"
                  min="0"
                  max="10000"
                  defaultValue="0"
                  required
                />
              </label>
            </div>
            <small className="muted">
              For non-shooting workouts, leave both at zero.
            </small>
            <label>
              Notes
              <textarea
                name="notes"
                maxLength={500}
                placeholder="How did it feel?"
              />
            </label>
            <End label="Log & complete workout" />
          </form>
        )}
      </>
    );
  if (m.type === "assign")
    return (
      <>
        <h2>Assign a workout</h2>
        <form onSubmit={submit("assign")}>
          <Player />
          <label>
            Drill
            <select name="drillId">
              {data.drills.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Due date
            <input type="date" name="due" required />
          </label>
          <End label="Assign workout" />
        </form>
      </>
    );
  if (m.type === "score")
    return (
      <>
        <h2>Update scoresheet</h2>
        <form
          onSubmit={submit("score", {
            homeScore: Number,
            awayScore: Number,
            version: Number,
          })}
        >
          <input type="hidden" name="id" value={m.g.id} />
          <input type="hidden" name="version" value={m.g.controlVersion || 0} />
          <div className="form-row">
            <label>
              Home score
              <input
                name="homeScore"
                type="number"
                min="0"
                max="500"
                required
                defaultValue={m.g.homeScore}
              />
            </label>
            <label>
              Away score
              <input
                name="awayScore"
                type="number"
                min="0"
                max="500"
                required
                defaultValue={m.g.awayScore}
              />
            </label>
          </div>
          <label>
            Game status
            <select name="status" defaultValue={m.g.status}>
              <option>Scheduled</option>
              <option>Live</option>
              <option>Final</option>
            </select>
          </label>
          <End label="Save scoresheet" />
        </form>
      </>
    );
  if (m.type === "schedule")
    return (
      <>
        <h2>Create a team schedule</h2>
        <p className="muted">
          Weekly sessions are checked together for team and court conflicts
          before saving.
        </p>
        <form
          onSubmit={submit("schedule", {
            minutes: Number,
            count: Number,
            intervalWeeks: Number,
            excludeDates: (v) =>
              String(v || "")
                .split(/[\s,]+/)
                .filter(Boolean),
          })}
        >
          <label>
            Repeat every N weeks
            <input
              name="intervalWeeks"
              type="number"
              min="1"
              max="12"
              defaultValue="1"
              required
            />
          </label>
          <label>
            Session title
            <input
              name="title"
              required
              maxLength={100}
              placeholder="Team practice"
            />
          </label>
          <label>
            Team
            <select name="teamId">
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            First session
            <input type="datetime-local" name="start" required />
          </label>
          <label>
            Time zone
            <input
              name="timeZone"
              required
              defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            />
          </label>
          <label>
            Court / location
            <input
              name="location"
              required
              maxLength={120}
              placeholder="Fieldhouse · Court 1"
            />
          </label>
          <div className="form-row">
            <label>
              Minutes
              <input
                name="minutes"
                type="number"
                min="15"
                max="240"
                defaultValue="60"
                required
              />
            </label>
            <label>
              Weekly sessions
              <input
                name="count"
                type="number"
                min="1"
                max="20"
                defaultValue="4"
                required
              />
            </label>
          </div>
          <label>
            Skip these local dates (comma separated)
            <input name="excludeDates" placeholder="2027-01-10, 2027-01-17" />
          </label>
          <p>
            Skipped weeks are omitted, not replaced. Individual sessions can be
            moved or cancelled after saving.
          </p>
          <End label="Check conflicts & save" />
        </form>
      </>
    );
  if (m.type === "program")
    return (
      <>
        <h2>Create a program</h2>
        <form
          onSubmit={submit("program", {
            price: Number,
            capacity: Number,
            sessions: Number,
          })}
        >
          <label>
            Name
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Hub
            <select name="type">
              <option>Skill Development</option>
              <option>League</option>
            </select>
          </label>
          <label>
            Description
            <textarea name="description" required maxLength={500} />
          </label>
          <div className="form-row">
            <label>
              Ages
              <input name="ages" required maxLength={30} placeholder="12–15" />
            </label>
            <label>
              Price (CAD)
              <input type="number" name="price" min="0" max="10000" required />
            </label>
          </div>
          <div className="form-row">
            <label>
              Capacity
              <input type="number" name="capacity" min="1" max="500" required />
            </label>
            <label>
              Sessions
              <input type="number" name="sessions" min="1" max="100" required />
            </label>
          </div>
          <label>
            Location
            <input name="location" required maxLength={120} />
          </label>
          <End label="Create program" />
        </form>
      </>
    );
  return null;
}
function Stat({ label, value, note, icon: Icon }) {
  return (
    <section className="stat">
      <div className="inline between">
        <small>{label}</small>
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <p>{note}</p>
    </section>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <Activity size={24} />
      <p>{text}</p>
    </div>
  );
}
function Standings({ data }) {
  const divisions = [...new Set(data.teams.map((t) => t.division || "League"))];
  const [division, setDivision] = useState(divisions[0] || "League");
  const rows = data.teams
    .filter((t) => (t.division || "League") === division)
    .map((t) => {
      const games = data.games.filter(
        (g) =>
          !g.bracketId &&
          g.status === "Final" &&
          (g.homeId === t.id || g.awayId === t.id),
      );
      let w = 0,
        l = 0,
        pf = 0,
        pa = 0;
      for (const g of games) {
        const a = g.homeId === t.id ? g.homeScore : g.awayScore,
          b = g.homeId === t.id ? g.awayScore : g.homeScore;
        pf += a;
        pa += b;
        if (a > b) w++;
        else if (a < b) l++;
      }
      return { ...t, w, l, pf, pa };
    })
    .sort((a, b) => b.w - a.w || b.pf - b.pa - (a.pf - a.pa));
  return (
    <>
      <div className="pills feature-pad">
        {divisions.map((d) => (
          <button
            key={d}
            className={d === division ? "selected" : ""}
            onClick={() => setDivision(d)}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>+/-</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => (
              <tr key={t.id}>
                <td>
                  <span className="rank">{i + 1}</span>
                  {t.name}
                </td>
                <td>{t.w}</td>
                <td>{t.l}</td>
                <td>{t.pf - t.pa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
function Court() {
  return (
    <svg className="court" viewBox="0 0 380 360" fill="none" aria-hidden="true">
      <g
        transform="rotate(-24 190 180)"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="35" y="-55" width="280" height="440" rx="2" />
        <path d="M35 165h280" />
        <circle cx="175" cy="165" r="45" />
        <path d="M110-55V35h130v-90M110 385v-90h130v90" />
        <circle cx="175" cy="35" r="40" />
        <circle cx="175" cy="295" r="40" />
        <path d="M55-55V-5a120 120 0 0 0 240 0v-50M55 385v-50a120 120 0 0 1 240 0v50" />
      </g>
      <circle
        cx="235"
        cy="231"
        r="43"
        fill="#e6aa8b"
        stroke="#bc7a61"
        strokeWidth="1.5"
      />
      <g stroke="#a5654c" strokeWidth="1.6">
        <path d="M194 219l81 24M215 193l37 77M201 204q56 13 57 62M235 189q-25 46-27 75" />
      </g>
    </svg>
  );
}
function Shirt({ hoodie, number }) {
  return (
    <svg viewBox="0 0 240 220" aria-hidden="true">
      <path
        d={
          hoodie
            ? "M84 53Q90 3 120 8Q153 3 158 53L200 73L229 153L190 167L171 122V208H68V122L48 167L11 153L41 73Z"
            : "M86 28Q120 48 154 28L203 54L228 95L191 115L171 86V206H69V86L49 115L12 95L37 54Z"
        }
        fill="currentColor"
        stroke="rgba(0,0,0,.1)"
        strokeWidth="2"
      />
      <path
        d="M87 28Q120 71 153 28"
        fill="none"
        stroke="rgba(255,255,255,.35)"
        strokeWidth="3"
      />
      <text
        x="120"
        y={number ? 115 : 118}
        textAnchor="middle"
        fill="rgba(255,255,255,.8)"
        fontSize={number ? 44 : 30}
        fontFamily="Georgia"
        fontWeight="bold"
      >
        {number || "b."}
      </text>
      <text
        x="120"
        y="139"
        textAnchor="middle"
        fill="rgba(255,255,255,.7)"
        fontSize="6"
        letterSpacing="2"
      >
        THE BASKETBALL EXPERIENCE
      </text>
      {hoodie && (
        <path d="M88 169h64l10 23H78Z" fill="none" stroke="rgba(0,0,0,.12)" />
      )}
    </svg>
  );
}
createRoot(document.getElementById("root")).render(<App />);
