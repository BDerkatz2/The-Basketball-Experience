import React, { useState } from "react";
import { View, Text, TextInput, Pressable, Linking } from "react-native";
import { checkoutDestination } from "./membership-utils.mjs";
const field = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: "#b7c9d6",
  padding: 12,
  fontSize: 16,
  marginVertical: 6,
};
function Button({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{ ...field, backgroundColor: "#e4f4ff" }}
    >
      <Text>{title}</Text>
    </Pressable>
  );
}
export function MobileProgress({ data, act, busy }) {
  const [selected, setSelected] = useState(
      data.trainingProgress?.[0]?.playerId || "",
    ),
    [note, setNote] = useState("");
  const p = data.trainingProgress?.find((p) => p.playerId === selected);
  return (
    <View>
      <Text style={{ fontSize: 22 }}>Training progress</Text>
      {data.trainingProgress?.map((p) => (
        <Button
          key={p.playerId}
          title={p.name}
          onPress={() => setSelected(p.playerId)}
        />
      ))}
      {p && (
        <>
          <Text>
            {p.completed} of {p.assigned} exercises complete · {p.overdue}{" "}
            overdue
          </Text>
          {p.weeks.map((w) => (
            <View key={w.week}>
              <Text>
                {w.week}: {w.completed} completed ·{" "}
                {w.attempts
                  ? Math.round((w.made / w.attempts) * 100) + "% shooting"
                  : "No shots logged"}
              </Text>
              <View
                accessible
                accessibilityLabel={
                  "Shooting percentage " +
                  (w.attempts ? Math.round((w.made / w.attempts) * 100) : 0)
                }
                style={{ height: 12, backgroundColor: "#dce5eb" }}
              >
                <View
                  style={{
                    height: 12,
                    width: (w.attempts ? (w.made / w.attempts) * 100 : 0) + "%",
                    backgroundColor: "#176292",
                  }}
                />
              </View>
            </View>
          ))}
          {["coach", "staff", "admin"].includes(data.user.role) && (
            <>
              <TextInput
                accessibilityLabel="Coaching feedback shared with player and family"
                style={field}
                multiline
                maxLength={2000}
                value={note}
                onChangeText={setNote}
              />
              <Button
                title="Save coaching feedback"
                disabled={busy || !note.trim()}
                onPress={async () => {
                  if (
                    await act("training-feedback", {
                      playerId: p.playerId,
                      text: note,
                    })
                  )
                    setNote("");
                }}
              />
            </>
          )}
          {data.coachingFeedback
            .filter((f) => f.playerId === p.playerId)
            .map((f) => (
              <Text key={f.id}>
                {f.author}: {f.text}
              </Text>
            ))}
        </>
      )}
    </View>
  );
}
export function MobileReportMessage({ message, act, busy }) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("");
  return open ? (
    <View>
      <Text>Send this message text and your reason to staff for review.</Text>
      <TextInput
        style={field}
        accessibilityLabel="Report reason"
        value={reason}
        onChangeText={setReason}
        maxLength={500}
      />
      <Button
        title="Submit message report"
        disabled={busy || !reason.trim()}
        onPress={async () => {
          if (await act("message-report", { messageId: message.id, reason }))
            setOpen(false);
        }}
      />
      <Button title="Cancel report" onPress={() => setOpen(false)} />
    </View>
  ) : (
    <Button title="Report message" onPress={() => setOpen(true)} />
  );
}
export function MobileVideoManagement({ data, act, busy }) {
  if (!["coach", "staff", "admin"].includes(data.user.role)) return null;
  return (
    <View>
      <Text style={{ fontSize: 22 }}>Manage clips</Text>
      {data.videos.map((v) => (
        <Clip key={v.id} v={v} act={act} busy={busy} />
      ))}
      {data.deletedVideos.map((v) => (
        <Button
          key={v.id}
          title={"Restore " + v.name}
          disabled={busy}
          onPress={() => act("video-restore", { id: v.id })}
        />
      ))}
    </View>
  );
}
function Clip({ v, act, busy }) {
  const [name, setName] = useState(v.name);
  return (
    <View>
      <TextInput
        accessibilityLabel={"Title for " + v.name}
        style={field}
        value={name}
        onChangeText={setName}
        maxLength={100}
      />
      <Button
        title="Save clip title"
        disabled={busy}
        onPress={() => act("video-edit", { id: v.id, name })}
      />
      <Button
        title="Move to deleted clips"
        disabled={busy}
        onPress={() => act("video-delete", { id: v.id })}
      />
    </View>
  );
}
export function MobilePayments({ data, api }) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <View>
      <Text style={{ fontSize: 22 }}>One-time payments</Text>
      {data.invoices
        .filter((i) => i.sourceType !== "membership")
        .map((i) => (
          <View key={i.id}>
            <Text>
              {i.description} · {(i.amountCents / 100).toFixed(2)} {i.currency}{" "}
              · {i.status}
            </Text>
            <Text>
              {i.recoveryStatus || ""}
              {i.refundedCents
                ? " · Refunded " + (i.refundedCents / 100).toFixed(2)
                : ""}
            </Text>
            {i.status === "Unpaid" && (
              <Button
                title="Open or retry test checkout"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const r = await api("billing/checkout", {
                      invoiceId: i.id,
                    });
                    await Linking.openURL(checkoutDestination(r.url));
                    setNotice(
                      "Return and refresh after checkout. Stripe confirms payment.",
                    );
                  } catch (e) {
                    setNotice(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          </View>
        ))}
      {data.refunds?.map((r) => (
        <Text key={r.id}>
          Refund {(r.amountCents / 100).toFixed(2)} {r.currency}: {r.status}
        </Text>
      ))}
      <Text accessibilityLiveRegion="polite">{notice}</Text>
      <Text>
        Staff refund approvals and submission are available in web Operations.
      </Text>
    </View>
  );
}
