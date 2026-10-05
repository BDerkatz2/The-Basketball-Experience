import { fail, integer, requireStaff } from "./domain.js";
export function clockSeconds(g, now = Date.now()) {
  const c = g.clock;
  return c
    ? Math.max(
        0,
        c.remainingSeconds -
          (c.runningSince
            ? Math.floor((now - Date.parse(c.runningSince)) / 1000)
            : 0),
      )
    : 600;
}
export function scorekeeper(db, u, b) {
  requireStaff(u);
  const g = db.games.find((g) => g.id === b.id);
  if (!g || !g.homeId || !g.awayId || g.status === "Bye")
    fail("Choose a game with two teams.", 409);
  if ((g.controlVersion || 0) !== b.version)
    fail("Game changed. Refresh before trying again.", 409);
  if (g.status === "Final")
    fail("Reopen the scoresheet before changing a final game.", 409);
  g.clock ??= { remainingSeconds: 600, runningSince: null, period: 1 };
  g.possession ??= null;
  g.teamFouls ??= { home: 0, away: 0 };
  g.timeoutsUsed ??= { home: 0, away: 0 };
  const c = g.clock,
    side = ["home", "away"].includes(b.side) ? b.side : null;
  if (b.command === "start") {
    if (!clockSeconds(g)) fail("Set the clock before starting.");
    if (!c.runningSince) c.runningSince = new Date().toISOString();
    g.status = "Live";
  } else if (b.command === "pause") {
    c.remainingSeconds = clockSeconds(g);
    c.runningSince = null;
  } else if (b.command === "set-clock") {
    if (c.runningSince) fail("Pause the clock first.", 409);
    c.remainingSeconds = integer(b.seconds, 0, 3600);
    c.period = integer(b.period, 1, 20);
  } else if (b.command === "possession") {
    if (!side) fail("Choose a team.");
    g.possession = side;
  } else if (["points", "foul", "timeout"].includes(b.command)) {
    if (!side) fail("Choose a team.");
    if (b.command === "points")
      g[side + "Score"] = integer(
        g[side + "Score"] + integer(b.delta, -3, 3),
        0,
        500,
      );
    else {
      const row = b.command === "foul" ? g.teamFouls : g.timeoutsUsed;
      row[side] = integer(row[side] + integer(b.delta, -1, 1), 0, 99);
    }
  } else if (b.command === "reset-fouls") {
    g.teamFouls = { home: 0, away: 0 };
  } else fail("Unknown scorekeeping control.");
  g.controlVersion = (g.controlVersion || 0) + 1;
}
