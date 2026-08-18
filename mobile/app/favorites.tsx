import { useMemo } from "react";
import { FlatList } from "react-native";
import { Stack } from "expo-router";
import {
  EmptyNote,
  ErrorNote,
  Loading,
  Screen,
  useContentInsets,
} from "@/components/screen";
import { useFavorites } from "@/components/favorites-provider";
import { TRACK_ROW_HEIGHT, TrackRow } from "@/components/track-row";
import type { TrackList } from "@/lib/dto";
import { useApi } from "@/lib/use-api";

export default function FavoritesScreen() {
  const favorites = useFavorites();
  const result = useApi<TrackList>("/api/favorites");
  const content = useContentInsets();
  const tracks = useMemo(
    () => (result.data?.tracks ?? []).filter((track) => favorites.ids.has(track.id)),
    [favorites.ids, result.data?.tracks],
  );

  return (
    <>
      <Stack.Screen options={{ title: "Yêu thích" }} />
      <Screen>
        {result.loading && result.data === null ? <Loading /> : null}
        {result.error && result.data === null ? (
          <ErrorNote message={result.error} onRetry={result.reload} />
        ) : null}
        {!result.loading && !result.error && tracks.length === 0 ? (
          <EmptyNote
            title="Chưa có bài yêu thích"
            hint="Bấm biểu tượng trái tim ở một bài để lưu vào danh sách này."
          />
        ) : null}
        {tracks.length > 0 ? (
          <FlatList
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
          />
        ) : null}
      </Screen>
    </>
  );
}
