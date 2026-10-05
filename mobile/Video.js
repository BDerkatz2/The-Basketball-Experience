import { headingFont } from "./theme";
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  PermissionsAndroid,
  Platform,
} from "react-native";
import * as Picker from "expo-image-picker";
import { File, Paths, Directory } from "expo-file-system";
import { fetch as nativeFetch } from "expo/fetch";
import { useVideoPlayer, VideoView } from "expo-video";

function Button({ title, onPress, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled: !!disabled }}
      style={[s.button, disabled && { opacity: 0.4 }]}
    >
      <Text style={{ color: "white" }}>{title}</Text>
    </Pressable>
  );
}
export function MobileVideo({ data, base, token, act, busy }) {
  const coach = ["coach", "staff", "admin"].includes(data.user.role);
  const teams = data.teams.filter((t) => data.channels.includes(t.id));
  const [teamId, setTeam] = useState(teams[0]?.id || ""),
    [name, setName] = useState(""),
    [asset, setAsset] = useState(null),
    [uploaded, setUploaded] = useState(null),
    [selected, setSelected] = useState(null),
    [working, setWorking] = useState(false),
    [error, setError] = useState("");
  const controller = useRef(null),
    restored = useRef(false);
  const [stage, setStage] = useState(""),
    [ready, setReady] = useState(false),
    [key, setKey] = useState("");
  const draftDir = new Directory(
    Paths.document,
    "video-drafts",
    encodeURIComponent(base + "|" + data.user.id),
  );
  const draftFile = new File(draftDir, "draft.json");
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (draftFile.exists) {
          const draft = JSON.parse(await draftFile.text());
          if (active && draft.asset && new File(draft.asset.uri).exists) {
            setAsset(draft.asset);
            setName(draft.name || "");
            setTeam(draft.teamId);
            setUploaded(draft.uploaded || null);
            setKey(draft.key);
            setStage(
              "Recovered an unfinished upload. Review the title and retry when connected.",
            );
          }
        }
      } catch {
        if (active)
          setError(
            "The saved draft could not be recovered. Choose your clip again.",
          );
      } finally {
        restored.current = true;
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!restored.current || !asset || !key) return;
    try {
      draftDir.create({ intermediates: true, idempotent: true });
      draftFile.write(JSON.stringify({ asset, name, teamId, uploaded, key }));
    } catch {
      setError(
        "Could not save a recovery draft. Check available phone storage.",
      );
    }
  }, [asset, name, teamId, uploaded, key]);
  function discard() {
    try {
      if (draftFile.exists) draftFile.delete();
      if (
        asset &&
        asset.uri.startsWith(draftDir.uri) &&
        new File(asset.uri).exists
      )
        new File(asset.uri).delete();
    } catch {
      setError("Could not remove the local draft.");
    }
    setAsset(null);
    setUploaded(null);
    setKey("");
    setStage("");
  }
  async function run(fn) {
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e.name === "AbortError"
          ? "Upload paused or timed out. Your draft is kept; retry when connected."
          : e.message,
      );
    } finally {
      setWorking(false);
    }
  }
  async function choose(camera) {
    if (!ready) return;
    await run(async () => {
      if (camera && !(await Picker.requestCameraPermissionsAsync()).granted)
        throw Error(
          "Camera access is required to record a clip. You can also choose an existing video.",
        );
      if (
        camera &&
        Platform.OS === "android" &&
        (await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        )) !== PermissionsAndroid.RESULTS.GRANTED
      )
        throw Error("Microphone permission is required for video recording.");
      if (
        !camera &&
        Platform.OS === "ios" &&
        !(await Picker.requestMediaLibraryPermissionsAsync()).granted
      )
        throw Error("Allow access to the video you want to upload.");
      const result = await (
        camera ? Picker.launchCameraAsync : Picker.launchImageLibraryAsync
      )({
        mediaTypes: ["videos"],
        videoMaxDuration: 120,
        videoQuality: Picker.UIImagePickerControllerQualityType.Medium,
      });
      if (!result.canceled) {
        const picked = result.assets[0];
        if (new File(picked.uri).size > 100 * 1024 * 1024)
          throw Error("Choose a clip smaller than 100 MB.");
        draftDir.create({ intermediates: true, idempotent: true });
        const nextKey =
          Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
        const local = new File(draftDir, nextKey + ".mp4");
        new File(picked.uri).copy(local);
        setKey(nextKey);
        setAsset({
          uri: local.uri,
          fileName: picked.fileName || "recording.mp4",
        });
        setUploaded(null);
        setStage("Draft saved on this phone. Ready to upload.");
      }
    });
  }
  async function save() {
    if (!ready) return;
    await run(async () => {
      if (!asset || !name.trim() || !teamId)
        throw Error("Choose a team, clip and title.");
      let file = uploaded;
      if (!file) {
        setStage("Uploading clip… Keep this screen open.");
        controller.current = new AbortController();
        const timeout = setTimeout(() => controller.current?.abort(), 120000);
        let response;
        try {
          response = await nativeFetch(
            base +
              "/api/files?" +
              new URLSearchParams({
                purpose: "video",
                teamId,
                name: (asset.fileName || "recording.mp4").slice(0, 160),
              }),
            {
              method: "POST",
              headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/octet-stream",
                "X-Upload-Key": key,
              },
              body: new File(asset.uri),
              signal: controller.current.signal,
            },
          );
        } finally {
          clearTimeout(timeout);
          controller.current = null;
        }
        file = await response.json();
        if (!response.ok) throw Error(file.error || "Upload failed.");
        setUploaded(file);
      }
      setStage("Upload complete. Saving team clip…");
      if (
        await act("video-save", { name: name.trim(), teamId, fileId: file.id })
      ) {
        discard();
        setName("");
        setStage("Clip shared with the team.");
      } else {
        setStage(
          "The clip could not be confirmed. Retry to finish sharing; duplicate clips are prevented.",
        );
      }
    });
  }
  const video = data.videos.find((v) => v.id === selected);
  return (
    <View>
      <Text style={s.heading}>Team video room</Text>
      <Text>
        Record a short clip, share it with your team, and review key moments.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {coach && (
        <View style={s.card}>
          <Text style={s.heading}>Add a clip</Text>
          {teams.map((t) => (
            <Button
              key={t.id}
              disabled={working || !!asset || !ready}
              title={(teamId === t.id ? "✓ " : "") + t.name}
              onPress={() => setTeam(t.id)}
            />
          ))}
          <TextInput
            accessibilityLabel="Video title"
            placeholder="Video title"
            maxLength={100}
            value={name}
            onChangeText={setName}
            style={s.input}
          />
          <Button
            title="Record video · up to 2 minutes"
            onPress={() => choose(true)}
            disabled={working || busy || !!asset || !ready}
          />
          <Button
            title="Choose video from phone"
            onPress={() => choose(false)}
            disabled={working || busy || !!asset || !ready}
          />
          {stage ? <Text accessibilityLiveRegion="polite">{stage}</Text> : null}
          {working && (
            <Button
              title="Pause upload"
              onPress={() => controller.current?.abort()}
              disabled={!controller.current}
            />
          )}
          {asset && (
            <Button
              title="Discard local draft"
              disabled={working || busy}
              onPress={discard}
            />
          )}
          {asset && (
            <Text>
              Clip selected · {(new File(asset.uri).size / 1048576).toFixed(1)}{" "}
              MB
            </Text>
          )}
          <Button
            title={
              working
                ? "Working…"
                : uploaded
                  ? "Retry sharing uploaded clip"
                  : "Upload or retry sharing"
            }
            onPress={save}
            disabled={!asset || working || busy}
          />
        </View>
      )}
      {data.videos.map((v) => (
        <Button
          key={v.id}
          title={v.name + " · " + v.tags.length + " moments"}
          onPress={() => setSelected(v.id)}
        />
      ))}
      {!data.videos.length && <Text>No clips shared with your team yet.</Text>}
      {video && (
        <Review
          key={video.id}
          video={video}
          base={base}
          token={token}
          coach={coach}
          act={act}
          busy={busy}
        />
      )}
    </View>
  );
}
function Review({ video, base, token, coach, act, busy }) {
  const source = video.fileId
    ? {
        uri: base + "/api/media/" + video.fileId + "/playback",
        headers: { Authorization: "Bearer " + token },
      }
    : { uri: video.url };
  const player = useVideoPlayer(source);
  const [loopStart, setLoopStart] = useState(null),
    [loopEnd, setLoopEnd] = useState(null),
    [looping, setLooping] = useState(false);
  const loop = useRef({});
  loop.current = { loopStart, loopEnd, looping };
  useEffect(() => {
    player.timeUpdateEventInterval = 0.1;
    const listener = player.addListener("timeUpdate", ({ currentTime }) => {
      const l = loop.current;
      if (
        l.looping &&
        l.loopStart != null &&
        l.loopEnd > l.loopStart &&
        currentTime >= l.loopEnd
      )
        player.currentTime = l.loopStart;
    });
    return () => listener.remove();
  }, [player]);
  const [label, setLabel] = useState(""),
    [seconds, setSeconds] = useState(0),
    [lines, setLines] = useState([]),
    [point, setPoint] = useState(null),
    [drawing, setDrawing] = useState(false),
    [size, setSize] = useState({ width: 1, height: 1 }),
    [error, setError] = useState("");
  function seek(at) {
    player.pause();
    player.currentTime = Math.max(0, Math.min(at, player.duration || at));
    setSeconds(player.currentTime);
  }
  useEffect(() => {
    const listener = player.addListener("statusChange", (event) =>
      setError(
        event.status === "error"
          ? "This video could not be played. Check your connection and the video's format."
          : "",
      ),
    );
    return () => listener.remove();
  }, [player]);
  return (
    <View style={s.card}>
      <Text style={s.heading}>{video.name}</Text>
      <View
        style={{
          width: "100%",
          aspectRatio: 16 / 9,
          backgroundColor: "#171d24",
        }}
        onLayout={(e) => setSize(e.nativeEvent.layout)}
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          surfaceType="textureView"
          nativeControls={!drawing}
        />
        <View
          pointerEvents={drawing ? "auto" : "none"}
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => drawing}
          onResponderRelease={(e) => {
            const p = [
              (100 * e.nativeEvent.locationX) / size.width,
              (100 * e.nativeEvent.locationY) / size.height,
            ].map((n) => Math.max(0, Math.min(100, n)));
            if (point) {
              if (lines.length < 30) setLines([...lines, [...point, ...p]]);
              setPoint(null);
            } else setPoint(p);
          }}
        >
          {lines.map(([x1, y1, x2, y2], i) => {
            const dx = ((x2 - x1) * size.width) / 100,
              dy = ((y2 - y1) * size.height) / 100,
              length = Math.hypot(dx, dy);
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: ((x1 + x2) * size.width) / 200 - length / 2,
                  top: ((y1 + y2) * size.height) / 200,
                  width: length,
                  height: 3,
                  backgroundColor: "#ffd766",
                  transform: [{ rotate: Math.atan2(dy, dx) + "rad" }],
                }}
              />
            );
          })}
        </View>
      </View>
      <View style={s.row}>
        {[0.25, 0.5, 1].map((rate) => (
          <Button
            key={rate}
            title={rate + "×"}
            onPress={() => {
              player.playbackRate = rate;
            }}
          />
        ))}
        <Button title="−0.1s" onPress={() => seek(player.currentTime - 0.1)} />
        <Button title="+0.1s" onPress={() => seek(player.currentTime + 0.1)} />
        <Button title="−1s" onPress={() => seek(player.currentTime - 1)} />
        <Button title="+1s" onPress={() => seek(player.currentTime + 1)} />
      </View>
      <Text>
        Slow-motion review · 0.1-second steps are approximate, not
        frame-accurate.
      </Text>
      <Button
        title="Set loop start at playhead"
        onPress={() => {
          setLoopStart(player.currentTime);
          setLooping(false);
        }}
      />
      <Button
        title="Set loop end at playhead"
        onPress={() => {
          setLoopEnd(player.currentTime);
          setLooping(false);
        }}
      />
      <Text>
        Loop: {loopStart?.toFixed(1) ?? "—"}s to {loopEnd?.toFixed(1) ?? "—"}s
      </Text>
      <Button
        title={looping ? "Stop looping" : "Play selected loop"}
        disabled={loopStart == null || loopEnd == null || loopEnd <= loopStart}
        onPress={() => {
          setLooping(!looping);
          if (!looping) {
            player.currentTime = loopStart;
            player.play();
          }
        }}
      />
      {coach && (
        <>
          <Button
            title={
              drawing ? "Finish drawing" : "Pause and annotate this moment"
            }
            onPress={() => {
              player.pause();
              setLooping(false);
              setSeconds(player.currentTime);
              setPoint(null);
              setDrawing(!drawing);
            }}
          />
          <Text>
            {seconds.toFixed(1)}s · Tap two points to draw a line on the
            displayed frame.
          </Text>
          <Button
            title="Undo last line"
            onPress={() => {
              setLines((a) => a.slice(0, -1));
              setPoint(null);
            }}
          />
          <Button
            title="Clear drawing"
            onPress={() => {
              setLines([]);
              setPoint(null);
            }}
          />
          <TextInput
            style={s.input}
            placeholder="Coaching note"
            accessibilityLabel="Coaching note"
            maxLength={160}
            value={label}
            onChangeText={setLabel}
          />
          <Button
            title="Save moment"
            disabled={busy || !label.trim()}
            onPress={async () => {
              setError("");
              if (
                await act("video-tag", { id: video.id, seconds, label, lines })
              ) {
                setLabel("");
                setLines([]);
                setDrawing(false);
              }
            }}
          />
        </>
      )}
      {error ? <Text>{error}</Text> : null}
      {video.tags.map((t) => (
        <Button
          key={t.id}
          title={t.seconds.toFixed(1) + "s · " + t.label}
          onPress={() => {
            seek(t.seconds);
            setLines(t.lines || []);
            setDrawing(false);
          }}
        />
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    marginVertical: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "white",
    gap: 8,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: headingFont,
    color: "#171d24",
  },
  button: {
    backgroundColor: "#171d24",
    padding: 12,
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 10,
    marginVertical: 4,
  },
  input: {
    fontSize: 16,
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#c4d9e7",
    padding: 12,
    borderRadius: 8,
  },
  row: { flexDirection: "row", gap: 5, flexWrap: "wrap" },
  error: { color: "#a12929" },
});
