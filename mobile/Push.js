import { headingFont } from "./theme";
import React, { useState } from "react";
import { View, Text, Pressable, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
export function PhonePush({ api, mode }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function register() {
    setBusy(true);
    try {
      if (mode !== "accounts") throw Error("Phone push requires account mode.");
      if (!Device.isDevice || Constants.appOwnership === "expo")
        throw Error(
          "Use a development or release build on a physical phone for push notifications.",
        );
      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ||
        Constants.easConfig?.projectId;
      if (!projectId)
        throw Error(
          "Configure this app's EAS project ID before registering a phone.",
        );
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync("default", {
          name: "Basketball updates",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      if (!(await Notifications.requestPermissionsAsync()).granted)
        throw Error(
          "Notification permission was not granted. You can enable it in phone settings.",
        );
      const token = (await Notifications.getExpoPushTokenAsync({ projectId }))
        .data;
      await api("devices/register", { token });
      setMessage(
        "Phone registered. Enable Phone push in your preferences below. Register again if you sign out or change phones.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ padding: 18, gap: 10 }}>
      <Text
        style={{ fontWeight: "700", fontFamily: headingFont, fontSize: 20 }}
      >
        Phone notifications
      </Text>
      <Text>
        One phone per account. Registering replaces the previous phone.
      </Text>
      <Pressable disabled={busy} accessibilityRole="button" onPress={register}>
        <Text style={{ color: "#171d24", padding: 10 }}>
          Register this phone
        </Text>
      </Pressable>
      <Pressable
        disabled={busy}
        accessibilityRole="button"
        onPress={async () => {
          setBusy(true);
          try {
            await api("devices/remove", {});
            setMessage("Phone registration removed.");
          } catch (e) {
            setMessage(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Text style={{ padding: 10 }}>Remove phone registration</Text>
      </Pressable>
      <Text accessibilityLiveRegion="polite">{message}</Text>
    </View>
  );
}
