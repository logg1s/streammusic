import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Artwork } from "@/components/artwork";
import { useSmoothTime } from "@/lib/use-smooth-time";
import { colors, font, layout, onAccent, radius, spacing } from "@/theme";
import { useCurrentTrack, usePlayer } from "@/store/player";

/**
 * Vạch tiến độ mảnh, tách riêng để nội suy mượt (~60 fps) mà không dựng lại cả thanh
 * phát mỗi khung hình — xem `useSmoothTime`.
 */
function MiniProgress() {
  const smooth = useSmoothTime();
  const duration = usePlayer((s) => s.duration);
  const progress = duration > 0 ? Math.min(1, smooth / duration) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
    </View>
  );
}

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
  const error = usePlayer((s) => s.error);

  // Hàng đợi rỗng thì không có gì để điều khiển.
  if (!track) return null;

  return (
    <View>
      {/* Lỗi phát nằm trong màn hình phát toàn cảnh, mà thanh này lại là chỗ duy nhất
          người dùng thấy khi đang duyệt thư viện — im lặng thì tiếng tắt mà không rõ vì sao. */}
      {error ? (
        <Text style={styles.error} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      <Pressable
        style={styles.bar}
        accessibilityRole="button"
        accessibilityLabel={`Mở màn hình phát: ${track.title}`}
        onPress={() => router.push("/player")}
      >
        <MiniProgress />

        <View style={styles.row}>
          <Artwork url={track.coverUrl} name={track.title} size={44} />

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
            style={styles.playButton}
            accessibilityRole="button"
            accessibilityLabel={isPlaying ? "Tạm dừng" : "Phát"}
            onPress={() => usePlayer.getState().toggle()}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={20}
              color={onAccent}
              // Tam giác play của Ionicons lệch quang học sang trái một chút.
              style={isPlaying ? undefined : styles.playNudge}
            />
          </Pressable>

          <Pressable
            style={styles.button}
            accessibilityRole="button"
            accessibilityLabel="Bài sau"
            onPress={() => usePlayer.getState().next()}
          >
            <Ionicons name="play-skip-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: layout.playerBarHeight,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  error: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    color: colors.danger,
    fontSize: font.xs,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
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
  playButton: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  playNudge: {
    marginLeft: 2,
  },
  button: {
    minWidth: 40,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
});
