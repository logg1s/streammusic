import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { DetailHeader } from "@/components/detail-header";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { TRACK_ROW_HEIGHT, TrackRow } from "@/components/track-row";
import { formatLongDuration, formatNumber } from "@/lib/format";
import type { AlbumDetail } from "@/lib/dto";
import { useApi } from "@/lib/use-api";
import { colors, font, spacing } from "@/theme";

export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, reload } = useApi<AlbumDetail>(
    `/api/library/albums/${id}`,
  );
  const content = useContentInsets();

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

  const { album, tracks } = data;
  // Ràng vào `const` để TypeScript giữ được kết quả thu hẹp bên trong closure onPress.
  const artistId = album.artistId;
  const totalSeconds = tracks.reduce(
    (sum, track) => sum + (track.durationSec ?? 0),
    0,
  );
  const subtitle = [
    album.artistName ?? "Không rõ nghệ sĩ",
    album.year !== null ? String(album.year) : null,
    `${formatNumber(tracks.length)} bài`,
    formatLongDuration(totalSeconds),
  ]
    .filter((part): part is string => part !== null)
    .join("  ·  ");

  return (
    <Screen>
      <Stack.Screen options={{ title: album.title }} />
      <FlatList
        data={tracks}
        keyExtractor={(track) => track.id}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            tracks={tracks}
            index={index}
            showArtwork={false}
          />
        )}
        contentContainerStyle={content}
        getItemLayout={(_, index) => ({
          length: TRACK_ROW_HEIGHT,
          offset: TRACK_ROW_HEIGHT * index,
          index,
        })}
        ListHeaderComponent={
          <>
            <DetailHeader
              coverUrl={album.coverUrl}
              title={album.title}
              subtitle={subtitle}
              tracks={tracks}
            />
            {artistId !== null ? (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/artists/[id]",
                    params: { id: artistId },
                  })
                }
                style={({ pressed }) => (pressed ? styles.pressed : undefined)}
              >
                <Text style={styles.artistLink}>
                  Xem tất cả của {album.artistName ?? "nghệ sĩ này"}
                </Text>
              </Pressable>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <EmptyNote title="Album này chưa có bài nào" />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  artistLink: {
    color: colors.accent,
    fontSize: font.sm,
    marginBottom: spacing.xl,
  },
  pressed: {
    opacity: 0.6,
  },
});
