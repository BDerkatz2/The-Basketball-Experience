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
export function MobileChat({ data, act, base, token, busy }) {
  const [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [group, setGroup] = useState(false),
    [members, setMembers] = useState([]),
    [name, setName] = useState(""),
    [draft, setDraft] = useState(""),
    [files, setFiles] = useState([]),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const current =
      data.conversations.find((c) => c.id === selected) ||
      data.conversations[0],
    disabled = busy || working;
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
      <Button
        title={creating ? "Back to messages" : "New conversation"}
        disabled={disabled}
        onPress={() => setCreating(!creating)}
      />
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
          <View>
            {data.conversations.map((c) => (
              <Button
                key={c.id}
                title={
                  (current?.id === c.id ? "✓ " : "") +
                  (c.kind === "direct"
                    ? c.members
                        .filter((m) => m.id !== data.user.id)
                        .map((m) => m.name)
                        .join(", ")
                    : c.name) +
                  (c.unread ? " · " + c.unread + " unread" : "")
                }
                disabled={disabled}
                onPress={() => {
                  setSelected(c.id);
                  setDraft("");
                  setFiles([]);
                }}
              />
            ))}
          </View>
          {current ? (
            <>
              <Text style={s.title}>{current.name}</Text>
              <NativeGroupTools
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
              )}
              {data.messages
                .filter((m) => m.channel === current.id)
                .map((m) => (
                  <View style={s.card} key={m.id}>
                    <Text>
                      {m.author} · {new Date(m.createdAt).toLocaleString()}
                    </Text>
                    <Text>
                      {m.deleted
                        ? m.moderated
                          ? "Message removed after staff review"
                          : "Message removed by its author"
                        : m.text}
                    </Text>
                    {!m.deleted && (
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
                        .at(-1).id,
                    })
                  }
                />
              )}
              <TextInput
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
              <Button
                title="Attach PDF or image · 10 MB maximum"
                disabled={disabled || files.length >= 3}
                onPress={attach}
              />
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
              />
            </>
          ) : (
            <Text>No conversations yet. Start one above.</Text>
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
