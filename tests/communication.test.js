import test from "node:test";
import assert from "node:assert/strict";
import { seed } from "../server/seed.js";
import { upgrade, mutate, visible } from "../server/extended.js";
test("attachments remain private until posted and removal revokes recipient downloads", () => {
  const { db, parent, coach } = setup();
  db.files.push({
    id: "chat-file",
    purpose: "message",
    channel: "t1",
    ownerId: parent.id,
    name: "practice.pdf",
  });
  assert.equal(
    visible(db, coach).files.some((f) => f.id === "chat-file"),
    false,
  );
  mutate(db, parent, "message", {
    channel: "t1",
    text: "",
    attachmentIds: ["chat-file"],
  });
  assert.equal(
    visible(db, coach).files.some((f) => f.id === "chat-file"),
    true,
  );
  mutate(db, parent, "message-delete", {
    channel: "t1",
    messageId: db.messages.at(-1).id,
  });
  assert.equal(
    visible(db, coach).files.some((f) => f.id === "chat-file"),
    false,
  );
  assert.equal(
    visible(db, parent).files.some((f) => f.id === "chat-file"),
    true,
  );
});
const setup = () => {
  const db = upgrade(seed());
  return {
    db,
    parent: db.users.find((u) => u.id === "parent"),
    coach: db.users.find((u) => u.id === "coach"),
    admin: db.users.find((u) => u.id === "admin"),
  };
};
test("direct conversations deduplicate and remain private even from nonmember administrators", () => {
  const { db, parent, coach, admin } = setup();
  mutate(db, parent, "conversation-create", {
    kind: "direct",
    memberIds: [coach.id],
  });
  mutate(db, coach, "conversation-create", {
    kind: "direct",
    memberIds: [parent.id],
  });
  assert.equal(db.conversations.length, 1);
  const channel = db.conversations[0].id;
  mutate(db, parent, "message", {
    channel,
    text: "Private practice question",
    authorId: admin.id,
    author: "Imposter",
  });
  assert.equal(db.messages.at(-1).authorId, parent.id);
  assert.equal(
    visible(db, coach).messages.at(-1).text,
    "Private practice question",
  );
  assert.equal(
    visible(db, admin).conversations.some((c) => c.id === channel),
    false,
  );
  assert.equal(
    visible(db, admin).messages.some((m) => m.channel === channel),
    false,
  );
  assert.throws(
    () => mutate(db, admin, "message", { channel, text: "Cannot enter" }),
    /access denied/,
  );
});
test("unread state is per member, cannot move backward, and cannot expose other reads", () => {
  const { db, parent, coach } = setup();
  mutate(db, parent, "message", { channel: "t1", text: "First" });
  const first = db.messages.at(-1);
  mutate(db, parent, "message", { channel: "t1", text: "Second" });
  const last = db.messages.at(-1);
  mutate(db, coach, "message-read", { channel: "t1", messageId: last.id });
  mutate(db, coach, "message-read", { channel: "t1", messageId: first.id });
  assert.equal(
    visible(db, coach).conversations.find((c) => c.id === "t1").unread,
    0,
  );
  assert.equal(visible(db, parent).messageReads, undefined);
  assert.equal(db.messageReads[0].messageId, last.id);
  assert.throws(
    () =>
      mutate(db, coach, "message-read", { channel: "t2", messageId: last.id }),
    /not found/,
  );
});
test("contacts and group creation reject unrelated recipients; leaving revokes history access", () => {
  const { db, parent, coach, admin } = setup();
  db.users.push({
    id: "outsider",
    name: "Other family",
    role: "parent",
    familyId: "f3",
  });
  assert.equal(
    visible(db, parent).contacts.some((c) => c.id === "outsider"),
    false,
  );
  assert.throws(
    () =>
      mutate(db, parent, "conversation-create", {
        kind: "group",
        name: "Invalid",
        memberIds: ["outsider", admin.id],
      }),
    /team access/,
  );
  mutate(db, parent, "conversation-create", {
    kind: "group",
    name: "Practice planning",
    memberIds: [coach.id, admin.id],
  });
  const channel = db.conversations[0].id;
  mutate(db, parent, "message", { channel, text: "Group note" });
  mutate(db, coach, "conversation-leave", { channel });
  assert.equal(
    visible(db, coach).messages.some((m) => m.channel === channel),
    false,
  );
  assert.throws(
    () => mutate(db, coach, "message", { channel, text: "No longer member" }),
    /access denied/,
  );
});
test("message removal is author-only and leaves a tombstone without exposing text", () => {
  const { db, parent, coach } = setup();
  mutate(db, parent, "message", { channel: "t1", text: "Remove me" });
  const messageId = db.messages.at(-1).id;
  assert.throws(
    () => mutate(db, coach, "message-delete", { channel: "t1", messageId }),
    /own messages/,
  );
  mutate(db, parent, "message-delete", { channel: "t1", messageId });
  const m = visible(db, coach).messages.find((m) => m.id === messageId);
  assert.equal(m.deleted, true);
  assert.equal(m.text, "");
});
