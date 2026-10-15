import React, { useState, useRef } from "react";
import { ContentImage, contentFor } from "./content-editor.jsx";
import { cartEstimate } from "./quote-tools.jsx";
import "./storefront.css";

const price = (n) => `CA$${Number(n).toFixed(2)}`;
export function filterProducts(products, filters, sort) {
  const result = products.filter(
    (p) =>
      !p.archivedAt &&
      (!filters.category || p.category === filters.category) &&
      (!filters.size || p.sizes.includes(filters.size)) &&
      (!filters.color || p.variants.some((v) => v.color === filters.color)) &&
      (!filters.price || p.price <= Number(filters.price)),
  );
  return result.sort((a, b) =>
    sort === "low"
      ? a.price - b.price
      : sort === "high"
        ? b.price - a.price
        : sort === "name"
          ? a.name.localeCompare(b.name)
          : 0,
  );
}

function Clothing({ product }) {
  const entry = contentFor(product.data, "product:" + product.id);
  if (entry.imageId) return <ContentImage entry={entry} />;
  const kind = /hood|sweat/i.test(product.name)
    ? "hoodie"
    : /jersey/i.test(product.name)
      ? "jersey"
      : "tee";
  return (
    <div className="sample-garment">
      <img
        src={`/store/${kind}.svg`}
        alt={`Sample ${kind} illustration for ${product.name}`}
      />
      <span>Sample design</span>
    </div>
  );
}

