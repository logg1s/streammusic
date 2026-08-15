import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { colors, font, layout, radius, spacing } from "@/theme";
import { useCurrentTrack, usePlayer } from "@/store/player";

/**
 * Thanh phát nhỏ, luôn thấy được khi có bài trong hàng đợi.
 *
 * KHÔNG tự định vị: `app/_layout.tsx` bọc nó trong một View đã tính chỗ theo tab bar và
 * safe area. Ở đây chỉ là một dải ngang bình thường.
 */
export function PlayerBar() {
  const router = useRouter();
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const isBuffering = usePlayer((s) => s.isBuffering);
  const progress = usePlayer((s) =>
    s.duration > 0 ? Math.min(1, s.currentTime / s.duration) : 0,
  );

  // Hàng đợi rỗng thì không có gì để điều khiển.
  if (!track) return null;

  return (
    <Pressable
      style={styles.bar}
      accessibilityRole="button"
      accessibilityLabel={`Mở màn hình phát: ${track.title}`}
      onPress={() => router.push("/player")}
    >
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.row}>
        {track.coverUrl ? (
          <Image
            source={{ uri: track.coverUrl }}
            style={styles.cover}
            contentFit="cover"
            transition={120}
          />
        ) : (
          <View style={[styles.cover, styles.coverEmpty]}>
            <Text style={styles.coverGlyph}>♪</Text>
          </View>
        )}

        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {isBuffering
              ? "Đang tải…"
              : (track.artistName ?? "Không rõ nghệ sĩ")}
          </Text>
        </View>

        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Tạm dừng" : "Phát"}
          onPress={() => usePlayer.getState().toggle()}
        >
          <Text style={styles.glyph}>{isPlaying ? "▮▮" : "▶"}</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Bài sau"
          onPress={() => usePlayer.getState().next()}
        >
          <Text style={styles.glyph}>▶▶</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: layout.playerBarHeight,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progressTrack: {
    height: 2,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: 2,
    backgroundColor: colors.accent,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  coverGlyph: {
    color: colors.subtle,
    fontSize: font.lg,
  },
  meta: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: font.sm,
    fontWeight: "600",
  },
  artist: {
    color: colors.muted,
    fontSize: font.xs,
    marginTop: 2,
  },
  button: {
    minWidth: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    color: colors.text,
    fontSize: font.md,
  },
});
