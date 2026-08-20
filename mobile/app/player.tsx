import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { QueueSheet } from "@/components/player/queue-sheet";
import { Scrubber } from "@/components/player/scrubber";
import { PROVIDER_LABEL } from "@/lib/format";
import { colors, font, onAccent, radius, spacing } from "@/theme";
import { useCurrentTrack, usePlayer } from "@/store/player";

function shortCodec(codec: string | null): string | null {
  if (!codec) return null;
  const value = codec.toLowerCase();
  if (value.includes("layer 3") || value.includes("mp3")) return "MP3";
  if (value.includes("aac")) return "AAC";
  if (value.includes("flac")) return "FLAC";
  if (value.includes("opus")) return "OPUS";
  if (value.includes("vorbis")) return "VORBIS";
  if (value.includes("alac")) return "ALAC";
  if (value.includes("pcm") || value.includes("wav")) return "WAV";
  return codec.toUpperCase().slice(0, 8);
}

/** Now Playing stays within one viewport; the queue owns a separate modal sheet. */
export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const track = useCurrentTrack();
  const isPlaying = usePlayer((state) => state.isPlaying);
  const isBuffering = usePlayer((state) => state.isBuffering);
  const shuffle = usePlayer((state) => state.shuffle);
  const repeat = usePlayer((state) => state.repeat);
  const error = usePlayer((state) => state.error);
  const radio = usePlayer((state) => state.radio);
  const queueLength = usePlayer((state) => state.order.length);
  const [queueOpen, setQueueOpen] = useState(false);

  if (!track) {
    return (
      <View style={[styles.screen, styles.empty, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng màn hình phát"
          onPress={() => router.back()}
          style={styles.emptyClose}
        >
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </Pressable>
        <Ionicons name="musical-notes-outline" size={46} color={colors.subtle} />
        <Text style={styles.emptyTitle}>Chưa có bài nào đang phát</Text>
        <Text style={styles.emptyText}>Chọn một bài trong thư viện để bắt đầu.</Text>
      </View>
    );
  }

  const artSize = Math.max(184, Math.min(width - 48, height * 0.38, 420));
  const sourceParts = [
    track.provider ? PROVIDER_LABEL[track.provider] : null,
    shortCodec(track.codec),
    track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null,
  ].filter((part): part is string => part !== null);

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      {track.coverUrl ? (
        <View pointerEvents="none" style={styles.ambient}>
          <Image
            source={{ uri: track.coverUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={72}
          />
          <LinearGradient
            colors={["rgba(9,10,12,0.28)", "rgba(9,10,12,0.82)", colors.bg]}
            locations={[0, 0.46, 0.86]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng màn hình phát"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.nowPlayingLabel}>Đang phát</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mở hàng đợi, ${queueLength} bài`}
          onPress={() => setQueueOpen(true)}
          style={({ pressed }) => [styles.queueButton, pressed && styles.pressed]}
        >
          <Ionicons name="list" size={21} color={colors.accent} />
          <Text style={styles.queueButtonLabel}>Hàng đợi</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={[styles.coverShadow, { width: artSize, height: artSize }]}>
          {track.coverUrl ? (
            <Image
              source={{ uri: track.coverUrl }}
              style={styles.cover}
              contentFit="cover"
              transition={180}
            />
          ) : (
            <View style={[styles.cover, styles.coverEmpty]}>
              <Ionicons name="musical-notes" size={64} color={colors.subtle} />
            </View>
          )}
        </View>

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {track.title}
          </Text>
          <Pressable
            disabled={!track.artistId}
            accessibilityRole={track.artistId ? "link" : undefined}
            onPress={() =>
              track.artistId
                ? router.push({
                    pathname: "/artists/[id]",
                    params: { id: track.artistId },
                  })
                : undefined
            }
          >
            <Text
              style={[styles.artist, track.artistId && styles.artistLink]}
              numberOfLines={1}
            >
              {track.artistName ?? "Không rõ nghệ sĩ"}
            </Text>
          </Pressable>
          {sourceParts.length > 0 ? (
            <Text style={styles.source} numberOfLines={1}>
              {sourceParts.join(" · ").toUpperCase()}
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <Scrubber />

        <View style={styles.controls}>
          <TransportIcon
            label={shuffle ? "Tắt xáo bài" : "Xáo bài"}
            icon="shuffle"
            active={shuffle}
            onPress={() => usePlayer.getState().toggleShuffle()}
          />
          <TransportIcon
            label="Bài trước"
            icon="play-skip-back"
            size={30}
            onPress={() => usePlayer.getState().previous()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Tạm dừng" : "Phát"}
            onPress={() => usePlayer.getState().toggle()}
            style={({ pressed }) => [styles.playButton, pressed && styles.playPressed]}
          >
            {isBuffering && isPlaying ? (
              <ActivityIndicator color={onAccent} />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={32}
                color={onAccent}
                style={isPlaying ? undefined : styles.playNudge}
              />
            )}
          </Pressable>
          <TransportIcon
            label="Bài sau"
            icon="play-skip-forward"
            size={30}
            onPress={() => usePlayer.getState().next()}
          />
          <TransportIcon
            label={repeat === "off" ? "Bật lặp" : "Đổi chế độ lặp"}
            icon="repeat"
            active={repeat !== "off"}
            badge={repeat === "one" ? "1" : undefined}
            onPress={() => usePlayer.getState().cycleRepeat()}
          />
        </View>

        {radio ? (
          <View style={styles.radioRow}>
            <Ionicons name="radio" size={23} color={colors.accent} />
            <View style={styles.radioCopy}>
              <Text style={styles.radioTitle} numberOfLines={1}>
                Radio từ bài này
              </Text>
              <Text style={styles.radioHint} numberOfLines={1}>
                {radio.status === "loading"
                  ? "Đang tìm bài tương tự…"
                  : `Từ ${radio.seedLabel}`}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dừng radio"
              onPress={() => usePlayer.getState().stopRadio()}
              style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}
            >
              <Ionicons name="stop-circle-outline" size={21} color={colors.muted} />
              <Text style={styles.stopLabel}>Dừng</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <QueueSheet visible={queueOpen} onClose={() => setQueueOpen(false)} />
    </View>
  );
}

function TransportIcon({
  label,
  icon,
  onPress,
  active = false,
  size = 24,
  badge,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  active?: boolean;
  size?: number;
  badge?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.sideButton, pressed && styles.pressed]}
    >
      <Ionicons
        name={icon}
        size={size}
        color={active ? colors.accent : colors.text}
      />
      {active ? <View style={styles.activeDot} /> : null}
      {badge ? <Text style={styles.repeatBadge}>{badge}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: "hidden", backgroundColor: colors.bg },
  ambient: { position: "absolute", inset: 0, opacity: 0.76 },
  empty: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyClose: { position: "absolute", top: 16, left: 12, width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: spacing.md, color: colors.text, fontSize: font.lg, fontWeight: "700" },
  emptyText: { marginTop: spacing.xs, color: colors.muted, fontSize: font.sm },
  topBar: { height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md },
  headerIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  nowPlayingLabel: { color: colors.text, fontSize: font.md, fontWeight: "800" },
  queueButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: "rgba(18,20,23,0.72)" },
  queueButtonLabel: { color: colors.accentText, fontSize: font.sm, fontWeight: "700" },
  content: { flex: 1, alignItems: "stretch", paddingHorizontal: spacing.xl },
  coverShadow: { alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 26, shadowOffset: { width: 0, height: 14 }, elevation: 18 },
  cover: { width: "100%", height: "100%", borderRadius: radius.lg, backgroundColor: colors.surface },
  coverEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { marginBottom: spacing.md },
  title: { color: colors.text, fontSize: font.xl, fontWeight: "800", letterSpacing: -0.35 },
  artist: { marginTop: spacing.xs, color: colors.muted, fontSize: font.md, fontWeight: "600" },
  artistLink: { color: colors.accentText },
  source: { marginTop: spacing.xs, color: colors.subtle, fontSize: font.xs, letterSpacing: 0.75 },
  error: { marginTop: spacing.xs, color: colors.danger, fontSize: font.xs },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.lg },
  sideButton: { minWidth: 44, height: 54, alignItems: "center", justifyContent: "center" },
  activeDot: { position: "absolute", bottom: 3, width: 4, height: 4, borderRadius: radius.full, backgroundColor: colors.accent },
  repeatBadge: { position: "absolute", top: 2, right: 5, color: colors.accent, fontSize: 9, fontWeight: "800" },
  playButton: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.36, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 9 },
  playPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  playNudge: { marginLeft: 3 },
  radioRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong, borderRadius: radius.md, backgroundColor: "rgba(18,20,23,0.72)" },
  radioCopy: { flex: 1 },
  radioTitle: { color: colors.text, fontSize: font.sm, fontWeight: "700" },
  radioHint: { marginTop: 2, color: colors.subtle, fontSize: font.xs },
  stopButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  stopLabel: { color: colors.muted, fontSize: font.sm, fontWeight: "600" },
  pressed: { opacity: 0.62 },
});
