import React, { useState, useEffect } from "react";
export const contentFor = (data, id) =>
  data.siteContent?.find((c) => c.id === id) || {};
export function ContentImage({ entry, className = "" }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl;
    setUrl("");
    if (entry?.imageId)
      fetch("/api/files/" + encodeURIComponent(entry.imageId), {
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
        },
      })
        .then(async (r) => {
          if (!r.ok) throw Error();
          objectUrl = URL.createObjectURL(await r.blob());
          if (active) setUrl(objectUrl);
          else URL.revokeObjectURL(objectUrl);
        })
        .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [entry?.imageId]);
  return url ? (
    <img
      src={url}
      alt={entry.alt || ""}
      className={"content-photo " + className}
    />
  ) : null;
}
const targets = [
  ["home", "Overview"],
  ["hero", "Homepage hero"],
  ["calendar", "Calendar"],
  ["programs", "Programs"],
  ["family", "Members"],
  ["store", "Store"],
  ["training", "Training"],
  ["league", "League"],
  ["messages", "Messages"],
  ["admin", "Operations"],
  ["onboarding", "Staff onboarding"],
];
export function ContentEditor({ data, act, refresh }) {
  const [target, setTarget] = useState("home");
  if (data.user.role !== "admin") return null;
  const entry = contentFor(data, target);
  return (
    <section className="card feature-pad space-top">
      <h3>Website content editor</h3>
      <p>
        Update page headings, introductions, banner photos and product photos.
        Changes publish to the signed-in web portal for all users. Navigation,
        layouts, login branding and native app screens are not changed.
      </p>
      <label>
        Edit location
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {targets.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          {data.products.map((p) => (
            <option key={p.id} value={"product:" + p.id}>
              Product photo: {p.name}
            </option>
          ))}
        </select>
      </label>
      <EditorForm
        key={target + ":" + (entry.version || 0)}
        entry={entry}
        target={target}
        act={act}
        refresh={refresh}
      />
    </section>
  );
}
function EditorForm({ entry, target, act, refresh }) {
  const [title, setTitle] = useState(entry.title || ""),
    [description, setDescription] = useState(entry.description || ""),
    [imageId, setImage] = useState(entry.imageId || null),
    [alt, setAlt] = useState(entry.alt || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const product = target.startsWith("product:");
  const draft = { title, description, imageId, alt };
  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a PNG or JPEG image, 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        "/api/files?purpose=content&name=" + encodeURIComponent(file.name),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
          },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setImage(result.id);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  async function save(reset = false) {
    setBusy(true);
    try {
      await act("content-publish", {
        id: target,
        version: entry.version || 0,
        ...draft,
        reset,
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="feature-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!product && (
        <>
          <label>
            Heading
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="Leave blank to use the original heading"
            />
          </label>
          <label>
            Introduction
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="Leave blank to use the original introduction"
            />
          </label>
        </>
      )}
      <label>
        Upload photo (PNG or JPEG, up to 5 MB)
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy}
          onChange={upload}
        />
      </label>
      {imageId && (
        <>
          <label>
            Photo description for accessibility
            <input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              maxLength={180}
              required
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setImage(null);
              setAlt("");
            }}
          >
            Remove photo from draft
          </button>
        </>
      )}
      <div className="card feature-pad">
        <h4>Draft preview</h4>
        <ContentImage entry={draft} />
        <h3>{title || "Original heading"}</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>
          {description ||
            (product
              ? "Product information stays unchanged."
              : "Original introduction")}
        </p>
      </div>
      <p>
        Publishing replaces this location only. Reset restores original
        text/artwork. Uploaded files are private until published to signed-in
        users; removing a photo keeps its stored file for records. This editor
        uses plain text.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="btn" disabled={busy}>
        {busy ? "Saving…" : "Publish changes"}
      </button>
      <button
        type="button"
        className="btn secondary"
        disabled={busy}
        onClick={() => save(true)}
      >
        Reset to original content
      </button>
    </form>
  );
}
