import { NativeGroupTools } from "./QuoteTools";
import { headingFont } from "./theme";
import { MobileReportMessage } from "./Operations";
import React, { useState } from "react";
import {
  accountToken,
  validateAttachmentSize,
} from "./communication-utils.mjs";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import * as Picker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { fetch as nativeFetch } from "expo/fetch";
function Button({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function MobileChat({ data, act, base, token, busy, onScreenChange }) {
  const [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [group, setGroup] = useState(false),
    [members, setMembers] = useState([]),
    [name, setName] = useState(""),
    [draft, setDraft] = useState(""),
    [files, setFiles] = useState([]),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const [details, setDetails] = useState(false),
    [actions, setActions] = useState(""),
    [search, setSearch] = useState("");
  const current =
      data.conversations.find((c) => c.id === selected),
    disabled = busy || working;
  const title = (c) => c.kind === "direct"
    ? c.members.filter((m) => m.id !== data.user.id).map((m) => m.name).join(", ")
    : c.name;
  function openConversation(c) {
    setSelected(c.id);
    setDraft("");
    setFiles([]);
    setDetails(false);
    setActions("");
    onScreenChange?.();
  }
  async function run(fn) {
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setWorking(false);
    }
  }
  async function attach() {
    await run(async () => {
      const result = await Picker.getDocumentAsync({
        type: ["application/pdf", "image/png", "image/jpeg"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0],
        local = new File(asset.uri);
      try {
        validateAttachmentSize(local.size);
        const r = await nativeFetch(
          base +
            "/api/files?" +
            new URLSearchParams({
              purpose: "message",
              channel: current.id,
              name: asset.name,
            }),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/octet-stream",
            },
            body: local,
          },
        );
        const f = await r.json();
        if (!r.ok) throw Error(f.error || "Upload failed");
        setFiles((a) => [...a, f]);
      } finally {
        if (local.exists && local.uri.startsWith(Paths.cache.uri))
          local.delete();
      }
    });
  }
  async function download(f) {
    await run(async () => {
      if (!(await Sharing.isAvailableAsync()))
        throw Error("File sharing is unavailable on this device.");
      const r = await nativeFetch(base + "/api/files/" + f.id, {
        headers: { Authorization: "Bearer " + token },
      });
      if (!r.ok) throw Error("Attachment is no longer available.");
      const ext = {
        "application/pdf": "pdf",
        "image/png": "png",
        "image/jpeg": "jpg",
      }[f.type];
      if (!ext) throw Error("Unsupported attachment type.");
      const local = new File(
        Paths.cache,
        "chat-" + f.id + "-" + Date.now() + "." + ext,
      );
      try {
        local.write(new Uint8Array(await r.arrayBuffer()));
        await Sharing.shareAsync(local.uri, {
          mimeType: f.type,
          dialogTitle: "Save or share " + f.name,
        });
      } finally {
        if (local.exists) local.delete();
      }
    });
  }
  return (
    <View>
      {!current && <Button
        title={creating ? "Back to messages" : "New conversation"}
        disabled={disabled}
        onPress={() => setCreating(!creating)}
      />}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {creating ? (
        <View style={s.card}>
          <Text style={s.title}>Start a conversation</Text>
          <Button
            title={group ? "Group conversation ✓" : "Direct message ✓"}
            disabled={disabled}
            onPress={() => {
              setGroup(!group);
              setMembers([]);
            }}
          />
          {group && (
            <TextInput
              style={s.input}
              accessibilityLabel="Group name"
              placeholder="Group name"
              value={name}
              onChangeText={setName}
              maxLength={80}
            />
          )}
          <Text>
            Choose {group ? "up to 24 teammates or staff" : "one recipient"}.
          </Text>
          {data.contacts.map((c) => (
            <Button
              key={c.id}
              title={
                (members.includes(c.id) ? "✓ " : "") + c.name + " · " + c.role
              }
              disabled={disabled}
              onPress={() =>
                setMembers((a) =>
                  group
                    ? a.includes(c.id)
                      ? a.filter((x) => x !== c.id)
                      : a.length < 24
                        ? [...a, c.id]
                        : a
                    : [c.id],
                )
              }
            />
          ))}
          <Button
            title="Create conversation"
            disabled={disabled || !members.length || (group && !name.trim())}
            onPress={() =>
              run(async () => {
                if (
                  await act("conversation-create", {
                    kind: group ? "group" : "direct",
                    memberIds: members,
                    name,
                  })
                ) {
                  setCreating(false);
                  setMembers([]);
                  setName("");
                }
              })
            }
          />
        </View>
      ) : (
        <>
          {!current && <View>
            <TextInput style={s.input} accessibilityLabel="Search conversations" placeholder="Search conversations" value={search} onChangeText={setSearch} />
            {data.conversations.filter((c) => title(c).toLowerCase().includes(search.toLowerCase())).map((c) => {
              const last = data.messages.filter((m) => m.channel === c.id).at(-1);
              return <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={title(c) + (c.unread ? `, ${c.unread} unread` : "")}
                style={s.conversation}
                disabled={disabled}
                onPress={() => openConversation(c)}
              >
                <View style={s.avatar}><Text style={s.initial}>{title(c).slice(0, 1)}</Text></View>
                <View style={{ flex: 1, gap: 5 }}><Text style={s.conversationTitle} numberOfLines={1}>{title(c)}</Text><Text style={s.preview} numberOfLines={1}>{last ? last.deleted ? "Message removed" : last.text || "Attachment" : "Start the conversation"}</Text></View>
                {c.unread > 0 && <View style={s.badge}><Text style={{color: "white"}}>{c.unread}</Text></View>}
              </Pressable>;
            })}
            {data.conversations.length > 0 && !data.conversations.some((c) => title(c).toLowerCase().includes(search.toLowerCase())) && <Text style={s.preview}>No matching conversations.</Text>}
          </View>}
          {current ? (
            <>
              <View style={s.toolbar}>
                <Pressable accessibilityRole="button" style={s.quietButton} disabled={disabled} onPress={() => { setSelected(""); setDetails(false); onScreenChange?.(); }}><Text style={s.link}>‹ Inbox</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} style={s.quietButton} onPress={() => setDetails(!details)}><Text style={s.link}>{details ? "Close details" : "Details"}</Text></Pressable>
              </View>
              <Text style={s.conversationHeading}>{title(current)}</Text>
              <Text style={s.preview}>{current.kind === "group" ? `${current.members.length} members` : "Direct message"}</Text>
              {details && <View style={s.card}><NativeGroupTools
                data={data}
                act={act}
                busy={disabled}
                current={current}
              />
              {current.kind === "group" && (
                <Button
                  title="Leave group"
                  disabled={disabled}
                  onPress={() =>
                    run(async () => {
                      if (
                        await act("conversation-leave", { channel: current.id })
                      ) {
                        setFiles([]);
                        setDraft("");
                      }
                    })
                  }
                />
              )}</View>}
              {data.messages
                .filter((m) => m.channel === current.id)
                .map((m) => (
                  <View style={[s.bubble, m.authorId === data.user.id && s.mine]} key={m.id}>
                    <Text style={s.metadata}>
                      {m.author} · {new Date(m.createdAt).toLocaleString()}
                    </Text>
                    <Text style={s.messageText}>
                      {m.deleted
                        ? m.moderated
                          ? "Message removed after staff review"
                          : "Message removed by its author"
                        : m.text}
                    </Text>
                    {!m.deleted && <Pressable accessibilityRole="button" accessibilityLabel={"Options for message from " + m.author} style={s.messageOptions} onPress={() => setActions(actions === m.id ? "" : m.id)}><Text style={s.link}>···</Text></Pressable>}
                    {!m.deleted && actions === m.id && (
                      <MobileReportMessage
                        message={m}
                        act={act}
                        busy={disabled}
                      />
                    )}
                    {!m.deleted &&
                      (m.attachmentIds || []).map((id) => {
                        const f = data.files.find((f) => f.id === id);
                        return f ? (
                          <Button
                            key={id}
                            title={"Save / share " + f.name}
                            disabled={disabled}
                            onPress={() => download(f)}
                          />
                        ) : (
                          <Text key={id}>Attachment unavailable</Text>
                        );
                      })}
                  </View>
                ))}
              {current.unread > 0 && (
                <Button
                  title="Mark read"
                  disabled={disabled}
                  onPress={() =>
                    act("message-read", {
                      channel: current.id,
                      messageId: data.messages
                        .filter((m) => m.channel === current.id)
                        .at(-1)?.id,
                    })
                  }
                />
              )}
              <View style={s.composer}><TextInput
                style={s.input}
                accessibilityLabel="Message"
                placeholder="Write a message"
                multiline
                maxLength={2000}
                value={draft}
                onChangeText={setDraft}
                editable={!disabled}
              />
              {files.map((f) => (
                <Button
                  key={f.id}
                  title={"Remove " + f.name}
                  disabled={disabled}
                  onPress={() =>
                    setFiles((a) => a.filter((x) => x.id !== f.id))
                  }
                />
              ))}
              <View style={s.toolbar}><Pressable accessibilityRole="button" accessibilityLabel="Attach PDF or image, maximum 10 MB" style={s.quietButton}
                disabled={disabled || files.length >= 3}
                onPress={attach}
              ><Text style={s.link}>+ Attach</Text></Pressable>
              <Button
                title={working ? "Working…" : "Send"}
                disabled={disabled || (!draft.trim() && !files.length)}
                onPress={() =>
                  run(async () => {
                    if (
                      await act("message", {
                        channel: current.id,
                        text: draft,
                        attachmentIds: files.map((f) => f.id),
                      })
                    ) {
                      setDraft("");
                      setFiles([]);
                    }
                  })
                }
              /></View></View>
            </>
          ) : (
            !data.conversations.length && <Text style={s.preview}>No conversations yet. Start one above.</Text>
          )}
        </>
      )}
    </View>
  );
}
export function MobileRedeem({ api, initialLink = "", onDone, onCancel }) {
  const [link, setLink] = useState(initialLink),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <View style={s.card}>
      <Text style={s.title}>Invitation or password recovery</Text>
      <Text>
        Paste your administrator-issued link. Your account uses this app’s
        configured server.
      </Text>
      {done ? (
        <>
          <Text>Password saved. Sign in to continue.</Text>
          <Button title="Go to sign in" onPress={onDone} />
        </>
      ) : (
        <>
          <TextInput
            style={s.input}
            accessibilityLabel="Account link"
            placeholder="Paste account link"
            autoCapitalize="none"
            autoCorrect={false}
            value={link}
            onChangeText={setLink}
            editable={!busy}
          />
          <TextInput
            style={s.input}
            accessibilityLabel="New password"
            placeholder="New password · 12–128 characters"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            maxLength={128}
            editable={!busy}
          />
          <TextInput
            style={s.input}
            accessibilityLabel="Confirm password"
            placeholder="Confirm password"
            secureTextEntry
            autoCapitalize="none"
            value={confirm}
            onChangeText={setConfirm}
            maxLength={128}
            editable={!busy}
          />
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Button
            title={busy ? "Saving…" : "Set password"}
            disabled={busy}
            onPress={async () => {
              setError("");
              const token = accountToken(link);
              if (!token) {
                setError("Paste the complete invitation or recovery link.");
                return;
              }
              if (password.length < 12 || password !== confirm) {
                setError(
                  "Use at least 12 characters and match both passwords.",
                );
                return;
              }
              setBusy(true);
              try {
                await api("auth/redeem-link", { token, password });
                setPassword("");
                setConfirm("");
                setLink("");
                setDone(true);
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button title="Cancel" disabled={busy} onPress={onCancel} />
          <Text>
            Need a recovery link? Contact your administrator. Email recovery is
            not connected.
          </Text>
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  conversation: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: "#e3eaf0" },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#e6f3ff", alignItems: "center", justifyContent: "center" },
  initial: { color: "#0069b8", fontSize: 20, fontWeight: "700" },
  conversationTitle: { fontSize: 16, color: "#172b42", fontWeight: "700" },
  conversationHeading: { fontSize: 22, color: "#172b42", fontWeight: "700", marginVertical: 8 },
  preview: { fontSize: 14, color: "#526579", lineHeight: 21 },
  badge: { backgroundColor: "#0077cc", borderRadius: 14, minWidth: 28, padding: 5, alignItems: "center" },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  quietButton: { minHeight: 44, padding: 10, justifyContent: "center" },
  link: { color: "#0069b8", fontWeight: "600", fontSize: 15 },
  bubble: { padding: 14, backgroundColor: "#fff", borderRadius: 18, marginTop: 16, maxWidth: "94%", alignSelf: "flex-start", gap: 8 },
  mine: { backgroundColor: "#e2f1ff", alignSelf: "flex-end" },
  metadata: { fontSize: 12, color: "#526579" },
  messageText: { fontSize: 16, lineHeight: 24, color: "#172b42" },
  messageOptions: { alignSelf: "flex-end", minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  composer: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#dce5ed", paddingTop: 8 },
  card: {
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 12,
    gap: 10,
    marginVertical: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: headingFont,
    color: "#171d24",
    marginVertical: 12,
  },
  input: {
    backgroundColor: "#fff",
    padding: 14,
    borderColor: "#c4d9e7",
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 8,
  },
  button: {
    backgroundColor: "#171d24",
    padding: 13,
    borderRadius: 8,
    marginVertical: 5,
  },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#a33228", marginVertical: 8 },
});
