import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlayableTrack } from "@vong/shared";
import { Artwork } from "@/components/artwork";
import { usePlayer } from "@/store/player";
import { accentText, colors, font, radius, spacing } from "@/theme";

/**
 * Đầu trang chi tiết (album, nghệ sĩ, playlist): ảnh bìa, tên, dòng phụ và một nút phát.
 *
 * Nút phát nạp **cả** danh sách vào hàng đợi từ bài đầu, qua store dùng chung — cùng
 * một đường với việc bấm một dòng bài, chỉ khác chỉ số bắt đầu.
 */
export function DetailHeader({
  coverUrl,
  title,
  subtitle,
  tracks,
  round = false,
  actionLabel = "Phát tất cả",
}: {
  coverUrl: string | null;
  title: string;
  subtitle: string;
  tracks: PlayableTrack[];
  /** Ảnh tròn cho nghệ sĩ, vuông cho album và playlist. */
  round?: boolean;
  actionLabel?: string;
}) {
  return (
    <View style={styles.root}>
      <Artwork
        url={coverUrl}
        name={title}
        size={120}
        rounded={round ? "full" : "lg"}
      />
      <View style={styles.meta}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {tracks.length > 0 ? (
          <Pressable
            onPress={() => usePlayer.getState().playQueue(tracks, 0)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Ionicons name="play" size={14} color={accentText} />
            <Text style={styles.buttonLabel}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  meta: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.xl,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.subtle,
    fontSize: font.xs,
    marginBottom: spacing.sm,
  },
  button: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: accentText,
    fontSize: font.sm,
    fontWeight: "700",
  },
});
