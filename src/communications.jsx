import { ReportMessage, GroupManagement } from "./operations.jsx";
import React, { useState } from "react";

export function Communications({ data, act, busy }) {
  const [attachments, setAttachments] = useState([]),
    [uploading, setUploading] = useState(false),
    [fileError, setFileError] = useState("");
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFileError("Choose a file no larger than 10 MB.");
      return;
    }
    setUploading(true);
    setFileError("");
    try {
      const query = new URLSearchParams({
        purpose: "message",
        channel: current.id,
        name: file.name,
      });
      const r = await fetch("/api/files?" + query, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
          "Content-Type": "application/octet-stream",
        },
        body: file,
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Upload failed.");
      setAttachments((a) => [...a, result]);
    } catch (e) {
      setFileError(e.message);
    } finally {
      setUploading(false);
    }
  }
  async function download(file) {
    setFileError("");
    try {
      const r = await fetch("/api/files/" + file.id, {
        headers: {
          Authorization: "Bearer " + sessionStorage.getItem("tbe-token"),
        },
      });
      if (!r.ok) throw Error("This attachment is no longer available.");
      const url = URL.createObjectURL(await r.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setFileError(e.message);
    }
  }
  const [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [kind, setKind] = useState("direct"),
    [draft, setDraft] = useState("");
  const conversations = data.conversations || [],
    current = conversations.find((c) => c.id === selected) || conversations[0];
  const messages = data.messages.filter((m) => m.channel === current?.id);
  return (
    <section className="card message-layout">
      <div className="channels">
        <h3>Conversations</h3>
        <button
          className="btn secondary"
          disabled={uploading || busy}
          onClick={() => setCreating(!creating)}
        >
          {creating ? "Close new conversation" : "New conversation"}
        </button>
        {conversations.map((c) => (
          <button
            key={c.id}
            disabled={uploading || busy}
            className={current?.id === c.id ? "selected" : ""}
            onClick={() => {
              setSelected(c.id);
              setDraft("");
              setAttachments([]);
              setFileError("");
              setCreating(false);
            }}
          >
            <span>
              {c.kind === "direct"
                ? c.members
                    .filter((m) => m.id !== data.user.id)
                    .map((m) => m.name)
                    .join(", ")
                : c.name}
            </span>
            {c.unread > 0 && <span className="badge">{c.unread} unread</span>}
          </button>
        ))}
      </div>
      <div className="conversation">
        {creating ? (
          <form
            className="feature-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await act(
                  "conversation-create",
                  {
                    kind,
                    memberIds: f.getAll("memberIds"),
                    name: f.get("name"),
                  },
                  "Conversation ready",
                )
              )
                setCreating(false);
            }}
          >
            <h3>Start a conversation</h3>
            <p className="muted">
              Choose teammates or staff. Everyone in a custom group must share
              team access or be staff. Owners can rename groups or remove
              members; create a new group to add a different audience.
            </p>
            <label>
              Conversation type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="direct">Direct message</option>
                <option value="group">Group conversation</option>
              </select>
            </label>
            {kind === "group" && (
              <label>
                Group name
                <input name="name" required maxLength={80} />
              </label>
            )}
            {kind === "direct" ? (
              <label>
                Recipient
                <select name="memberIds" required>
                  <option value="">Choose a person</option>
                  {data.contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.role}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <fieldset>
                <legend>Recipients</legend>
                {data.contacts.map((c) => (
                  <label className="checkbox" key={c.id}>
                    <input type="checkbox" name="memberIds" value={c.id} />
                    {c.name} · {c.role}
                  </label>
                ))}
              </fieldset>
            )}
            <button className="btn" disabled={busy || !data.contacts.length}>
              Create conversation
            </button>
          </form>
        ) : current ? (
          <>
            <div className="card-head">
              <div>
                <h3>
                  {current.kind === "direct"
                    ? current.members
                        .filter((m) => m.id !== data.user.id)
                        .map((m) => m.name)
                        .join(", ")
                    : current.name}
                </h3>
                <small>
                  {current.kind === "team"
                    ? "Team channel"
                    : current.members.map((m) => m.name).join(" · ")}
                </small>
              </div>
              {current.kind === "group" && (
                <button
                  className="btn secondary"
                  disabled={busy || uploading}
                  onClick={() =>
                    act(
                      "conversation-leave",
                      { channel: current.id },
                      "You left the group",
                    )
                  }
                >
                  Leave group
                </button>
              )}
            </div>
            <GroupManagement current={current} data={data} act={act} />
            <div className="message-list" aria-live="polite">
              {!messages.length && (
                <p className="muted">
                  No messages yet. Start the conversation below.
                </p>
              )}
              {messages.map((m) => (
                <div
                  className={
                    "message " + (m.authorId === data.user.id ? "mine" : "")
                  }
                  key={m.id}
                >
                  <small>
                    {m.author} · {new Date(m.createdAt).toLocaleString()}
                  </small>
                  <p>
                    {m.deleted
                      ? m.moderated
                        ? "Message removed after staff review"
                        : "Message removed by its author"
                      : m.text}
                  </p>
                  {!m.deleted && <ReportMessage message={m} act={act} />}
                  {!m.deleted &&
                    (m.attachmentIds || []).map((id) => {
                      const f = data.files.find((f) => f.id === id);
                      return f ? (
                        <button
                          key={id}
                          className="btn secondary"
                          onClick={() => download(f)}
                        >
                          Download {f.name} · {Math.ceil(f.size / 1024)} KB
                        </button>
                      ) : (
                        <small key={id}>Attachment unavailable</small>
                      );
                    })}
                  {m.authorId === data.user.id && !m.deleted && (
                    <button
                      className="btn secondary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          "message-delete",
                          { channel: current.id, messageId: m.id },
                          "Message removed",
                        )
                      }
                    >
                      Remove message
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!!current.unread && !!messages.length && (
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() =>
                  act(
                    "message-read",
                    { channel: current.id, messageId: messages.at(-1).id },
                    "Conversation marked read",
                  )
                }
              >
                Mark conversation read
              </button>
            )}
            <form
              className="composer"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await act(
                    "message",
                    {
                      channel: current.id,
                      text: draft,
                      attachmentIds: attachments.map((f) => f.id),
                    },
                    "Message saved",
                  )
                ) {
                  setDraft("");
                  setAttachments([]);
                }
              }}
            >
              <input
                aria-label="Message"
                placeholder="Write a message…"
                maxLength={2000}
                required={!attachments.length}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button
                className="btn"
                disabled={
                  busy || uploading || (!draft.trim() && !attachments.length)
                }
              >
                Send
              </button>
            </form>
            <div className="chat-attachments">
              <label>
                Attach PDF or image · up to 3 files, 10 MB each
                <input
                  aria-label="Chat attachment"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={busy || uploading || attachments.length >= 3}
                  onChange={upload}
                />
              </label>
              {uploading && <p role="status">Uploading attachment…</p>}
              {attachments.map((f) => (
                <div key={f.id}>
                  {f.name}{" "}
                  <button
                    type="button"
                    className="text-btn"
                    disabled={busy || uploading}
                    onClick={() =>
                      setAttachments((a) => a.filter((x) => x.id !== f.id))
                    }
                  >
                    Remove attachment
                  </button>
                </div>
              ))}
              {fileError && <p role="alert">{fileError}</p>}
            </div>
            <small className="message-hint">
              Messages stay inside this app. Email and device push are not
              connected.
            </small>
          </>
        ) : (
          <p className="feature-empty">
            No conversations yet. Choose New conversation to contact staff.
          </p>
        )}
      </div>
    </section>
  );
}
