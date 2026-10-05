import React, { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
const box = {
    padding: 14,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#d5e0e8",
    backgroundColor: "#fff",
  },
  field = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#8194a4",
    padding: 12,
    marginVertical: 6,
    fontSize: 16,
  };
const staff = (d) => ["admin", "staff"].includes(d.user.role),
  coach = (d) => staff(d) || d.user.role === "coach";
function Btn({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ ...field, backgroundColor: disabled ? "#ddd" : "#dff2ff" }}
    >
      <Text>{title}</Text>
    </Pressable>
  );
}
function Input({ label, value, set, numeric = false }) {
  return (
    <View>
      <Text>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={field}
        value={String(value)}
        onChangeText={set}
        keyboardType={numeric ? "number-pad" : "default"}
      />
    </View>
  );
}
function Pick({ label, rows, value, set }) {
  return (
    <View>
      <Text>{label}</Text>
      {rows.map((r) => (
        <Btn
          key={r.id}
          title={(r.id === value ? "✓ " : "") + r.name}
          onPress={() => set(r.id)}
        />
      ))}
    </View>
  );
}
export function NativeCart({ data, act, busy }) {
  const [productId, setProduct] = useState(data.products[0]?.id || ""),
    [variantId, setVariant] = useState("default"),
    [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [size, setSize] = useState(data.products[0]?.sizes[0] || ""),
    [quantity, setQuantity] = useState("1"),
    [useCredits, setCredits] = useState(true),
    [lines, setLines] = useState([]);
  const p = data.products.find((p) => p.id === productId),
    v = p?.variants.find((v) => v.id === variantId) || p?.variants[0],
    c = data.carts?.find(
      (c) => c.status === "Reserved" && c.ownerId === data.user.id,
    );
  if (!["parent", "staff", "admin"].includes(data.user.role)) return null;
  return (
    <View style={box}>
      <Text style={{ fontSize: 24 }}>Team-store cart</Text>
      <Text>
        Reserve inventory for 15 minutes. Confirm to create one family invoice;
        pay through Family invoices. Credits apply at confirmation.
      </Text>
      <Pick
        label="Player"
        rows={data.players}
        value={playerId}
        set={setPlayer}
      />
      <Text>
        {data.creditBalances?.find((c) => c.playerId === playerId)?.remaining ||
          0}{" "}
        credits available this year
      </Text>
      <Pick
        label="Product"
        rows={data.products}
        value={productId}
        set={(id) => {
          setProduct(id);
          setVariant("default");
          setSize(data.products.find((p) => p.id === id).sizes[0]);
        }}
      />
      <Pick
        label="Color"
        rows={(p?.variants || []).map((v) => ({ id: v.id, name: v.color }))}
        value={v?.id}
        set={setVariant}
      />
      <Pick
        label="Size"
        rows={(p?.sizes || []).map((s) => ({
          id: s,
          name: `${s}: ${v?.available[s] || 0} available`,
        }))}
        value={size}
        set={setSize}
      />
      <Input label="Quantity" numeric value={quantity} set={setQuantity} />
      <Btn
        title={useCredits ? "Use credits: yes" : "Use credits: no"}
        onPress={() => setCredits(!useCredits)}
      />
      <Btn
        title="Add item to cart"
        disabled={busy || !!c || !p || !playerId || lines.length >= 20}
        onPress={() =>
          setLines([
            ...lines,
            {
              productId,
              variantId: v.id,
              playerId,
              size,
              quantity: Number(quantity),
              useCredits,
            },
          ])
        }
      />
      {lines.map((l, i) => (
        <View key={i}>
          <Text>
            {data.products.find((p) => p.id === l.productId)?.name} · {l.size} ×{" "}
            {l.quantity}
          </Text>
          <Btn
            title={`Remove item ${i + 1}`}
            disabled={!!c}
            onPress={() => setLines(lines.filter((_, j) => i !== j))}
          />
        </View>
      ))}
      {c ? (
        <>
          <Text>
            Reserved until {new Date(c.expiresAt).toLocaleTimeString()}
          </Text>
          {c.lines.map((l, i) => (
            <Text key={i}>
              {l.name} · {l.color} · {l.size} × {l.quantity}
            </Text>
          ))}
          <Btn
            title={`Confirm order · estimated $${cartEstimate(data, c)} CAD`}
            disabled={busy}
            onPress={async () => {
              if (await act("cart-checkout", { id: c.id })) setLines([]);
            }}
          />
          <Btn
            title="Release reservation"
            disabled={busy}
            onPress={() => act("cart-release", { id: c.id })}
          />
        </>
      ) : (
        <Btn
          title="Reserve cart for 15 minutes"
          disabled={busy || !lines.length}
          onPress={() => act("cart-reserve", { lines })}
        />
      )}
      <Text style={{ fontSize: 22 }}>Orders</Text>
      {data.orders.map((o) => (
        <View key={o.id} style={box}>
          <Text>
            {data.players.find((p) => p.id === o.playerId)?.name} ·{" "}
            {data.products.find((p) => p.id === o.productId)?.name} · {o.color}{" "}
            · {o.size} × {o.quantity}
          </Text>
          <Text>
            ${o.total} CAD · {o.paymentStatus} · {o.status}
          </Text>
          {staff(data) && !["Delivered", "Cancelled"].includes(o.status) && (
            <Btn
              title="Mark delivered"
              disabled={busy}
              onPress={() => act("fulfill", { id: o.id })}
            />
          )}
        </View>
      ))}
    </View>
  );
}
export function NativeScoring({ data, act, busy }) {
  const [id, setId] = useState(
      data.games.find((g) => g.homeId && g.awayId)?.id || "",
    ),
    [now, setNow] = useState(Date.now()),
    [seconds, setSeconds] = useState("600"),
    [period, setPeriod] = useState("1");
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const g = data.games.find((g) => g.id === id),
    name = (id) => data.teams.find((t) => t.id === id)?.name || "TBD";
  if (!g) return null;
  const left = Math.max(
      0,
      (g.clock?.remainingSeconds ?? 600) -
        (g.clock?.runningSince
          ? Math.floor((now - Date.parse(g.clock.runningSince)) / 1000)
          : 0),
    ),
    send = (command, b = {}) =>
      act("game-control", {
        id,
        version: g.controlVersion || 0,
        command,
        ...b,
      }),
    disabled = busy || g.status === "Final";
  return (
    <View style={box}>
      <Text style={{ fontSize: 24 }}>Scorekeeping</Text>
      <Pick
        label="Game"
        rows={data.games
          .filter((g) => g.homeId && g.awayId && g.status !== "Bye")
          .map((g) => ({
            id: g.id,
            name: name(g.homeId) + " vs " + name(g.awayId),
          }))}
        value={id}
        set={setId}
      />
      <Text style={{ fontSize: 28 }}>
        {g.homeScore} — {g.awayScore}
      </Text>
      <Text>
        Period {g.clock?.period || 1} · {Math.floor(left / 60)}:
        {String(left % 60).padStart(2, "0")} · {g.status}
      </Text>
      <Text>
        Possession: {g.possession ? name(g[g.possession + "Id"]) : "Unset"}
      </Text>
      {staff(data) && (
        <>
          <Btn
            title="Start clock"
            disabled={disabled}
            onPress={() => send("start")}
          />
          <Btn
            title="Pause clock"
            disabled={disabled}
            onPress={() => send("pause")}
          />
          <Input
            label="Seconds remaining"
            numeric
            value={seconds}
            set={setSeconds}
          />
          <Input label="Period" numeric value={period} set={setPeriod} />
          <Btn
            title="Set paused clock"
            disabled={disabled || !!g.clock?.runningSince}
            onPress={() =>
              send("set-clock", {
                seconds: Number(seconds),
                period: Number(period),
              })
            }
          />
          {["home", "away"].map((side) => (
            <View key={side}>
              <Text style={{ fontSize: 20 }}>{name(g[side + "Id"])}</Text>
              {[1, 2, 3, -1].map((delta) => (
                <Btn
                  key={delta}
                  title={`${delta > 0 ? "+" : ""}${delta} points`}
                  disabled={disabled}
                  onPress={() => send("points", { side, delta })}
                />
              ))}
              <Text>
                Fouls {g.teamFouls?.[side] || 0} · Timeouts{" "}
                {g.timeoutsUsed?.[side] || 0}
              </Text>
              {["foul", "timeout"].flatMap((command) =>
                [1, -1].map((delta) => (
                  <Btn
                    key={command + delta}
                    title={`${delta === 1 ? "Add" : "Undo"} ${command}`}
                    disabled={disabled}
                    onPress={() => send(command, { side, delta })}
                  />
                )),
              )}
              <Btn
                title="Set possession"
                disabled={disabled}
                onPress={() => send("possession", { side })}
              />
            </View>
          ))}
          <Btn
            title="Reset period fouls"
            disabled={disabled}
            onPress={() => send("reset-fouls")}
          />
          <Btn
            title={g.status === "Final" ? "Reopen game" : "Finalize score"}
            disabled={busy}
            onPress={() =>
              act("score", {
                id: g.id,
                version: g.controlVersion || 0,
                homeScore: g.homeScore,
                awayScore: g.awayScore,
                status: g.status === "Final" ? "Live" : "Final",
              })
            }
          />
          <Text>
            Clock follows server timestamps. Competition rules and timeout
            limits require staff judgment.
          </Text>
        </>
      )}
    </View>
  );
}
const initialFrame = [
  { x: 50, y: 80 },
  { x: 20, y: 60 },
  { x: 80, y: 60 },
  { x: 35, y: 30 },
  { x: 65, y: 30 },
];
export function NativePlaybook({ data, act, busy }) {
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(null),
    [name, setName] = useState(""),
    [notes, setNotes] = useState(""),
    [teamId, setTeam] = useState(data.channels[0] || ""),
    [frames, setFrames] = useState([initialFrame]),
    [routes, setRoutes] = useState([]),
    [frame, setFrame] = useState(0),
    [selected, setSelected] = useState(0),
    [routeKind, setRouteKind] = useState("cut");
  useEffect(() => {
    if (!playing || !editing) return;
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % frames.length),
      900,
    );
    return () => clearInterval(timer);
  }, [playing, editing, frames.length]);
  const teams = data.teams.filter((t) => data.channels.includes(t.id)),
    canEdit = coach(data),
    points = frames[frame];
  const load = (p) => {
    setPlaying(false);
    setEditing(p.id || "new");
    setName(p.name || "");
    setNotes(p.notes || "");
    setTeam(p.teamId || teams[0]?.id || "");
    setFrames(p.frames || [initialFrame]);
    setRoutes(p.routes || []);
    setFrame(0);
    setSelected(0);
  };
  const move = (key, value) =>
    setFrames(
      frames.map((f, i) =>
        i === frame
          ? f.map((p, j) =>
              j === selected ? { ...p, [key]: Number(value) } : p,
            )
          : f,
      ),
    );
  return (
    <View style={box}>
      <Text style={{ fontSize: 24 }}>Mobile playbook</Text>
      {data.plays.map((p) => (
        <View key={p.id} style={box}>
          <Text>
            {p.name} · {p.frames.length} frames ·{" "}
            {p.frames[0].length === 10 ? "With defenders" : "Offense"}
          </Text>
          <Text>{p.notes}</Text>
          <Btn
            title={canEdit ? "Open / edit play" : "View play"}
            onPress={() => load(p)}
          />
        </View>
      ))}
      {canEdit && <Btn title="Create play" onPress={() => load({})} />}{" "}
      {editing && (
        <>
          <Input label="Play name" value={name} set={setName} />
          <Input label="Coaching notes" value={notes} set={setNotes} />
          <Pick label="Team" rows={teams} value={teamId} set={setTeam} />
          <View
            accessibilityLabel="Half-court player positions"
            style={{
              height: 280,
              backgroundColor: "#f3dcbb",
              borderWidth: 2,
              margin: 10,
              position: "relative",
            }}
          >
            {points.map((p, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={`${i < 5 ? "Player" : "Defender"} ${(i % 5) + 1}, X ${p.x}, Y ${p.y}`}
                onPress={() => setSelected(i)}
                style={{
                  position: "absolute",
                  left: `${Math.min(90, p.x)}%`,
                  top: `${Math.min(84, p.y)}%`,
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: i < 5 ? "#17669a" : "#ad382e",
                  borderWidth: selected === i ? 3 : 0,
                  borderColor: "#111",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "white" }}>
                  {i < 5 ? i + 1 : "D" + (i - 4)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Btn
            title={playing ? "Pause playback" : "Play frames"}
            onPress={() => setPlaying(!playing)}
          />
          <Pick
            label="Frame"
            rows={frames.map((_, i) => ({ id: i, name: `Frame ${i + 1}` }))}
            value={frame}
            set={setFrame}
          />
          <Text>
            Selected {selected < 5 ? "player" : "defender"} {(selected % 5) + 1}
          </Text>
          {canEdit && (
            <>
              <Input
                label="X position 0–100"
                numeric
                value={points[selected].x}
                set={(v) => move("x", v)}
              />
              <Input
                label="Y position 0–100"
                numeric
                value={points[selected].y}
                set={(v) => move("y", v)}
              />
              <Btn
                title="Add five defenders"
                disabled={frames[0].length === 10}
                onPress={() =>
                  setFrames(
                    frames.map((f) => [
                      ...f,
                      ...initialFrame.map((p) => ({ ...p, y: p.y - 10 })),
                    ]),
                  )
                }
              />
              <Btn
                title="Duplicate as next frame"
                disabled={frames.length >= 20}
                onPress={() => {
                  setFrames([...frames, points.map((p) => ({ ...p }))]);
                  setFrame(frames.length);
                }}
              />
              <Pick
                label="Route type"
                rows={["cut", "dribble", "pass"].map((id) => ({
                  id,
                  name: id,
                }))}
                value={routeKind}
                set={setRouteKind}
              />
              <Btn
                title="Route selected player to next frame"
                disabled={frame === frames.length - 1 || routes.length >= 200}
                onPress={() =>
                  setRoutes([
                    ...routes,
                    {
                      frame,
                      player: selected,
                      kind: routeKind,
                      ...frames[frame + 1][selected],
                    },
                  ])
                }
              />
              <Btn
                title="Clear this frame's routes"
                onPress={() =>
                  setRoutes(routes.filter((r) => r.frame !== frame))
                }
              />
            </>
          )}
          {routes
            .filter((r) => r.frame === frame)
            .map((r, i) => (
              <Text key={i}>
                {r.kind}: {r.player < 5 ? "Player" : "Defender"}{" "}
                {(r.player % 5) + 1} → ({r.x}, {r.y})
              </Text>
            ))}
          {canEdit && (
            <Btn
              title="Save play"
              disabled={busy}
              onPress={async () => {
                if (
                  await act("play-save", {
                    ...(editing === "new" ? {} : { id: editing }),
                    name,
                    notes,
                    teamId,
                    frames,
                    routes,
                  })
                )
                  setEditing(null);
              }}
            />
          )}
          <Btn title="Close play" onPress={() => setEditing(null)} />
        </>
      )}
    </View>
  );
}
export function NativeStaff({ data, act, busy }) {
  const [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [quantity, setQuantity] = useState("1"),
    [reason, setReason] = useState(""),
    [year, setYear] = useState(String(new Date().getFullYear()));
  if (!staff(data)) return null;
  return (
    <View style={box}>
      <Text style={{ fontSize: 24 }}>Staff operations</Text>
      <Text>Clothing-credit adjustment</Text>
      <Pick
        label="Player"
        rows={data.players}
        value={playerId}
        set={setPlayer}
      />
      <Input label="Year" numeric value={year} set={setYear} />
      <Input
        label="Credit adjustment (negative removes unused credits)"
        value={quantity}
        set={setQuantity}
      />
      <Input label="Adjustment reason" value={reason} set={setReason} />
      <Btn
        title="Record credit adjustment"
        disabled={busy}
        onPress={() =>
          act("credit-adjust", {
            playerId,
            year: Number(year),
            quantity: Number(quantity),
            reason,
          })
        }
      />
      <Text style={{ fontSize: 22 }}>Message reports</Text>
      {data.messageReports
        .filter((r) => r.status === "open")
        .map((r) => (
          <NativeReport key={r.id} r={r} act={act} busy={busy} />
        ))}
      <Text>
        Refund provider submission, cloud cleanup, and deployment controls
        remain in the web administrator workspace.
      </Text>
    </View>
  );
}
function NativeReport({ r, act, busy }) {
  const [note, setNote] = useState("");
  return (
    <View style={box}>
      <Text>Reported: {r.reason}</Text>
      <Text>{r.evidence}</Text>
      <Input label="Review note" value={note} set={setNote} />
      {["dismissed", "removed"].map((status) => (
        <Btn
          key={status}
          title={
            status === "removed" ? "Remove reported message" : "Dismiss report"
          }
          disabled={busy}
          onPress={() => act("message-review", { id: r.id, status, note })}
        />
      ))}
    </View>
  );
}

export function NativeInventory({ data, act, busy }) {
  const [productId, setProduct] = useState(data.products[0]?.id || ""),
    [variantId, setVariant] = useState("default"),
    [size, setSize] = useState(data.products[0]?.sizes[0] || ""),
    [quantity, setQuantity] = useState("1"),
    [color, setColor] = useState("");
  if (!staff(data)) return null;
  const p = data.products.find((p) => p.id === productId),
    v = p?.variants.find((v) => v.id === variantId) || p?.variants[0];
  return (
    <View style={box}>
      <Text style={{ fontSize: 22 }}>Inventory</Text>
      <Pick
        label="Product"
        rows={data.products}
        value={productId}
        set={(id) => {
          setProduct(id);
          setVariant("default");
          setSize(data.products.find((p) => p.id === id).sizes[0]);
        }}
      />
      <Pick
        label="Color to restock"
        rows={(p?.variants || []).map((v) => ({ id: v.id, name: v.color }))}
        value={v?.id}
        set={setVariant}
      />
      <Pick
        label="Size"
        rows={(p?.sizes || []).map((s) => ({
          id: s,
          name: `${s} · ${v?.stock[s]} on hand / ${v?.available[s]} available`,
        }))}
        value={size}
        set={setSize}
      />
      <Input
        label="Stock quantity"
        numeric
        value={quantity}
        set={setQuantity}
      />
      <Btn
        title="Restock this variant"
        disabled={busy || !p}
        onPress={() =>
          act("restock", {
            id: productId,
            variantId: v.id,
            size,
            quantity: Number(quantity),
          })
        }
      />
      <Input label="New color name" value={color} set={setColor} />
      <Btn
        title="Create color with this stock per size"
        disabled={busy || !p}
        onPress={() =>
          act("variant-save", { productId, color, stock: Number(quantity) })
        }
      />
      {data.carts
        .filter((c) => c.status === "Ordered")
        .map((c) => (
          <Btn
            key={c.id}
            title={"Cancel whole unpaid cart " + c.id.slice(0, 8)}
            disabled={busy}
            onPress={() => act("cart-cancel", { id: c.id })}
          />
        ))}
    </View>
  );
}
export function NativeRefundReview({ data, act, busy }) {
  const [invoiceId, setInvoice] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  if (!staff(data)) return null;
  const rows = data.invoices
    .filter(
      (i) =>
        i.status.startsWith("Paid") &&
        i.paymentIntent &&
        i.sourceType !== "membership",
    )
    .map((i) => ({
      id: i.id,
      name: i.description + " · $" + (i.amountCents / 100).toFixed(2),
    }));
  return (
    <View style={box}>
      <Text style={{ fontSize: 22 }}>Refund review</Text>
      <Pick
        label="Paid invoice"
        rows={rows}
        value={invoiceId}
        set={setInvoice}
      />
      <Input label="Refund amount in CAD" value={amount} set={setAmount} />
      <Input label="Refund reason" value={reason} set={setReason} />
      <Btn
        title="Request refund review"
        disabled={busy || !invoiceId}
        onPress={() =>
          act("refund-request", {
            invoiceId,
            amountCents: Math.round(Number(amount) * 100),
            reason,
          })
        }
      />
      {data.refunds.map((r) => (
        <View key={r.id}>
          <Text>
            ${(r.amountCents / 100).toFixed(2)} · {r.status} · {r.reason}
          </Text>
          {data.user.role === "admin" &&
            r.status === "requested" &&
            ["approved", "rejected"].map((status) => (
              <Btn
                key={status}
                title={
                  status === "approved" ? "Approve refund" : "Reject refund"
                }
                disabled={busy}
                onPress={() => act("refund-review", { id: r.id, status })}
              />
            ))}
        </View>
      ))}
      <Text>
        Approved refunds must be explicitly submitted from the web administrator
        workspace.
      </Text>
    </View>
  );
}
export function NativeGroupTools({ data, act, busy, current }) {
  const [name, setName] = useState("");
  if (current?.kind !== "group") return null;
  const owner = current.ownerId === data.user.id;
  return (
    <View style={box}>
      <Text>Group members</Text>
      {current.members?.map((m) => (
        <View key={m.id}>
          <Text>
            {m.name}
            {m.id === current.ownerId ? " · Owner" : ""}
          </Text>
          {owner && m.id !== data.user.id && (
            <Btn
              title={"Remove " + m.name}
              disabled={busy}
              onPress={() =>
                act("group-remove", { channel: current.id, userId: m.id })
              }
            />
          )}
        </View>
      ))}
      {owner && (
        <>
          <Input label="New group name" value={name} set={setName} />
          <Btn
            title="Rename group"
            disabled={busy}
            onPress={() => act("group-rename", { channel: current.id, name })}
          />
        </>
      )}
    </View>
  );
}

function cartEstimate(data, cart) {
  const balances = Object.fromEntries(
    (data.creditBalances || []).map((c) => [c.playerId, c.remaining]),
  );
  let total = 0;
  for (const l of cart?.lines || []) {
    const free =
      l.useCredits && l.creditEligible
        ? Math.min(l.quantity, balances[l.playerId] || 0)
        : 0;
    balances[l.playerId] = (balances[l.playerId] || 0) - free;
    total += (l.quantity - free) * l.price;
  }
  return total.toFixed(2);
}

export function NativeGameStats({ data, act, busy }) {
  const [gameId, setGame] = useState(
      data.games.find((g) => g.homeId && g.awayId)?.id || "",
    ),
    [playerId, setPlayer] = useState(""),
    [stats, setStats] = useState({
      points: "0",
      rebounds: "0",
      assists: "0",
      steals: "0",
      blocks: "0",
      fouls: "0",
    });
  if (!staff(data)) return null;
  const g = data.games.find((g) => g.id === gameId),
    players = data.players.filter((p) =>
      [g?.homeId, g?.awayId].includes(p.teamId),
    ),
    name = (id) => data.teams.find((t) => t.id === id)?.name || "TBD";
  return (
    <View style={box}>
      <Text style={{ fontSize: 22 }}>Individual game statistics</Text>
      <Text>
        These totals are independent of the team score. Saving replaces this
        player's stat line.
      </Text>
      <Pick
        label="Game for statistics"
        rows={data.games
          .filter((g) => g.homeId && g.awayId)
          .map((g) => ({
            id: g.id,
            name: name(g.homeId) + " vs " + name(g.awayId),
          }))}
        value={gameId}
        set={(id) => {
          setGame(id);
          setPlayer("");
          setStats({
            points: "0",
            rebounds: "0",
            assists: "0",
            steals: "0",
            blocks: "0",
            fouls: "0",
          });
        }}
      />
      <Pick
        label="Player for statistics"
        rows={players}
        value={playerId}
        set={(id) => {
          setPlayer(id);
          const old = data.gameStats.find(
            (s) => s.gameId === gameId && s.playerId === id,
          );
          setStats(
            Object.fromEntries(
              Object.keys(stats).map((k) => [k, String(old?.[k] || 0)]),
            ),
          );
        }}
      />
      {Object.entries(stats).map(([k, v]) => (
        <Input
          key={k}
          label={k}
          numeric
          value={v}
          set={(value) => setStats({ ...stats, [k]: value })}
        />
      ))}
      <Btn
        title="Save player statistics"
        disabled={busy || !playerId}
        onPress={() =>
          act("game-stats", {
            gameId,
            playerId,
            ...Object.fromEntries(
              Object.entries(stats).map(([k, v]) => [k, Number(v)]),
            ),
          })
        }
      />
    </View>
  );
}