export function Storefront({ data, act, busy }) {
  const [selected, setSelected] = useState(null),
    [filters, setFilters] = useState({}),
    [sort, setSort] = useState("featured"),
    [lines, setLines] = useState([]),
    [variantId, setVariant] = useState(""),
    [size, setSize] = useState(""),
    [playerId, setPlayer] = useState(data.players[0]?.id || ""),
    [quantity, setQuantity] = useState(1),
    [credits, setCredits] = useState(true),
    [message, setMessage] = useState("");
  const top = useRef(null),
    cart = useRef(null);
  const products = data.products.filter((p) => !p.archivedAt),
    p = products.find((p) => p.id === selected),
    variant = p?.variants.find((v) => v.id === variantId),
    available = variant?.available?.[size] ?? 0,
    reservation = data.carts?.find(
      (c) => c.status === "Reserved" && c.ownerId === data.user.id,
    ),
    canBuy = ["parent", "admin", "staff"].includes(data.user.role),
    filtered = filterProducts(products, filters, sort);
  const open = (id) => {
    setSelected(id);
    setVariant("");
    setSize("");
    setQuantity(1);
    setMessage("");
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const filter = (key, value) => setFilters({ ...filters, [key]: value });
  const choices = (key) => [
    ...new Set(
      products.flatMap((p) =>
        key === "color"
          ? p.variants.map((v) => v.color)
          : key === "size"
            ? p.sizes
            : [p.category],
      ),
    ),
  ];
  const add = (e) => {
    e.preventDefault();
    const already = lines
      .filter(
        (l) =>
          l.productId === p.id && l.variantId === variantId && l.size === size,
      )
      .reduce((n, l) => n + l.quantity, 0);
    if (already + Number(quantity) > available) {
      setMessage(
        "Your cart already includes this stock. Reduce the quantity or choose another size.",
      );
      return;
    }
    setLines([
      ...lines,
      {
        productId: p.id,
        variantId,
        size,
        playerId,
        quantity: Number(quantity),
        useCredits: credits,
      },
    ]);
    setMessage(`${p.name} added to your cart.`);
  };
  return (
    <section className="tbe-shop" ref={top} aria-label="TBE Store">
      <header className="shop-heading">
        <h2>{contentFor(data, "store").title || "TBE Store"}</h2>
        <p>
          {contentFor(data, "store").description ||
            "Made for the court. Worn everywhere."}
        </p>
        <button
          className="shop-cart-link"
          onClick={() => cart.current?.scrollIntoView({ behavior: "smooth" })}
        >
          Shopping bag (
          {(reservation?.lines || lines).reduce((n, l) => n + l.quantity, 0)}) ↓
        </button>
      </header>
      {p ? (
        <>
          <nav className="shop-breadcrumb" aria-label="Store navigation">
            <button onClick={() => open(null)}>TBE Store</button>
            <span>/ {p.name}</span>
            <div>
              <button
                disabled={products.indexOf(p) === 0}
                onClick={() => open(products[products.indexOf(p) - 1].id)}
              >
                ‹ Prev
              </button>
              <button
                disabled={products.indexOf(p) === products.length - 1}
                onClick={() => open(products[products.indexOf(p) + 1].id)}
              >
                Next ›
              </button>
            </div>
          </nav>
          <div className="shop-detail">
            <div>
              <div className="shop-detail-image">
                <Clothing product={{ ...p, data }} />
              </div>
              <div className="shop-description">
                <h3>Built for your basketball life.</h3>
                <p>
                  {p.name} — part of our {p.category.toLowerCase()} collection.
                  Choose your color and size, and link your order to a player
                  for team delivery.
                </p>
                <p>
                  Sample illustrations are for evaluation. Final designs, sizing
                  and delivery timing will be confirmed by the club.
                </p>
              </div>
            </div>
            <div className="shop-options">
              <h3>{p.name}</h3>
              <p className="shop-price">{price(p.price)}</p>
              {canBuy ? (
                <form onSubmit={add}>
                  <label>
                    Color *
                    <select
                      required
                      value={variantId}
                      onChange={(e) => {
                        setVariant(e.target.value);
                        setSize("");
                      }}
                    >
                      {<option value="">Select a color</option>}
                      {p.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.color}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Size *
                    <select
                      required
                      disabled={!variant}
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    >
                      <option value="">Select a size</option>
                      {p.sizes.map((s) => (
                        <option
                          key={s}
                          value={s}
                          disabled={!(variant?.available?.[s] > 0)}
                        >
                          {s}
                          {variant?.available?.[s] > 0 ? "" : " — sold out"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Player *
                    <select
                      required
                      value={playerId}
                      onChange={(e) => setPlayer(e.target.value)}
                    >
                      <option value="">Select a player</option>
                      {data.players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantity
                    <input
                      type="number"
                      min="1"
                      max={Math.min(10, available) || 1}
                      required
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                    />
                  </label>
                  {p.creditEligible && (
                    <label className="shop-credit">
                      <input
                        type="checkbox"
                        checked={credits}
                        onChange={(e) => setCredits(e.target.checked)}
                      />
                      Use clothing credits (
                      {data.creditBalances?.find((c) => c.playerId === playerId)
                        ?.remaining ?? 0}{" "}
                      available)
                    </label>
                  )}
                  {size && (
                    <p className="shop-stock">
                      {available} available in this size and color
                    </p>
                  )}
                  <button
                    className="shop-primary"
                    disabled={
                      busy ||
                      !!reservation ||
                      lines.length >= 20 ||
                      !playerId ||
                      !size ||
                      !variant ||
                      available < Number(quantity)
                    }
                  >
                    Add to Cart
                  </button>
                  {!data.players.length && (
                    <p>Add a player in Members before placing an order.</p>
                  )}
                  {reservation && (
                    <p>
                      Complete or release your reserved bag before adding more
                      items.
                    </p>
                  )}
                </form>
              ) : (
                <p>A parent or staff account is needed to place orders.</p>
              )}
              <p role="status" className="shop-status">
                {message}
              </p>
              <details className="shop-policy">
                <summary>Delivery & returns</summary>
                <p>
                  Orders are linked to your player for coach delivery. Contact
                  club staff to confirm fulfillment timing and return
                  eligibility before ordering. Final policies will be supplied
                  by the club.
                </p>
              </details>
            </div>
          </div>
        </>
      ) : (
        <div className="shop-layout">
          <aside className="shop-filters" aria-label="Product filters">
            <h3>Filter by</h3>
            <details open>
              <summary>Category</summary>
              <button
                className={!filters.category ? "active" : ""}
                onClick={() => filter("category", "")}
              >
                All
              </button>
              {choices("category").map((c) => (
                <button
                  key={c}
                  className={filters.category === c ? "active" : ""}
                  onClick={() => filter("category", c)}
                >
                  {c}
                </button>
              ))}
            </details>
            <details>
              <summary>Price</summary>
              <label>
                Maximum price
                <select
                  value={filters.price || ""}
                  onChange={(e) => filter("price", e.target.value)}
                >
                  <option value="">Any price</option>
                  <option value="30">CA$30</option>
                  <option value="50">CA$50</option>
                  <option value="75">CA$75</option>
                </select>
              </label>
            </details>
            {["color", "size"].map((key) => (
              <details key={key}>
                <summary>{key === "color" ? "Color" : "Sizes"}</summary>
                <label>
                  {key === "color" ? "Color" : "Size"}
                  <select
                    value={filters[key] || ""}
                    onChange={(e) => filter(key, e.target.value)}
                  >
                    <option value="">All</option>
                    {choices(key).map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </details>
            ))}
            <button className="shop-clear" onClick={() => setFilters({})}>
              Clear filters
            </button>
          </aside>
          <div>
            <div className="shop-toolbar">
              <span aria-live="polite">{filtered.length} products</span>
              <label>
                Sort by
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="featured">Featured</option>
                  <option value="low">Price: low to high</option>
                  <option value="high">Price: high to low</option>
                  <option value="name">Name: A–Z</option>
                </select>
              </label>
            </div>
            <div className="shop-grid">
              {filtered.map((p) => (
                <article className="shop-product" key={p.id}>
                  <button
                    className="shop-image"
                    aria-label={`View ${p.name}`}
                    onClick={() => open(p.id)}
                  >
                    <Clothing product={{ ...p, data }} />
                    {p.creditEligible && (
                      <span className="shop-ribbon">Credit eligible</span>
                    )}
                  </button>
                  <h3>
                    <button onClick={() => open(p.id)}>{p.name}</button>
                  </h3>
                  <p className="shop-price">{price(p.price)}</p>
                  <button className="shop-primary" onClick={() => open(p.id)}>
                    Choose options
                  </button>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <p className="shop-empty">
                No products match these filters. Try clearing a filter.
              </p>
            )}
          </div>
        </div>
      )}
      {canBuy && (
        <section className="shop-bag" ref={cart}>
          <h3>Your shopping bag</h3>
          <p>
            Reserve your selection for 15 minutes, then confirm your order.
            Clothing credits are applied at confirmation.
          </p>
          {!(reservation?.lines || lines).length && (
            <p>Your bag is empty. Choose a product to get started.</p>
          )}
          <ul>
            {(reservation?.lines || lines).map((l, i) => (
              <li key={i}>
                <span>
                  <strong>
                    {l.name ||
                      data.products.find((p) => p.id === l.productId)?.name}
                  </strong>
                  <br />
                  {l.color ||
                    data.products
                      .find((p) => p.id === l.productId)
                      ?.variants.find((v) => v.id === l.variantId)?.color}{" "}
                  · {l.size} × {l.quantity} ·{" "}
                  {data.players.find((p) => p.id === l.playerId)?.name}
                </span>
                <span>
                  {price(
                    (l.price ??
                      data.products.find((p) => p.id === l.productId)?.price ??
                      0) * l.quantity,
                  )}
                  {!reservation && (
                    <button
                      aria-label={`Remove item ${i + 1}`}
                      onClick={() => setLines(lines.filter((_, j) => i !== j))}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {!reservation ? (
            <button
              className="shop-primary"
              disabled={busy || !lines.length}
              onClick={() => act("cart-reserve", { lines })}
            >
              Reserve bag
            </button>
          ) : (
            <>
              <p>
                Reserved until{" "}
                {new Date(reservation.expiresAt).toLocaleTimeString()} ·
                Estimated total after credits:{" "}
                <strong>{price(cartEstimate(data, reservation))}</strong>
              </p>
              <button
                className="shop-primary"
                disabled={busy}
                onClick={async () => {
                  if (await act("cart-checkout", { id: reservation.id })) {
                    setLines([]);
                    setMessage(
                      "Order confirmed. View your invoice in Members.",
                    );
                  }
                }}
              >
                Confirm order & create invoice
              </button>
              <button
                className="shop-clear"
                disabled={busy}
                onClick={() => act("cart-release", { id: reservation.id })}
              >
                Release reservation
              </button>
            </>
          )}
          <p>
            Review invoices in Members.{" "}
            {data.pilot
              ? "Pilot mode: payments are disabled; no charges are made."
              : "Payment availability is shown on your invoice."}
          </p>
        </section>
      )}
    </section>
  );
}
