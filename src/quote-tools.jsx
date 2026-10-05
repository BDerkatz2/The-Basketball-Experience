import React, { useState, useEffect } from "react";
const staff = (d) => ["admin", "staff"].includes(d.user.role);
const Button = ({ children, ...props }) => (
  <button type="button" className="btn secondary" {...props}>
    {children}
  </button>
);
export function CartStore({ data, act, busy }) {
  const [lines, setLines] = useState([]),
    [productId, setProduct] = useState(
      data.products.find((p) => !p.archivedAt)?.id || "",
    ),
    [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [variantId, setVariant] = useState("default"),
    [size, setSize] = useState(
      data.products.find((p) => !p.archivedAt)?.sizes[0] || "",
    ),
    [quantity, setQuantity] = useState(1),
    [credits, setCredits] = useState(true);
  const p = data.products.find((p) => p.id === productId && !p.archivedAt),
    v = p?.variants.find((v) => v.id === variantId) || p?.variants[0],
    c = data.carts?.find(
      (c) => c.status === "Reserved" && c.ownerId === data.user.id,
    );
  if (!["parent", "admin", "staff"].includes(data.user.role)) return null;
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Build your team-store cart</h3>
      <p>
        Reserve sizes and colors for 15 minutes, then create one family invoice.
        Credits are applied when you confirm the order. Pay unpaid invoices from
        Members.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setLines([
            ...lines,
            {
              productId,
              playerId,
              variantId: v.id,
              size,
              quantity: Number(quantity),
              useCredits: credits,
            },
          ]);
        }}
      >
        <label>
          Player
          <select value={playerId} onChange={(e) => setPlayer(e.target.value)}>
            {data.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          {data.creditBalances?.find((c) => c.playerId === playerId)
            ?.remaining ?? 0}{" "}
          clothing credits available this year
        </p>
        <label>
          Product
          <select
            value={productId}
            onChange={(e) => {
              setProduct(e.target.value);
              setSize(
                data.products.find((p) => p.id === e.target.value).sizes[0],
              );
              setVariant("default");
            }}
          >
            {data.products
              .filter((p) => !p.archivedAt)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · ${p.price} CAD
                </option>
              ))}
          </select>
        </label>
        <label>
          Color
          <select value={v?.id} onChange={(e) => setVariant(e.target.value)}>
            {p?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.color}
              </option>
            ))}
          </select>
        </label>
        <label>
          Size
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {p?.sizes.map((s) => (
              <option key={s} value={s}>
                {s} · {v?.available[s] ?? 0} available
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            type="number"
            min="1"
            max="10"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={credits}
            onChange={(e) => setCredits(e.target.checked)}
          />
          Use eligible clothing credits
        </label>
        <button
          className="btn"
          disabled={busy || !!c || lines.length >= 20 || !p || !playerId}
        >
          Add to cart
        </button>
      </form>
      <ul>
        {lines.map((l, i) => (
          <li key={i}>
            {data.players.find((p) => p.id === l.playerId)?.name} ·{" "}
            {data.products.find((p) => p.id === l.productId)?.name} ·{" "}
            {
              data.products
                .find((p) => p.id === l.productId)
                ?.variants.find((v) => v.id === l.variantId)?.color
            }{" "}
            · {l.size} × {l.quantity}{" "}
            <Button
              disabled={!!c}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              Remove item {i + 1}
            </Button>
          </li>
        ))}
      </ul>
      {!c ? (
        <Button
          disabled={busy || !lines.length}
          onClick={() => act("cart-reserve", { lines })}
        >
          Reserve cart for 15 minutes
        </Button>
      ) : (
        <>
          <p>
            Reserved until {new Date(c.expiresAt).toLocaleTimeString()} ·{" "}
            {c.lines.length} lines. Your reservation is saved across refreshes.
          </p>
          <ul>
            {c.lines.map((l, i) => (
              <li key={i}>
                {l.name} · {l.color} · {l.size} × {l.quantity} · ${l.price} each
              </li>
            ))}
          </ul>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await act("cart-checkout", { id: c.id })) setLines([]);
            }}
          >
            Confirm order and create invoice · estimated $
            {cartEstimate(data, c)} CAD
          </Button>{" "}
          <Button
            disabled={busy}
            onClick={() => act("cart-release", { id: c.id })}
          >
            Release reservation
          </Button>
        </>
      )}
      {data.carts
        ?.filter((c) => c.status === "Ordered")
        .slice(-3)
        .map((c) => (
          <p key={c.id}>
            Cart {c.id.slice(0, 8)} ordered · invoice {c.invoiceId.slice(0, 8)}{" "}
            · {data.invoices.find((i) => i.id === c.invoiceId)?.status}
          </p>
        ))}
    </section>
  );
}
export function StoreConfiguration({ data, act }) {
  if (!staff(data)) return null;
  const submit =
    (action, convert = []) =>
    async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(e.currentTarget));
      convert.forEach((k) => (b[k] = Number(b[k])));
      await act(action, b);
    };
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Colors and clothing credits</h3>
      <form onSubmit={submit("variant-save", ["stock"])}>
        <label>
          Product
          <select name="productId">
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          New color
          <input name="color" required maxLength="40" />
        </label>
        <label>
          Opening stock per size
          <input
            name="stock"
            type="number"
            min="0"
            max="10000"
            defaultValue="0"
            required
          />
        </label>
        <button className="btn">Add color variant</button>
      </form>
      <form onSubmit={submit("credit-adjust", ["year", "quantity"])}>
        <label>
          Player
          <select name="playerId">
            {data.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Credit year
          <input
            name="year"
            type="number"
            min="2020"
            max="2100"
            defaultValue={new Date().getFullYear()}
            required
          />
        </label>
        <label>
          Credit adjustment (positive to grant, negative to remove unused
          credits)
          <input
            name="quantity"
            type="number"
            min="-100"
            max="100"
            defaultValue="1"
            required
          />
        </label>
        <label>
          Reason
          <input name="reason" required maxLength="300" />
        </label>
        <button className="btn">Record credit adjustment</button>
      </form>
      <h4>Unpaid cart cancellation</h4>
      {data.carts
        ?.filter((c) => c.status === "Ordered")
        .map((c) => (
          <p key={c.id}>
            Cart {c.id.slice(0, 8)}{" "}
            <Button onClick={() => act("cart-cancel", { id: c.id })}>
              Cancel entire unpaid cart
            </Button>
          </p>
        ))}
      <h4>Variant inventory</h4>
      {data.products.flatMap((p) =>
        p.variants.map((v) => (
          <form key={p.id + v.id} onSubmit={submit("restock", ["quantity"])}>
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="variantId" value={v.id} />
            <b>
              {p.name} · {v.color}
            </b>
            <label>
              Restock size
              <select name="size">
                {p.sizes.map((s) => (
                  <option key={s} value={s}>
                    {s} · {v.stock[s]} on hand / {v.available[s]} available
                  </option>
                ))}
              </select>
            </label>
            <label>
              Add quantity
              <input
                name="quantity"
                type="number"
                min="1"
                max="10000"
                defaultValue="1"
                required
              />
            </label>
            <button className="btn">Restock color</button>
          </form>
        )),
      )}
    </section>
  );
}
export function LiveScorekeeper({ data, act, busy }) {
  const [tick, setTick] = useState(Date.now()),
    [id, setId] = useState(
      data.games.find((g) => g.homeId && g.awayId)?.id || "",
    ),
    [seconds, setSeconds] = useState("600"),
    [period, setPeriod] = useState("1");
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const g = data.games.find((g) => g.id === id);
  if (!g) return null;
  const remain = Math.max(
      0,
      (g.clock?.remainingSeconds ?? 600) -
        (g.clock?.runningSince
          ? Math.floor((tick - Date.parse(g.clock.runningSince)) / 1000)
          : 0),
    ),
    control = (command, extra = {}) =>
      act("game-control", {
        id: g.id,
        version: g.controlVersion || 0,
        command,
        ...extra,
      }),
    name = (id) => data.teams.find((t) => t.id === id)?.name || "TBD",
    disabled = busy || g.status === "Final";
  return (
    <section className="card feature-pad space-top operations-panel">
      <h3>Live scorekeeping</h3>
      <label>
        Game
        <select value={id} onChange={(e) => setId(e.target.value)}>
          {data.games
            .filter((g) => g.homeId && g.awayId && g.status !== "Bye")
            .map((g) => (
              <option key={g.id} value={g.id}>
                {name(g.homeId)} vs {name(g.awayId)}
              </option>
            ))}
        </select>
      </label>
      <h2>
        {g.homeScore} — {g.awayScore}
      </h2>
      <p>
        Period {g.clock?.period || 1} · {Math.floor(remain / 60)}:
        {String(remain % 60).padStart(2, "0")} · {g.status}
      </p>
      <p>Possession: {g.possession ? name(g[g.possession + "Id"]) : "Unset"}</p>
      {staff(data) && (
        <>
          <Button disabled={disabled} onClick={() => control("start")}>
            Start clock
          </Button>{" "}
          <Button disabled={disabled} onClick={() => control("pause")}>
            Pause clock
          </Button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              control("set-clock", {
                seconds: Number(seconds),
                period: Number(period),
              });
            }}
          >
            <label>
              Clock seconds
              <input
                type="number"
                min="0"
                max="3600"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
            <label>
              Period (overtime may use additional periods)
              <input
                type="number"
                min="1"
                max="20"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </label>
            <button
              className="btn"
              disabled={disabled || !!g.clock?.runningSince}
            >
              Set paused clock
            </button>
          </form>
          {["home", "away"].map((side) => (
            <div key={side}>
              <h4>{name(g[side + "Id"])}</h4>
              {[1, 2, 3, -1].map((delta) => (
                <Button
                  key={delta}
                  disabled={disabled}
                  onClick={() => control("points", { side, delta })}
                >
                  {delta > 0 ? "+" : ""}
                  {delta} points
                </Button>
              ))}
              <p>
                Team fouls {g.teamFouls?.[side] || 0} · Timeouts used{" "}
                {g.timeoutsUsed?.[side] || 0}
              </p>
              <Button
                disabled={disabled}
                onClick={() => control("foul", { side, delta: 1 })}
              >
                Add foul
              </Button>{" "}
              <Button
                disabled={disabled}
                onClick={() => control("foul", { side, delta: -1 })}
              >
                Undo foul
              </Button>{" "}
              <Button
                disabled={disabled}
                onClick={() => control("timeout", { side, delta: 1 })}
              >
                Add timeout
              </Button>{" "}
              <Button
                disabled={disabled}
                onClick={() => control("timeout", { side, delta: -1 })}
              >
                Undo timeout
              </Button>{" "}
              <Button
                disabled={disabled}
                onClick={() => control("possession", { side })}
              >
                Set possession
              </Button>
            </div>
          ))}
          <Button disabled={disabled} onClick={() => control("reset-fouls")}>
            Reset period team fouls
          </Button>
          <p>
            Finalize or reopen games using the scoresheet. Competition-specific
            foul and timeout limits remain staff decisions. Clock follows server
            timestamps; this is not a certified scoreboard timer.
          </p>
        </>
      )}
    </section>
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
