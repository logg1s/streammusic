import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlayableTrack } from "@vong/shared";
import { Artwork } from "@/components/artwork";
import { formatDuration, trackSubtitle } from "@/lib/format";
import { useIsCurrentTrack, usePlayer } from "@/store/player";
import { colors, font, radius, spacing } from "@/theme";

export const TRACK_ROW_HEIGHT = 60;

/**
 * Một dòng bài hát.
 *
 * Bấm vào là phát cả danh sách đang xem từ đúng dòng đó — vì thế phải nhận `tracks`
 * chứ không chỉ một bài: nghe một bài giữa album rồi bài sau tự chạy tiếp là hành vi
 * người ta chờ đợi. Lệnh phát đi qua store dùng chung, không bao giờ gọi module native
 * trực tiếp.
 */
export const TrackRow = memo(function TrackRow({
  track,
  tracks,
  index,
  showArtwork = true,
}: {
  track: PlayableTrack;
  tracks: PlayableTrack[];
  index: number;
  showArtwork?: boolean;
}) {
  const isCurrent = useIsCurrentTrack(track.id);

  return (
    <Pressable
      onPress={() => usePlayer.getState().playQueue(tracks, index)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {showArtwork ? (
        <Artwork url={track.coverUrl} name={track.title} size={44} rounded="sm" />
      ) : (
        <Text style={[styles.ordinal, isCurrent && styles.currentText]}>
          {track.trackNo ?? index + 1}
        </Text>
      )}

      <View style={styles.body}>
        <Text
          numberOfLines={1}
          style={[styles.title, isCurrent && styles.currentText]}
        >
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {trackSubtitle(track)}
        </Text>
      </View>

      {track.source === "youtube" ? (
        <Text style={styles.badge}>YT</Text>
      ) : null}
      <Text style={styles.duration}>{formatDuration(track.durationSec)}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: TRACK_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.surface,
  },
  ordinal: {
    width: 44,
    textAlign: "center",
    color: colors.subtle,
    fontSize: font.sm,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: font.md,
  },
  currentText: {
    color: colors.accent,
    fontWeight: "600",
  },
  subtitle: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  badge: {
    color: colors.muted,
    fontSize: font.xs,
    fontWeight: "700",
    letterSpacing: 0.6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  duration: {
    color: colors.subtle,
    fontSize: font.xs,
    fontVariant: ["tabular-nums"],
  },
});
