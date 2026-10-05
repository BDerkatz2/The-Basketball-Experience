import { channels, fail, id, isStaff, text } from "./domain.js";
export function canReadMessageFile(db, u, f) {
  try {
    conversation(db, u, f.channel);
  } catch {
    return false;
  }
  return (
    f.ownerId === u.id ||
    db.messages.some(
      (m) =>
        m.channel === f.channel &&
        !m.deleted &&
        m.attachmentIds?.includes(f.id),
    )
  );
}

function canContact(db, a, b) {
  return (
    isStaff(a) ||
    isStaff(b) ||
    channels(db, a).some((t) => channels(db, b).includes(t))
  );
}
export function communicationState(db, u) {
  const teams = channels(db, u);
  const conversations = [
    ...db.teams
      .filter((t) => teams.includes(t.id))
      .map((t) => ({ id: t.id, name: t.name, kind: "team" })),
    ...db.conversations
      .filter((c) => c.memberIds.includes(u.id))
      .map((c) => ({
        ...c,
        members: c.memberIds.map((id) => {
          const v = db.users.find((x) => x.id === id);
          return { id, name: v?.name || "Former member" };
        }),
      })),
  ];
  const allowed = new Set(conversations.map((c) => c.id));
  const messages = db.messages.filter((m) => allowed.has(m.channel));
  for (const c of conversations) {
    const list = messages.filter((m) => m.channel === c.id);
    const read = db.messageReads.find(
      (r) => r.userId === u.id && r.channel === c.id,
    );
    const index = list.findIndex((m) => m.id === read?.messageId);
    c.unread = list
      .slice(index + 1)
      .filter((m) => m.authorId !== u.id && !m.deleted).length;
  }
  return {
    conversations,
    messages,
    messageReads: undefined,
    contacts: db.users
      .filter((v) => v.id !== u.id && canContact(db, u, v))
      .map(({ id, name, role }) => ({ id, name, role })),
  };
}
export function conversation(db, u, channel) {
  if (channels(db, u).includes(channel)) return { id: channel, kind: "team" };
  const c = db.conversations.find(
    (c) => c.id === channel && c.memberIds.includes(u.id),
  );
  if (!c) fail("Conversation access denied.", 403);
  return c;
}
export function communicationAction(db, u, action, b) {
  if (action === "conversation-create") {
    if (!["direct", "group"].includes(b.kind)) fail("Choose direct or group.");
    if (
      !Array.isArray(b.memberIds) ||
      b.memberIds.length < 1 ||
      b.memberIds.length > 24 ||
      new Set(b.memberIds).size !== b.memberIds.length ||
      b.memberIds.includes(u.id)
    )
      fail("Choose 1–24 different recipients.");
    if (b.kind === "direct" && b.memberIds.length !== 1)
      fail("Direct conversations have one recipient.");
    const members = [
      u,
      ...b.memberIds.map((id) => db.users.find((v) => v.id === id)),
    ];
    if (members.some((v) => !v)) fail("Recipient not found.");
    for (const a of members)
      for (const v of members)
        if (a.id !== v.id && !canContact(db, a, v))
          fail("All recipients must share team access or be staff.", 403);
    const memberIds = members.map((v) => v.id).sort();
    if (
      b.kind === "direct" &&
      db.conversations.some(
        (c) =>
          c.kind === "direct" && c.memberIds.join(":") === memberIds.join(":"),
      )
    )
      return;
    db.conversations.push({
      id: id(),
      kind: b.kind,
      name:
        b.kind === "group"
          ? text(b.name, 80)
          : members.map((v) => v.name).join(" & "),
      memberIds,
      ownerId: u.id,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  if (
    ![
      "message",
      "message-read",
      "message-delete",
      "conversation-leave",
    ].includes(action)
  )
    return false;
  const c = conversation(db, u, b.channel);
  if (action === "conversation-leave") {
    if (c.kind !== "group") fail("Only custom groups can be left.");
    c.memberIds = c.memberIds.filter((id) => id !== u.id);
    if (c.ownerId === u.id) c.ownerId = c.memberIds[0] || null;
    return;
  }
  if (action === "message") {
    const attachmentIds = b.attachmentIds ?? [];
    if (
      !Array.isArray(attachmentIds) ||
      attachmentIds.length > 3 ||
      new Set(attachmentIds).size !== attachmentIds.length
    )
      fail("Attach up to three different files.");
    for (const fileId of attachmentIds) {
      const file = db.files.find((f) => f.id === fileId);
      if (
        !file ||
        file.purpose !== "message" ||
        file.ownerId !== u.id ||
        file.channel !== c.id
      )
        fail("Attachment access denied.", 403);
    }
    db.messages.push({
      id: id(),
      channel: c.id,
      authorId: u.id,
      author: u.name,
      text: attachmentIds.length && !b.text ? "" : text(b.text, 2000),
      attachmentIds,
      createdAt: new Date().toISOString(),
    });
    return;
  }
  const m = db.messages.find((m) => m.id === b.messageId && m.channel === c.id);
  if (!m) fail("Message not found.", 404);
  if (action === "message-delete") {
    if (m.authorId !== u.id)
      fail("You can remove only your own messages.", 403);
    m.text = "";
    m.attachmentIds = [];
    m.deleted = true;
    return;
  }
  const previous = db.messageReads.find(
    (r) => r.userId === u.id && r.channel === c.id,
  );
  if (previous) {
    if (
      db.messages.findIndex((x) => x.id === previous.messageId) >
      db.messages.indexOf(m)
    )
      return;
    previous.messageId = m.id;
  } else
    db.messageReads.push({
      id: id(),
      userId: u.id,
      channel: c.id,
      messageId: m.id,
    });
}
