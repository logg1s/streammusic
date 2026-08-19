import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import type { PlayableTrack } from "@vong/shared";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Readout,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { TRACK_ROW_HEIGHT, TrackRow } from "@/components/track-row";
import { formatLibraryStats } from "@/lib/format";
import type { TracksPage } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, spacing } from "@/theme";

/**
 * Toàn bộ bài hát, phân trang 200 bài một trang giống bản web.
 *
 * Không cuộn vô hạn: `getAllTracks` sắp theo tên nên người ta dùng trang để nhảy tới
 * vùng chữ cái mình cần, còn cuộn vô hạn thì phải nạp tuần tự từ đầu.
 */
export default function TracksScreen() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<TracksPage>(
    `/api/library/tracks?page=${page}`,
  );
  const content = useContentInsets();
  const listRef = useRef<FlatList<PlayableTrack>>(null);

  // Đổi trang mà giữ nguyên vị trí cuộn thì người ta tưởng bấm không ăn.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [page]);

  if (loading && data === null) {
    return (
      <Screen scroll>
        <Loading />
      </Screen>
    );
  }

  if (error !== null && data === null) {
    return (
      <Screen scroll>
        <ErrorNote message={error} onRetry={reload} />
      </Screen>
    );
  }

  if (data === null) return null;
  const tracks = data.tracks;

  return (
    <Screen>
      <FlatList
        ref={listRef}
        data={tracks}
        keyExtractor={(track) => track.id}
        renderItem={({ item, index }) => (
          <TrackRow track={item} tracks={tracks} index={index} />
        )}
        contentContainerStyle={content}
        getItemLayout={(_, index) => ({
          length: TRACK_ROW_HEIGHT,
          offset: TRACK_ROW_HEIGHT * index,
          index,
        })}
        ListHeaderComponent={
          <>
            <View style={styles.shortcuts}>
              <LibraryShortcut
                icon="disc-outline"
                label="Album"
                onPress={() => router.push("/albums")}
              />
              <LibraryShortcut
                icon="list-outline"
                label="Playlist"
                onPress={() => router.push("/playlists")}
              />
              <LibraryShortcut
                icon="heart-outline"
                label="Yêu thích"
                onPress={() => router.push("/favorites" as Href)}
              />
            </View>
            <Readout
              text={`${formatLibraryStats(data.stats)}  ·  trang ${data.page}/${data.totalPages}`}
            />
          </>
        }
        ListEmptyComponent={
          <EmptyNote
            title="Chưa có bài nào"
            hint="Vào Cài đặt, nối một kho lưu trữ rồi quét thư mục nhạc để bắt đầu."
          />
        }
        ListFooterComponent={
          data.totalPages > 1 ? (
            <View style={styles.pager}>
              <PagerButton
                label="← Trang trước"
                disabled={data.page <= 1}
                onPress={() => setPage(data.page - 1)}
              />
              <Text style={styles.pagerLabel}>
                Trang {data.page}/{data.totalPages}
              </Text>
              <PagerButton
                label="Trang sau →"
                disabled={data.page >= data.totalPages}
                onPress={() => setPage(data.page + 1)}
              />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function LibraryShortcut({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={colors.accentText} />
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

function PagerButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={spacing.sm}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      <Text style={[styles.pagerAction, disabled && styles.pagerDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shortcuts: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  shortcut: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  shortcutText: {
    color: colors.text,
    fontSize: font.xs,
    fontWeight: "700",
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pagerAction: {
    color: colors.accent,
    fontSize: font.sm,
  },
  pagerDisabled: {
    color: colors.border,
  },
  pagerLabel: {
    color: colors.subtle,
    fontSize: font.xs,
  },
  pressed: {
    opacity: 0.6,
  },
});
