import { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { PlayableTrack } from "@vong/shared";
import { AddToPlaylistSheet } from "@/components/add-to-playlist-sheet";
import { Artwork } from "@/components/artwork";
import { useFavorites } from "@/components/favorites-provider";
import { formatDuration, trackSubtitle } from "@/lib/format";
import { startRadioFor } from "@/lib/radio-engine";
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
 *
 * `radioOnTap` cho danh sách "bài lẻ" (nghe gần đây, kết quả tìm, gợi ý): bấm là seed
 * radio từ đúng bài đó thay vì phát cả danh sách. Ở album/playlist thì để tắt.
 *
 * Nhấn giữ mở hộp thêm vào playlist. Không có nút riêng: dòng bài chỉ cao 60px và đã
 * mang bìa, tiêu đề, huy hiệu YT và thời lượng — thêm một nút nữa là chật.
 */
export const TrackRow = memo(function TrackRow({
  track,
  tracks,
  index,
  showArtwork = true,
  radioOnTap = false,
}: {
  track: PlayableTrack;
  tracks: PlayableTrack[];
  index: number;
  showArtwork?: boolean;
  radioOnTap?: boolean;
}) {
  const isCurrent = useIsCurrentTrack(track.id);
  const [adding, setAdding] = useState(false);
  const favorites = useFavorites();
  const favorite = favorites.ids.has(track.id);

  return (
    <>
      <Pressable
        onPress={() => {
          if (radioOnTap) void startRadioFor(track);
          else usePlayer.getState().playQueue(tracks, index);
        }}
        onLongPress={() => setAdding(true)}
        accessibilityHint="Nhấn giữ để thêm vào playlist"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        {showArtwork ? (
          <Artwork
            url={track.coverUrl}
            name={track.title}
            size={44}
            rounded="sm"
          />
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            favorite ? "Bỏ khỏi Yêu thích" : "Thêm vào Yêu thích"
          }
          disabled={favorites.pending.has(track.id)}
          hitSlop={spacing.sm}
          onPress={(event) => {
            event.stopPropagation();
            void favorites.toggle(track.id).catch(() => undefined);
          }}
          style={styles.favorite}
        >
          <Ionicons
            name={favorite ? "heart" : "heart-outline"}
            size={18}
            color={favorite ? colors.accent : colors.muted}
          />
        </Pressable>
        <Text style={styles.duration}>{formatDuration(track.durationSec)}</Text>
      </Pressable>

      {adding ? (
        <AddToPlaylistSheet track={track} onClose={() => setAdding(false)} />
      ) : null}
    </>
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
    color: colors.accentText,
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
  favorite: {
    width: 28,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
});
