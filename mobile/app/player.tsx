import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Scrubber } from "@/components/player/scrubber";
import { accentText, colors, font, radius, spacing } from "@/theme";
import { useCurrentTrack, usePlayer } from "@/store/player";

/**
 * Màn hình phát toàn cảnh: ảnh bìa lớn, thanh tua kéo được, và cả hàng đợi.
 *
 * Mọi nút đều gọi store — engine native nghe store rồi mới ra tiếng. Không màn hình
 * nào được gọi thẳng `VongAudio`, nếu không trạng thái hiển thị và tiếng thật sẽ lệch.
 */

/** Giây → "m:ss" (hoặc "h:mm:ss" cho bài dài hơn một giờ). */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export default function PlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const track = useCurrentTrack();

  const isPlaying = usePlayer((s) => s.isPlaying);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const error = usePlayer((s) => s.error);
  const queue = usePlayer((s) => s.queue);
  const order = usePlayer((s) => s.order);
  const position = usePlayer((s) => s.position);

  if (!track) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyText}>Chưa có bài nào trong hàng đợi.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng màn hình phát"
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <Ionicons name="chevron-down" size={24} color={colors.muted} />
        </Pressable>
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      {/* Nền chìm: ảnh bìa phóng to + làm mờ, phủ gradient tan dần vào nền tối. Đây là
          "hồn" của màn hình phát đắm chìm — màu của bài hát tràn ra sau chữ. */}
      {track.coverUrl ? (
        <View style={styles.headerBg} pointerEvents="none">
          <Image
            source={{ uri: track.coverUrl }}
            style={StyleSheet.absoluteFill}
            blurRadius={60}
            contentFit="cover"
            transition={240}
          />
          <LinearGradient
            colors={["rgba(11,11,15,0.35)", "rgba(11,11,15,0.72)", colors.bg]}
            locations={[0, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Đóng màn hình phát"
        onPress={() => router.back()}
        style={styles.closeButton}
      >
        <Ionicons name="chevron-down" size={24} color={colors.text} />
      </Pressable>

      <View style={styles.coverShadow}>
        {track.coverUrl ? (
          <Image
            source={{ uri: track.coverUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={160}
          />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Ionicons name="musical-notes" size={72} color={colors.subtle} />
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artistName ?? "Không rõ nghệ sĩ"}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Scrubber />

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shuffle ? "Tắt xáo bài" : "Xáo bài"}
          onPress={() => usePlayer.getState().toggleShuffle()}
          style={styles.sideButton}
        >
          <Ionicons
            name="shuffle"
            size={24}
            color={shuffle ? colors.accent : colors.muted}
          />
          {shuffle ? <View style={styles.activeDot} /> : null}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bài trước"
          onPress={() => usePlayer.getState().previous()}
          style={styles.stepButton}
        >
          <Ionicons name="play-skip-back" size={30} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Tạm dừng" : "Phát"}
          onPress={() => usePlayer.getState().toggle()}
          style={styles.playButton}
        >
          {isBuffering && isPlaying ? (
            <ActivityIndicator color={accentText} />
          ) : (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={32}
              color={accentText}
              style={isPlaying ? undefined : styles.playNudge}
            />
          )}
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bài sau"
          onPress={() => usePlayer.getState().next()}
          style={styles.stepButton}
        >
          <Ionicons name="play-skip-forward" size={30} color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            repeat === "off"
              ? "Lặp: tắt"
              : repeat === "all"
                ? "Lặp: cả hàng đợi"
                : "Lặp: một bài"
          }
          onPress={() => usePlayer.getState().cycleRepeat()}
          style={styles.sideButton}
        >
          <Ionicons
            name="repeat"
            size={24}
            color={repeat !== "off" ? colors.accent : colors.muted}
          />
          {repeat === "one" ? (
            <Text style={styles.repeatBadge}>1</Text>
          ) : repeat !== "off" ? (
            <View style={styles.activeDot} />
          ) : null}
        </Pressable>
      </View>

      <Text style={styles.queueHeading}>
        Hàng đợi · {order.length} bài
      </Text>
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.xl,
      }}
      data={order}
      keyExtractor={(queueIndex, orderPos) =>
        `${orderPos}:${queue[queueIndex]?.id ?? queueIndex}`
      }
      ListHeaderComponent={header}
      renderItem={({ item: queueIndex, index: orderPos }) => {
        const row = queue[queueIndex];
        if (!row) return null;
        const active = orderPos === position;
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => usePlayer.getState().playTrackAt(orderPos)}
            style={[styles.queueRow, active && styles.queueRowActive]}
          >
            {active ? (
              <View style={styles.queueIndex}>
                <Ionicons name="volume-high" size={15} color={colors.accent} />
              </View>
            ) : (
              <Text style={styles.queueIndexText}>
                {String(orderPos + 1)}
              </Text>
            )}
            <View style={styles.queueMeta}>
              <Text
                style={[styles.queueTitle, active && styles.activeGlyph]}
                numberOfLines={1}
              >
                {row.title}
              </Text>
              <Text style={styles.queueArtist} numberOfLines={1}>
                {row.artistName ?? "Không rõ nghệ sĩ"}
              </Text>
            </View>
            <Text style={styles.queueTime}>
              {row.durationSec === null ? "" : formatTime(row.durationSec)}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  emptyText: {
    color: colors.muted,
    fontSize: font.md,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  /** Nền chìm phủ hết vùng header (ảnh mờ + gradient), nằm dưới mọi nội dung. */
  headerBg: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  closeButton: {
    alignSelf: "flex-start",
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  coverShadow: {
    // Bóng đổ chỉ ăn khi ảnh không bị `overflow: hidden` cắt — nên bọc ngoài.
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
    marginBottom: spacing.xl,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  cover: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontSize: font.xxl,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  artist: {
    color: colors.muted,
    fontSize: font.md,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  error: {
    color: colors.accent,
    fontSize: font.sm,
    marginTop: spacing.sm,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  sideButton: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Chấm nhỏ dưới icon shuffle/repeat, báo trạng thái đang bật. */
  activeDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  /** Số "1" nhỏ đè góc icon repeat khi lặp một bài. */
  repeatBadge: {
    position: "absolute",
    top: 4,
    right: 6,
    color: colors.accent,
    fontSize: 9,
    fontWeight: "800",
  },
  activeGlyph: {
    color: colors.accent,
  },
  stepButton: {
    minWidth: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  playNudge: {
    marginLeft: 3,
  },
  queueHeading: {
    color: colors.subtle,
    fontSize: font.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  queueRowActive: {
    backgroundColor: colors.accentSoft,
  },
  queueIndex: {
    width: 24,
    alignItems: "center",
  },
  queueIndexText: {
    width: 24,
    textAlign: "center",
    color: colors.subtle,
    fontSize: font.sm,
    fontVariant: ["tabular-nums"],
  },
  queueMeta: {
    flex: 1,
  },
  queueTitle: {
    color: colors.text,
    fontSize: font.sm,
  },
  queueArtist: {
    color: colors.muted,
    fontSize: font.xs,
    marginTop: 2,
  },
  queueTime: {
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
});
